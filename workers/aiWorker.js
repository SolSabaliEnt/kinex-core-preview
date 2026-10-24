import "dotenv/config";
process.on("unhandledRejection", (reason) => {
    console.error("UNHANDLED PROMISE REJECTION:", reason);
});
process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);
});
import { supabase } from "./supabaseClient.js";
import { mergeCleanrApprovedCreativePackageIntoDecision } from "../src/lib/cleanrApprovedCreativePackage.js";
import { buildContext } from "./contextBuilder.js";
import { checkGuardrails } from "./guardrails.js";
import { runDecision } from "./aiDecision.js";
import { generatePersonalization } from "./personalization.js";
import { mergeEmailTemplateShell } from "./templateShell.js";
import { handleNotificationDecision } from "../src/workers/handlers/notificationHandler.js";
import { releaseClaimedJob } from "./queueClaimRelease.js";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value) {
    return UUID_REGEX.test(value.trim());
}
async function runWorker() {
    console.log("Kinex AI Worker starting...");
    console.log("[AI Worker] Starting Kinex AI worker loop");
    while (true) {
        try {
            const { data: jobs, error } = await supabase.rpc("fetch_pending_jobs", {
                job_limit: 25,
            });
            if (error) {
                console.error("[AI Worker] Error fetching pending jobs", error);
                await sleep(5000);
                continue;
            }
            const queueJobs = (jobs ?? []);
            if (!queueJobs.length) {
                console.log("[AI Worker] idle, waiting...");
                await sleep(3000);
                continue;
            }
            // fetch_pending_jobs claims the whole batch; release rows we do not own.
            for (const job of queueJobs) {
                if (job.action_type !== "ai_decision") {
                    await releaseClaimedJob(job);
                }
            }
            for (const job of queueJobs) {
                // For now we only process AI-focused jobs. Other action types are
                // handled by the main automation worker.
                if (job.action_type !== "ai_decision") {
                    continue;
                }
                await processJobSafely(job);
            }
        }
        catch (err) {
            console.error("[AI Worker] Unhandled error in main loop", err);
            await sleep(5000);
        }
    }
}
async function processJobSafely(job) {
    try {
        // fetch_pending_jobs already set status=processing and incremented attempts.
        await processJob(job);
        await markJobStatus(job.id, {
            status: "completed",
            processed_at: new Date().toISOString(),
        });
        console.log("[AI Worker] Completed AI job", job.id);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
        console.error("[AI Worker] Error processing AI job", job.id, err);
        await markJobStatus(job.id, {
            status: "failed",
            processed_at: new Date().toISOString(),
            last_error: message,
        });
    }
}
async function processJob(job) {
    console.log("[AI Worker] Processing job", job.id, "for event", job.event_id);
    const context = await buildContext(job);
    if (!context) {
        console.log(JSON.stringify({
            event: "ai_decision_blocked_missing_context",
            job_id: job.id,
            event_id: job.event_id,
            note: "buildContext returned null (missing event_id, event row not found, or load error). Distinct from ai_decision_blocked_missing_person_id.",
        }));
        throw new Error("AI decision failed: could not build worker context for this job (missing event or load error). Fix the event row or DB connectivity; job will not be marked completed without a decision.");
    }
    if (!context.person_id) {
        const ev = context.event;
        const eventType = typeof ev?.event_type === "string" ? ev.event_type : null;
        const payload = ev?.payload && typeof ev.payload === "object" && !Array.isArray(ev.payload)
            ? ev.payload
            : null;
        console.log(JSON.stringify({
            event: "ai_decision_blocked_missing_person_id",
            job_id: job.id,
            event_id: job.event_id,
            brand_id: context.brand_id,
            event_type: eventType,
            has_cleanr_approved_creative_package: Boolean(payload?.cleanr_approved_creative_package),
            note: "No personless ai_decision path: person_id is required for ai_decisions row, bounded creative package persistence, and downstream actions (e.g. send_notification). Producer must send top-level person_id on ingest for routed ai_decision jobs.",
        }));
        throw new Error("AI decision failed: events.person_id is required for ai_decisions and downstream execution. Re-ingest with top-level person_id or link the event to a Kinex person before requeuing.");
    }
    const { data: personRow, error: personLookupErr } = await supabase
        .from("persons")
        .select("id")
        .eq("id", context.person_id)
        .maybeSingle();
    if (personLookupErr) {
        throw new Error(`AI decision failed: could not verify public.persons.id for person_id: ${personLookupErr.message}`);
    }
    if (!personRow) {
        const ev = context.event;
        const eventType = typeof ev?.event_type === "string" ? ev.event_type : null;
        console.log(JSON.stringify({
            event: "ai_decision_blocked_unknown_person_id",
            job_id: job.id,
            event_id: job.event_id,
            brand_id: context.brand_id,
            event_type: eventType,
            person_id: context.person_id,
            note: "events.person_id must be an existing public.persons.id. A Supabase Auth user.id (or other app UUID) is not interchangeable with persons.id unless your deployment explicitly stores that same UUID as persons.id. Ingest does not FK-enforce this. Reuse DB RPC resolve_or_create_person(identity_type, identity_value) when you have a stable identity key (e.g. email), or create/link the person in Kinex before emitting events.",
        }));
        throw new Error("AI decision failed: events.person_id is not an existing public.persons.id. Fix identity linkage in Kinex or emit the Kinex persons.id from Cleanr.");
    }
    const guardrailResult = await checkGuardrails(context);
    if (!guardrailResult.allowed) {
        console.log("[AI Worker] Guardrails blocked job", job.id);
        return;
    }
    const rawDecision = await runDecision(context);
    const decision = mergeCleanrApprovedCreativePackageIntoDecision(rawDecision, context.event?.payload ?? null);
    const runtimeContext = {
        event: context.event,
        person: {
            id: context.person_id,
        },
        personIntelligence: context.person_intelligence,
        brandContext: context.brandContext,
    };
    const { data: insertedDecision, error: decisionInsertError } = await supabase
        .from("ai_decisions")
        .insert({
        brand_id: context.brand_id,
        person_id: context.person_id,
        event_id: context.event_id,
        decision,
    })
        .select("id")
        .single();
    if (decisionInsertError) {
        console.error("[AI Worker] ai_decisions insert failed", job.id, decisionInsertError);
        throw new Error(`ai_decisions insert failed: ${decisionInsertError.message ?? "unknown"}`);
    }
    switch (decision.action) {
        case "send_email":
            await handleEmailDecision(job, context, decision, typeof insertedDecision?.id === "string" ? insertedDecision.id : null);
            break;
        case "send_sms":
            await handleSmsDecision(job, context, decision);
            break;
        case "send_notification":
            console.log("[AI Worker] executing notification", decision);
            await handleNotificationDecision({
                decision,
                runtimeContext,
                sourceAiDecisionId: typeof insertedDecision?.id === "string" ? insertedDecision.id : null,
            });
            break;
        case "enqueue_sequence":
            await handleSequenceDecision(job, context, decision);
            break;
        case "none":
            console.log("[AI Worker] Decision returned none", {
                job_id: job.id,
                confidence: decision.confidence,
            });
            break;
        default:
            console.log("[AI Worker] Decision action not handled", {
                job_id: job.id,
                action: decision.action,
            });
    }
}
async function resolveEmailTemplateForSend(brandId, templateKey) {
    if (!brandId)
        return { subject: null, html: null };
    const { data, error } = await supabase
        .from("templates")
        .select("subject, html")
        .eq("brand_id", brandId)
        .eq("key", templateKey)
        .maybeSingle();
    if (error || !data)
        return { subject: null, html: null };
    const row = data;
    const subject = typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : null;
    const html = typeof row.html === "string" && row.html.trim() ? row.html : null;
    return { subject, html };
}
function extractCreativeRecommendationTemplate(decision) {
    const raw = decision
        .creative_recommendation?.templateKey;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function extractCreativeRecommendation(decision) {
    const raw = decision.creative_recommendation;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    return raw;
}
function resolveRecommendedOffer(context, rec) {
    const offerId = rec && typeof rec.offerId === "string" && rec.offerId.trim() ? rec.offerId.trim() : null;
    if (!offerId) {
        return { offerName: null, status: "not_present" };
    }
    const offers = Array.isArray(context.brandContext?.offers)
        ? context.brandContext.offers
        : [];
    const match = offers.find((o) => typeof o.id === "string" && o.id === offerId);
    if (!match) {
        return { offerName: null, status: "ignored_not_found" };
    }
    return {
        offerName: typeof match.name === "string" ? match.name : null,
        status: "applied",
    };
}
function resolveRecommendedSegment(context, rec) {
    const segmentKey = rec && typeof rec.segmentKey === "string" && rec.segmentKey.trim()
        ? rec.segmentKey.trim()
        : null;
    if (!segmentKey) {
        return { segmentKey: null, status: "not_present" };
    }
    const segments = Array.isArray(context.brandContext?.segments)
        ? context.brandContext.segments
        : [];
    const match = segments.find((s) => typeof s.key === "string" && s.key === segmentKey);
    if (!match) {
        return { segmentKey: null, status: "ignored_not_found" };
    }
    // No bounded runtime branching hook in email send path yet; keep audit-only.
    return { segmentKey, status: "ignored_no_safe_execution_hook" };
}
async function handleEmailDecision(job, context, decision, decisionRowId) {
    if (!context)
        return;
    const modelTemplate = typeof decision.template === "string" ? decision.template.trim() : null;
    const recommendation = extractCreativeRecommendation(decision);
    const recommendedTemplate = extractCreativeRecommendationTemplate(decision);
    const recommendationUsedFallback = recommendation && typeof recommendation.usedFallback === "boolean"
        ? recommendation.usedFallback
        : null;
    const recommendationTemplateSource = recommendation && typeof recommendation.templateSource === "string"
        ? recommendation.templateSource
        : null;
    const segmentTemplatePreferenceStatus = recommendation && typeof recommendation.segmentTemplatePreferenceStatus === "string"
        ? recommendation.segmentTemplatePreferenceStatus
        : null;
    const allowed = context.allowedTemplateKeys ?? [];
    let effectiveTemplate = modelTemplate;
    let recommendationApplied = false;
    let recommendationStatus = "not_present";
    if (recommendedTemplate) {
        if (recommendedTemplate === modelTemplate) {
            recommendationStatus = "ignored_same_template";
        }
        else if (allowed.length > 0 && allowed.includes(recommendedTemplate)) {
            effectiveTemplate = recommendedTemplate;
            recommendationApplied = true;
            recommendationStatus = "applied";
        }
        else {
            recommendationStatus = "ignored_not_allowlisted";
        }
    }
    if (!effectiveTemplate) {
        console.warn("[AI Worker] send_email decision is missing template key; skipping enqueue_message", { job_id: job.id });
        return;
    }
    console.log(JSON.stringify({
        creative_recommendation_consumption: true,
        job_id: job.id,
        event_id: context.event_id,
        model_template: modelTemplate,
        recommended_template: recommendedTemplate,
        final_template: effectiveTemplate,
        recommendation_status: recommendationStatus,
        recommendation_applied: recommendationApplied,
    }));
    const offerResolution = resolveRecommendedOffer(context, recommendation);
    const segmentResolution = resolveRecommendedSegment(context, recommendation);
    if (decisionRowId) {
        const decisionWithExecution = {
            ...decision,
            creative_execution: {
                finalTemplate: effectiveTemplate,
                templateSource: recommendationApplied ? "creative_recommendation" : "decision",
                recommendedTemplate,
                recommendationStatus,
                recommendationApplied,
                resolvedSegmentKey: segmentResolution.segmentKey,
                segmentStatus: segmentResolution.status,
                segmentTemplatePreferenceStatus,
                offerStatus: offerResolution.status,
                appliedOfferName: offerResolution.offerName,
                usedFallback: recommendationUsedFallback,
                recommendationTemplateSource,
            },
        };
        const { error: decisionUpdateError } = await supabase
            .from("ai_decisions")
            .update({ decision: decisionWithExecution })
            .eq("id", decisionRowId);
        if (decisionUpdateError) {
            console.warn("[AI Worker] Failed to append creative execution metadata", {
                decision_id: decisionRowId,
                error: decisionUpdateError.message,
            });
        }
    }
    const executionDecision = offerResolution.offerName && offerResolution.offerName !== decision.offer
        ? { ...decision, offer: offerResolution.offerName }
        : decision;
    console.log(JSON.stringify({
        creative_recommendation_offer_segment: true,
        job_id: job.id,
        event_id: context.event_id,
        recommended_offer_id: recommendation && typeof recommendation.offerId === "string"
            ? recommendation.offerId
            : null,
        offer_status: offerResolution.status,
        applied_offer_name: offerResolution.offerName,
        recommended_segment_key: recommendation && typeof recommendation.segmentKey === "string"
            ? recommendation.segmentKey
            : null,
        segment_status: segmentResolution.status,
        applied_segment_key: segmentResolution.segmentKey,
        segment_operationalization: "audit_only",
        segment_influenced_choice: false,
    }));
    const content = await generatePersonalization(context, executionDecision);
    const templateRow = await resolveEmailTemplateForSend(context.brand_id, effectiveTemplate);
    const subject = templateRow.subject ?? content.subject;
    if (templateRow.subject) {
        console.log(JSON.stringify({
            personalization_subject: true,
            source: "templates.subject",
            template_key: effectiveTemplate,
        }));
    }
    const shell = mergeEmailTemplateShell(templateRow.html, content.html);
    console.log(JSON.stringify({
        template_rendering: true,
        template_key: effectiveTemplate,
        shell_mode: shell.mode,
    }));
    const { error: enqueueError } = await supabase.rpc("enqueue_message", {
        p_brand: context.brand_id,
        p_person: context.person_id,
        p_template: effectiveTemplate,
        p_subject: subject,
        p_html: shell.html,
        p_delay_minutes: 0,
        p_event_id: context.event_id,
    });
    if (enqueueError) {
        console.error("[AI Worker] Failed to enqueue message", enqueueError);
        throw enqueueError;
    }
    console.log("[AI Worker] Enqueued personalized email for job", job.id, {
        offer: executionDecision.offer,
        incentive: decision.incentive,
        source_event_id: context.event_id,
        template_source: recommendationApplied ? "creative_recommendation" : "decision",
        offer_source: offerResolution.status === "applied" ? "creative_recommendation" : "decision",
        segment_key: segmentResolution.segmentKey,
        segment_source: segmentResolution.status === "ignored_no_safe_execution_hook"
            ? "creative_recommendation_audit_only"
            : "none",
        subject_source: templateRow.subject ? "template" : "personalization_fallback",
        template_shell_mode: shell.mode,
    });
}
function stripHtmlToPlainSms(html) {
    return html
        .replace(/<\/p>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
async function handleSmsDecision(job, context, decision) {
    if (!context)
        return;
    const brandId = typeof context.brand_id === "string" ? context.brand_id.trim() : "";
    const personId = typeof context.person_id === "string" ? context.person_id.trim() : "";
    if (!brandId || !personId) {
        console.warn("[AI Worker] send_sms skipped: missing brand_id or person_id", {
            job_id: job.id,
        });
        return;
    }
    const templateKey = typeof decision.template === "string" && decision.template.trim()
        ? decision.template.trim()
        : "";
    if (!templateKey) {
        console.warn("[AI Worker] send_sms decision is missing template key", {
            job_id: job.id,
        });
        return;
    }
    const content = await generatePersonalization(context, decision);
    let body = stripHtmlToPlainSms(content.html ?? "").trim();
    if (!body) {
        const { data: tpl } = await supabase
            .from("templates")
            .select("html")
            .eq("brand_id", brandId)
            .eq("key", templateKey)
            .maybeSingle();
        const rawHtml = typeof tpl?.html === "string" ? tpl.html : "";
        body = stripHtmlToPlainSms(rawHtml).trim();
    }
    if (!body) {
        console.warn("[AI Worker] send_sms skipped: empty body after template + personalization", {
            job_id: job.id,
            template_key: templateKey,
        });
        return;
    }
    const smsBody = body.slice(0, 1600);
    const subject = typeof content.subject === "string" && content.subject.trim()
        ? content.subject.trim().slice(0, 200)
        : "SMS";
    const { error, data } = await supabase
        .from("message_queue")
        .insert({
        brand_id: brandId,
        person_id: personId,
        channel: "sms",
        template_key: templateKey,
        subject,
        html: "",
        body: smsBody,
        provider: "twilio",
        status: "queued",
        send_at: new Date().toISOString(),
        source_event_id: context.event_id ?? null,
    })
        .select("id")
        .maybeSingle();
    if (error)
        throw error;
    console.log("[AI Worker] Enqueued message_queue SMS row for job", job.id, {
        message_queue_id: data?.id,
        template_key: templateKey,
        source_event_id: context.event_id,
        offer: decision.offer,
        incentive: decision.incentive,
    });
}
async function handleSequenceDecision(job, context, decision) {
    if (!context)
        return;
    if (!decision.template) {
        console.warn("[AI Worker] enqueue_sequence decision is missing sequence key", {
            job_id: job.id,
        });
        return;
    }
    const brandId = context.brand_id;
    if (!brandId) {
        throw new Error("enqueue_sequence failed: missing brand_id on event context (cannot resolve sequences.id)");
    }
    const templateOrKey = decision.template.trim();
    let sequenceId = templateOrKey;
    if (!isUuid(sequenceId)) {
        const { data: seq, error: seqErr } = await supabase
            .from("sequences")
            .select("id")
            .eq("brand_id", brandId)
            .eq("key", templateOrKey)
            .maybeSingle();
        if (seqErr) {
            throw new Error(`enqueue_sequence failed: could not load sequence by key "${templateOrKey}": ${seqErr.message}`);
        }
        if (!seq || typeof seq.id !== "string") {
            throw new Error(`enqueue_sequence failed: no public.sequences row for brand_id=${brandId} and key="${templateOrKey}". ` +
                `Create the sequence (and sequence_steps) or adjust CRITICAL_EVENT_FALLBACKS — automation_worker expects action_target = sequences.id (UUID).`);
        }
        sequenceId = seq.id;
    }
    const { error } = await supabase.from("automation_queue").insert({
        event_id: context.event_id,
        rule_id: job.rule_id,
        action_type: "sequence",
        action_target: sequenceId,
        status: "pending",
    });
    if (error)
        throw error;
    console.log("[AI Worker] Enqueued sequence action for job", job.id, {
        sequenceKeyOrUuid: decision.template,
        sequenceId,
        offer: decision.offer,
        incentive: decision.incentive,
    });
}
async function markJobStatus(jobId, patch) {
    const update = {
        ...patch,
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
        .from("automation_queue")
        .update(update)
        .eq("id", jobId);
    if (error) {
        console.error("[AI Worker] Failed to update job status", jobId, error);
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
void runWorker();
