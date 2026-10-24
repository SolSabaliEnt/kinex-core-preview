/**
 * Optional sibling to `decision.creative_recommendation`: bounded social **copy variants** (review-first).
 * Does not replace recommendation mirrors; no external publishing.
 */
import { isSocialCreativeFormatProfileId, } from "./socialCreativeFormatProfile";
export const CREATIVE_SOCIAL_COPY_VARIANTS_DECISION_TYPE = "creative_social_copy_variants";
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function parseVariantRow(v) {
    if (!isRecord(v))
        return null;
    if (v.variantId !== "a" && v.variantId !== "b")
        return null;
    const headline = typeof v.headline === "string" ? v.headline : "";
    const primaryText = typeof v.primaryText === "string" ? v.primaryText : "";
    const notes = typeof v.notes === "string" && v.notes.trim().length > 0 ? v.notes.trim() : null;
    return { variantId: v.variantId, headline, primaryText, notes };
}
function parseSurfaceBlock(raw) {
    if (!isRecord(raw))
        return null;
    const list = Array.isArray(raw.variants) ? raw.variants : [];
    const variants = [];
    const seen = new Set();
    for (const item of list) {
        if (variants.length >= 2)
            break;
        const row = parseVariantRow(item);
        if (row && !seen.has(row.variantId)) {
            seen.add(row.variantId);
            variants.push(row);
        }
    }
    if (variants.length === 0)
        return null;
    const formatProfileId = isSocialCreativeFormatProfileId(raw.formatProfileId)
        ? raw.formatProfileId
        : null;
    return { variants, formatProfileId };
}
/**
 * Parses `decision.creative_social_copy_variants` when present and well-formed enough to display.
 */
export function parseCreativeSocialCopyVariantsFromDecision(decision) {
    if (!decision)
        return null;
    const raw = decision.creative_social_copy_variants;
    if (!isRecord(raw))
        return null;
    if (raw.decisionType !== CREATIVE_SOCIAL_COPY_VARIANTS_DECISION_TYPE)
        return null;
    const paid = raw.paid !== undefined && raw.paid !== null ? parseSurfaceBlock(raw.paid) : null;
    const organic = raw.organic !== undefined && raw.organic !== null ? parseSurfaceBlock(raw.organic) : null;
    if (!paid && !organic)
        return null;
    const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : null;
    const generatedAt = typeof raw.generatedAt === "string" && raw.generatedAt.trim()
        ? raw.generatedAt.trim()
        : null;
    return { paid, organic, source, generatedAt };
}
export function hasCreativeSocialCopyVariantsPayload(decision) {
    return parseCreativeSocialCopyVariantsFromDecision(decision) != null;
}
/** Sibling observability for bounded copy generation (worker-set; review-first). */
export const CREATIVE_SOCIAL_COPY_GENERATION_DECISION_TYPE = "creative_social_copy_generation";
export const SOCIAL_COPY_GENERATION_STATUSES = [
    "ineligible_no_recommendation",
    "ineligible_not_ad_style",
    "ineligible_no_paid_mirror",
    "ineligible_profile_spec",
    "skipped_flag_off",
    "skipped_selective_brand",
    "skipped_selective_objective",
    "skipped_no_openai_key",
    "skipped_already_present",
    "attempted_error_http",
    "attempted_error_parse",
    "attempted_rejected_noncompliant",
    "attempted_error_exception",
    "generated",
    "partial",
];
const SOCIAL_COPY_GENERATION_STATUS_SET = new Set(SOCIAL_COPY_GENERATION_STATUSES);
function asSurfaceOutcome(v) {
    return v === "generated" || v === "none" || v === "not_applicable" ? v : null;
}
function parseSurfacesRequested(raw) {
    if (!isRecord(raw))
        return null;
    if (raw.paid !== true)
        return null;
    if (typeof raw.organic !== "boolean")
        return null;
    return { paid: true, organic: raw.organic };
}
function parseSelectiveContext(raw) {
    if (!isRecord(raw))
        return null;
    if (!("brand_id" in raw) || !("creative_objective" in raw))
        return null;
    const brandOk = raw.brand_id === null || typeof raw.brand_id === "string";
    const objOk = raw.creative_objective === null || typeof raw.creative_objective === "string";
    if (!brandOk || !objOk)
        return null;
    return {
        brand_id: raw.brand_id === null ? null : raw.brand_id,
        creative_objective: raw.creative_objective === null ? null : raw.creative_objective,
    };
}
/**
 * Parses `decision.creative_social_copy_generation` when present (worker observability pass onward).
 */
export function parseCreativeSocialCopyGenerationFromDecision(decision) {
    if (!decision)
        return null;
    const raw = decision.creative_social_copy_generation;
    if (!isRecord(raw))
        return null;
    if (raw.decisionType !== CREATIVE_SOCIAL_COPY_GENERATION_DECISION_TYPE)
        return null;
    const evaluatedAt = typeof raw.evaluatedAt === "string" && raw.evaluatedAt.trim() ? raw.evaluatedAt.trim() : null;
    const attempted = typeof raw.attempted === "boolean" ? raw.attempted : null;
    const st = typeof raw.status === "string" && SOCIAL_COPY_GENERATION_STATUS_SET.has(raw.status)
        ? raw.status
        : null;
    if (!evaluatedAt || attempted === null || !st)
        return null;
    const surfacesRequested = parseSurfacesRequested(raw.surfacesRequested);
    const selectiveContext = raw.selectiveContext !== undefined ? parseSelectiveContext(raw.selectiveContext) : null;
    if (raw.selectiveContext !== undefined && selectiveContext === null)
        return null;
    const paid = raw.paid !== undefined ? asSurfaceOutcome(raw.paid) : null;
    const organic = raw.organic !== undefined ? asSurfaceOutcome(raw.organic) : null;
    if (raw.paid !== undefined && paid === null)
        return null;
    if (raw.organic !== undefined && organic === null)
        return null;
    return {
        evaluatedAt,
        attempted,
        status: st,
        surfacesRequested,
        selectiveContext,
        paid,
        organic,
    };
}
export function hasCreativeSocialCopyGenerationPayload(decision) {
    return parseCreativeSocialCopyGenerationFromDecision(decision) != null;
}
/** URL / operator triage buckets for AI Decisions (grouped from closed statuses + variant presence). */
export const COPY_GENERATION_TRIAGE_BUCKETS = [
    "all",
    "generated_only",
    "partial_only",
    "generated_or_partial",
    "selective_skips",
    "errors_or_rejected",
    "has_copy_variants",
    "observed_no_variants",
];
const COPY_GENERATION_TRIAGE_BUCKET_SET = new Set(COPY_GENERATION_TRIAGE_BUCKETS);
export function isCopyGenerationTriageBucket(v) {
    return COPY_GENERATION_TRIAGE_BUCKET_SET.has(v);
}
/**
 * Whether a parsed row matches a copy-generation triage bucket. Factual only — uses persisted observability + variants.
 */
export function copyGenerationTriageMatchesRow(socialCopyGeneration, hasCopyVariantsPayload, bucket) {
    if (bucket === "all")
        return true;
    if (bucket === "has_copy_variants")
        return hasCopyVariantsPayload;
    if (bucket === "observed_no_variants") {
        return socialCopyGeneration != null && !hasCopyVariantsPayload;
    }
    const status = socialCopyGeneration?.status ?? null;
    if (status === null)
        return false;
    switch (bucket) {
        case "generated_only":
            return status === "generated";
        case "partial_only":
            return status === "partial";
        case "generated_or_partial":
            return status === "generated" || status === "partial";
        case "selective_skips":
            return status === "skipped_selective_brand" || status === "skipped_selective_objective";
        case "errors_or_rejected":
            return (status === "attempted_error_http" ||
                status === "attempted_error_parse" ||
                status === "attempted_error_exception" ||
                status === "attempted_rejected_noncompliant");
        default:
            return true;
    }
}
export const SOCIAL_COPY_GENERATION_ROLLUP_GROUP_ORDER = [
    "generated",
    "partial",
    "selective_skip",
    "error_rejected",
    "skipped_other",
    "ineligible",
];
export function socialCopyGenerationRollupGroup(status) {
    switch (status) {
        case "generated":
            return "generated";
        case "partial":
            return "partial";
        case "skipped_selective_brand":
        case "skipped_selective_objective":
            return "selective_skip";
        case "skipped_flag_off":
        case "skipped_no_openai_key":
        case "skipped_already_present":
            return "skipped_other";
        case "ineligible_no_recommendation":
        case "ineligible_not_ad_style":
        case "ineligible_no_paid_mirror":
        case "ineligible_profile_spec":
            return "ineligible";
        case "attempted_error_http":
        case "attempted_error_parse":
        case "attempted_rejected_noncompliant":
        case "attempted_error_exception":
            return "error_rejected";
    }
}
function surfaceOutcomeOperatorLine(outcome, surface) {
    const label = surface === "paid" ? "Paid" : "Organic";
    switch (outcome) {
        case "generated":
            return `${label}: at least one compliant headline + primary-text variant was stored under creative_social_copy_variants.`;
        case "none":
            return `${label}: no compliant variant was stored (empty model output, failed contract check after truncate, or duplicate ids dropped).`;
        case "not_applicable":
            return `${label}: not requested for this row (worker only generates organic when the recommendation includes an organic mirror).`;
    }
}
function partialBreakdownPlain(gen) {
    if (gen.status !== "partial")
        return null;
    const bits = [];
    if (gen.paid === "generated")
        bits.push("Paid surface has stored variant(s).");
    if (gen.paid === "none")
        bits.push("Paid surface has no stored variant(s).");
    if (gen.organic === "generated")
        bits.push("Organic surface has stored variant(s).");
    if (gen.organic === "none")
        bits.push("Organic surface has no stored variant(s).");
    return bits.length > 0 ? bits.join(" ") : null;
}
function categoryLabelForStatus(status) {
    if (status.startsWith("ineligible"))
        return "Ineligible";
    if (status.startsWith("skipped"))
        return "Skipped — generation not run";
    if (status.startsWith("attempted_"))
        return "Attempted — no variants stored";
    if (status === "generated")
        return "Succeeded — variants stored";
    if (status === "partial")
        return "Partial — mixed surface outcomes";
    return "Copy generation";
}
function statusSummaryPlain(status) {
    switch (status) {
        case "ineligible_no_recommendation":
            return "No creative_recommendation on this decision path, so the bounded copy step does not apply.";
        case "ineligible_not_ad_style":
            return "Creative mode is not ad_style — paid/organic recommendation mirrors are not attached for this pattern.";
        case "ineligible_no_paid_mirror":
            return "Missing paid social mirror on the recommendation — copy generation requires an ad-style paid mirror.";
        case "ineligible_profile_spec":
            return "Format profile / copy contract could not be resolved from the mirror (unknown or missing formatProfileId).";
        case "skipped_flag_off":
            return "KINEX_SOCIAL_COPY_GENERATION is off — the worker did not call the copy model.";
        case "skipped_selective_brand":
            return "Selective enablement: brand_id is not allowed by KINEX_SOCIAL_COPY_GENERATION_BRAND_IDS (when that allowlist is set).";
        case "skipped_selective_objective":
            return "Selective enablement: creativeObjective is not allowed by KINEX_SOCIAL_COPY_GENERATION_OBJECTIVES (when that allowlist is set).";
        case "skipped_no_openai_key":
            return "OPENAI_API_KEY was missing — the copy OpenAI request was not sent.";
        case "skipped_already_present":
            return "creative_social_copy_variants was already present — the worker skipped issuing another copy generation call.";
        case "attempted_error_http":
            return "Copy OpenAI HTTP error — no variants were persisted.";
        case "attempted_error_parse":
            return "Copy model output was not usable JSON — no variants were persisted.";
        case "attempted_rejected_noncompliant":
            return "Model returned text for one or both surfaces, but nothing passed contract validation — no variants were persisted.";
        case "attempted_error_exception":
            return "Worker exception during copy generation — no variants were persisted.";
        case "generated":
            return "Every requested surface (paid, or paid + organic) produced at least one compliant stored variant.";
        case "partial":
            return "Both paid and organic were requested; at least one surface stored variants and at least one did not.";
    }
}
function whyNoVariantsPlain(status, hasStoredCopyVariants) {
    if (hasStoredCopyVariants)
        return null;
    if (status === "generated" || status === "partial") {
        return "Note: stored status expects variant data, but creative_social_copy_variants is missing or not parseable — inspect raw decision JSON.";
    }
    if (status.startsWith("ineligible")) {
        return "No stored variants: row never reached an eligible copy-generation attempt (see ineligible reason above).";
    }
    if (status.startsWith("skipped")) {
        return "No stored variants: generation was not attempted — worker exited before or without a successful copy completion (see skip reason above).";
    }
    if (status.startsWith("attempted_")) {
        return "No stored variants: a copy attempt ran or was started, but nothing compliant was written to creative_social_copy_variants (see status above).";
    }
    return null;
}
/**
 * Short bucket label aligned with `categoryLabelForStatus` — for table chips (same vocabulary as drilldown header).
 */
export function copyGenerationChipBucketLabel(status) {
    if (status.startsWith("ineligible"))
        return "Ineligible";
    if (status.startsWith("skipped"))
        return "Skipped";
    if (status.startsWith("attempted_"))
        return "Attempted";
    if (status === "generated")
        return "Succeeded";
    if (status === "partial")
        return "Partial";
    return "Copy gen";
}
function surfaceOutcomeTooltipCompact(outcome, surface) {
    const label = surface === "paid" ? "Paid" : "Organic";
    switch (outcome) {
        case "generated":
            return `${label}: compliant variant(s) stored`;
        case "none":
            return `${label}: no compliant variants stored`;
        case "not_applicable":
            return `${label}: not in scope (organic mirror not requested)`;
    }
}
/**
 * Single tooltip string for compact AI Decisions surfaces — same factual lines as drilldown, shortened joins (no duplicate logic vs `explainCopyGenerationDrilldown`).
 */
export function formatCopyGenerationOperatorTooltip(gen, hasStoredCopyVariants) {
    const ex = explainCopyGenerationDrilldown(gen, hasStoredCopyVariants);
    const parts = [
        ex.categoryLabel,
        ex.statusSummary,
        `Stored creative_social_copy_variants: ${hasStoredCopyVariants ? "yes" : "no"}`,
    ];
    if (ex.whyNoVariantsLine)
        parts.push(ex.whyNoVariantsLine);
    for (const line of ex.supplementalLines)
        parts.push(line);
    if (gen.paid !== null)
        parts.push(surfaceOutcomeTooltipCompact(gen.paid, "paid"));
    if (gen.organic !== null)
        parts.push(surfaceOutcomeTooltipCompact(gen.organic, "organic"));
    if (gen.selectiveContext) {
        parts.push(`Selective gate: brand_id=${gen.selectiveContext.brand_id ?? "null"} · creative_objective=${gen.selectiveContext.creative_objective ?? "null"}`);
    }
    parts.push(`OpenAI attempted: ${gen.attempted ? "yes" : "no"} · Status token: ${gen.status} · evaluatedAt: ${gen.evaluatedAt}`);
    return parts.join(" · ");
}
/**
 * Factual operator-facing explanation for expanded AI Decisions drilldown.
 * Does not infer causes beyond the closed status set and optional paid/organic outcomes.
 */
export function explainCopyGenerationDrilldown(gen, hasStoredCopyVariants) {
    const supplementalLines = [];
    if (gen.surfacesRequested) {
        supplementalLines.push(gen.surfacesRequested.organic
            ? "Mirrors in scope when the worker evaluated copy: paid and organic."
            : "Mirrors in scope when the worker evaluated copy: paid only.");
    }
    const partialLine = partialBreakdownPlain(gen);
    if (partialLine)
        supplementalLines.push(partialLine);
    const surfaceDetailLines = [];
    if (gen.paid !== null) {
        surfaceDetailLines.push({
            title: "Paid surface outcome",
            body: surfaceOutcomeOperatorLine(gen.paid, "paid"),
        });
    }
    if (gen.organic !== null) {
        surfaceDetailLines.push({
            title: "Organic surface outcome",
            body: surfaceOutcomeOperatorLine(gen.organic, "organic"),
        });
    }
    return {
        categoryLabel: categoryLabelForStatus(gen.status),
        statusSummary: statusSummaryPlain(gen.status),
        supplementalLines,
        whyNoVariantsLine: whyNoVariantsPlain(gen.status, hasStoredCopyVariants),
        surfaceDetailLines,
    };
}
