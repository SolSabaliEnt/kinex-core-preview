/**
 * Single source of truth for observability-only `creative_recommendation` labels.
 * Derived deterministically from event family (not model output).
 *
 * Consumers: `workers/aiDecision.ts`, operator parser, Analytics rollups.
 */
/** Stable rollup order (Analytics, operators); matches `deriveCreativeObjective` domains. */
export const CREATIVE_OBJECTIVE_ORDER = [
    "booking_recovery",
    "booking_progress",
    "booking_confirmation",
    "post_service_followup",
    "pet_activation",
    "pet_profile_completion",
];
/**
 * Fixed event keys for the Analytics “tracked creative-trigger events” table (7d).
 * Must stay aligned with `useTemplateSelectionStrategyMetrics` rollup.
 */
export const ANALYTICS_TRACKED_CREATIVE_TRIGGER_EVENTS = [
    "booking_abandoned",
    "booking_started",
    "booking_confirmed",
    "clean_completed",
    "review_submitted",
    "simplepaws_encourage_first_document",
    "simplepaws_complete_pet_enrichment",
    "simplepaws_records_organization_prompt",
    "simplepaws_vaccination_attention",
    "simplepaws_insurance_records_prompt",
    "simplepaws_plans_fit_message",
    "simplepaws_inactivity_reengagement",
];
const CREATIVE_OBJECTIVE_SET = new Set(CREATIVE_OBJECTIVE_ORDER);
/** Event types whose creative recommendations are labeled `ad_style` (observability only). */
export const CREATIVE_MODE_AD_STYLE_EVENT_TYPES = new Set([
    "simplepaws_encourage_first_document",
    "simplepaws_complete_pet_enrichment",
    "simplepaws_records_organization_prompt",
    "simplepaws_vaccination_attention",
    "simplepaws_insurance_records_prompt",
    "simplepaws_plans_fit_message",
    "simplepaws_inactivity_reengagement",
]);
/**
 * Event types that receive `creative_recommendation.organicSocialCreative` (v0).
 * Same membership as `ad_style` seeds so paid + organic mirrors stay aligned until product splits them.
 */
export const ORGANIC_SOCIAL_CREATIVE_EVENT_TYPES = CREATIVE_MODE_AD_STYLE_EVENT_TYPES;
export function isCreativeMode(value) {
    return value === "lifecycle" || value === "ad_style";
}
export function isCreativeObjective(value) {
    return typeof value === "string" && CREATIVE_OBJECTIVE_SET.has(value);
}
export function deriveCreativeMode(eventType) {
    return CREATIVE_MODE_AD_STYLE_EVENT_TYPES.has(eventType) ? "ad_style" : "lifecycle";
}
export function deriveCreativeObjective(eventType) {
    switch (eventType) {
        case "booking_abandoned":
            return "booking_recovery";
        case "booking_started":
            return "booking_progress";
        case "booking_confirmed":
            return "booking_confirmation";
        case "clean_completed":
            return "post_service_followup";
        case "review_submitted":
            /** Post-service / retention follow-up — same observability bucket as post-clean lifecycle. */
            return "post_service_followup";
        case "simplepaws_encourage_first_document":
            return "pet_activation";
        case "simplepaws_complete_pet_enrichment":
            return "pet_profile_completion";
        case "simplepaws_records_organization_prompt":
            return "pet_activation";
        case "simplepaws_vaccination_attention":
            return "pet_activation";
        case "simplepaws_insurance_records_prompt":
            return "pet_activation";
        case "simplepaws_plans_fit_message":
            return "pet_activation";
        case "simplepaws_inactivity_reengagement":
            return "pet_activation";
        default:
            return "booking_recovery";
    }
}
/** Prefer stored JSON when valid; else infer from `eventType` when present. */
export function resolveCreativeMode(stored, eventType) {
    if (isCreativeMode(stored))
        return stored;
    if (eventType)
        return deriveCreativeMode(eventType);
    return null;
}
/** Prefer stored JSON when valid; else infer from `eventType` when present. */
export function resolveCreativeObjective(stored, eventType) {
    if (isCreativeObjective(stored))
        return stored;
    if (eventType)
        return deriveCreativeObjective(eventType);
    return null;
}
