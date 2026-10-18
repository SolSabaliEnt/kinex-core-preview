import "dotenv/config";
import { supabase } from "./supabaseClient.js";
function daysAgoIso(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}
function asTemplateSource(v) {
    return v === "segment_preference" ||
        v === "creative_recommendation" ||
        v === "decision" ||
        v === "fallback"
        ? v
        : "unknown";
}
function parseCreativeExecution(decision) {
    const raw = decision?.creative_execution;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { templateSource: "unknown", usedFallback: false, offerApplied: false };
    }
    const obj = raw;
    return {
        templateSource: asTemplateSource(obj.templateSource),
        usedFallback: obj.usedFallback === true,
        offerApplied: obj.offerStatus === "applied",
    };
}
function derivePromotionReview(perf, advisory) {
    const reasons = [];
    const sampleSends = typeof perf.sends === "number" ? perf.sends : 0;
    const outboundRows = advisory?.outboundRows ?? 0;
    const linkedCoverage = advisory && outboundRows > 0 ? advisory.linkedDecisionRows / outboundRows : null;
    const unknownShare = advisory && outboundRows > 0 ? (advisory.byTemplateSource.unknown ?? 0) / outboundRows : null;
    const fallbackShare = advisory && outboundRows > 0 ? advisory.usedFallbackCount / outboundRows : null;
    if (sampleSends < 100)
        reasons.push("low_sample");
    if (linkedCoverage !== null && linkedCoverage < 0.5)
        reasons.push("low_linked_coverage");
    if (unknownShare !== null && unknownShare > 0.5)
        reasons.push("high_unknown_provenance");
    if (fallbackShare !== null && fallbackShare > 0.6)
        reasons.push("fallback_heavy");
    let level = "strong";
    if (reasons.some((r) => r === "low_sample" || r === "low_linked_coverage")) {
        level = "thin";
    }
    else if (reasons.length > 0) {
        level = "mixed";
    }
    return {
        level,
        reasons,
        sampleSends,
        linkedCoverage,
        unknownShare,
        fallbackShare,
    };
}
async function buildVariantProvenanceAdvisory(variantKey, lookbackDays = 7) {
    const sinceIso = daysAgoIso(lookbackDays);
    const zeroBySource = {
        segment_preference: 0,
        creative_recommendation: 0,
        decision: 0,
        fallback: 0,
        unknown: 0,
    };
    const { data: outboundRows, error: outboundError } = await supabase
        .from("outbound_email_logs")
        .select("source_event_id, status, opened_at, clicked_at")
        .eq("template_key", variantKey)
        .gte("created_at", sinceIso)
        .not("source_event_id", "is", null);
    if (outboundError) {
        console.error("[AI Optimization] Failed to load outbound rows for advisory", {
            variant_key: variantKey,
            error: outboundError.message,
        });
        return {
            outboundRows: 0,
            linkedDecisionRows: 0,
            byTemplateSource: zeroBySource,
            usedFallbackCount: 0,
            offerAppliedCount: 0,
            sentCount: 0,
            failedCount: 0,
            openedCount: 0,
            clickedCount: 0,
        };
    }
    const outbound = (outboundRows ?? []);
    const eventIds = [
        ...new Set(outbound
            .map((r) => r.source_event_id)
            .filter((id) => typeof id === "string" && id.length > 0)),
    ];
    const decisionByEventId = new Map();
    for (const part of chunk(eventIds, 100)) {
        const { data: decisions, error: decisionError } = await supabase
            .from("ai_decisions")
            .select("event_id, decision")
            .in("event_id", part)
            .order("created_at", { ascending: false });
        if (decisionError) {
            console.error("[AI Optimization] Failed to load decision rows for advisory", {
                variant_key: variantKey,
                error: decisionError.message,
            });
            continue;
        }
        for (const row of (decisions ?? [])) {
            if (!row.event_id)
                continue;
            if (!decisionByEventId.has(row.event_id)) {
                decisionByEventId.set(row.event_id, row);
            }
        }
    }
    const advisory = {
        outboundRows: outbound.length,
        linkedDecisionRows: 0,
        byTemplateSource: zeroBySource,
        usedFallbackCount: 0,
        offerAppliedCount: 0,
        sentCount: 0,
        failedCount: 0,
        openedCount: 0,
        clickedCount: 0,
    };
    for (const row of outbound) {
        if (row.status === "sent")
            advisory.sentCount += 1;
        if (row.status === "failed")
            advisory.failedCount += 1;
        if (row.opened_at)
            advisory.openedCount += 1;
        if (row.clicked_at)
            advisory.clickedCount += 1;
        const eid = row.source_event_id;
        if (!eid) {
            advisory.byTemplateSource.unknown += 1;
            continue;
        }
        const decision = decisionByEventId.get(eid) ?? null;
        const parsed = parseCreativeExecution(decision?.decision ?? null);
        advisory.byTemplateSource[parsed.templateSource] += 1;
        if (decision)
            advisory.linkedDecisionRows += 1;
        if (parsed.usedFallback)
            advisory.usedFallbackCount += 1;
        if (parsed.offerApplied)
            advisory.offerAppliedCount += 1;
    }
    return advisory;
}
async function evaluateExperiments() {
    const { data: experiments, error: expError } = await supabase
        .from("ai_experiments")
        .select("*")
        .eq("status", "running");
    if (expError) {
        console.error("[AI Optimization] Failed to load experiments", expError);
        return;
    }
    if (!experiments || experiments.length === 0) {
        return;
    }
    for (const exp of experiments) {
        const { data: variants, error: varError } = await supabase
            .from("ai_template_variants")
            .select(`
        id,
        node_id,
        variant_key,
        ai_variant_performance (*)
      `)
            .eq("experiment_id", exp.id);
        if (varError) {
            console.error("[AI Optimization] Failed to load variants for experiment", exp.id, varError);
            continue;
        }
        if (!variants || variants.length < 2)
            continue;
        let bestVariant = null;
        let bestCTR = 0;
        let bestVariantAdvisory = null;
        for (const v of variants) {
            const perf = v.ai_variant_performance?.[0];
            if (!perf || perf.sends < 50)
                continue;
            const ctr = perf.sends > 0 ? perf.clicks / perf.sends : 0;
            const advisory = await buildVariantProvenanceAdvisory(v.variant_key, 7);
            const review = derivePromotionReview({
                sends: Number(perf.sends ?? 0),
                clicks: Number(perf.clicks ?? 0),
            }, advisory);
            console.log(JSON.stringify({
                optimization_provenance_advisory: true,
                experiment_id: exp.id,
                variant_key: v.variant_key,
                node_id: v.node_id ?? exp.node_id ?? null,
                ctr,
                sends_for_ctr: perf.sends,
                clicks_for_ctr: perf.clicks,
                provenance: advisory,
                promotion_review: review,
            }));
            if (ctr > bestCTR) {
                bestCTR = ctr;
                bestVariant = v;
                bestVariantAdvisory = advisory;
            }
        }
        if (!bestVariant)
            continue;
        const targetNodeId = bestVariant.node_id ?? exp.node_id;
        if (!targetNodeId)
            continue;
        console.log("[AI Optimization] Promoting variant", bestVariant.variant_key, "for node", targetNodeId, "CTR=", bestCTR.toFixed(4));
        await promoteVariant(targetNodeId, bestVariant.variant_key);
        const { error: expUpdateError } = await supabase
            .from("ai_experiments")
            .update({ status: "completed" })
            .eq("id", exp.id);
        if (expUpdateError) {
            console.error("[AI Optimization] Failed to mark experiment completed", exp.id, expUpdateError);
        }
        const { error: decisionError } = await supabase.from("ai_decisions").insert({
            action: "optimize_template",
            node_id: targetNodeId,
            decision: {
                promoted_variant: bestVariant.variant_key,
                ctr: bestCTR,
                provenance_advisory: bestVariantAdvisory,
                promotion_review: derivePromotionReview({
                    sends: Number(bestVariant?.ai_variant_performance?.[0]?.sends ?? 0),
                    clicks: Number(bestVariant?.ai_variant_performance?.[0]?.clicks ?? 0),
                }, bestVariantAdvisory),
            },
        });
        if (decisionError) {
            console.error("[AI Optimization] Failed to log optimization decision", decisionError);
        }
    }
}
async function promoteVariant(nodeId, template) {
    const { error } = await supabase
        .from("automation_nodes")
        .update({
        config: {
            template,
        },
    })
        .eq("id", nodeId);
    if (error) {
        console.error("[AI Optimization] Failed to promote variant", nodeId, error);
    }
}
async function runOptimizationLoop() {
    console.log("[AI Optimization] Starting loop");
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await evaluateExperiments();
        }
        catch (err) {
            console.error("[AI Optimization] Error", err);
        }
        await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
}
void runOptimizationLoop();
