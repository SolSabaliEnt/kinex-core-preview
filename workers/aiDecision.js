import { CRITICAL_EVENT_FALLBACKS, SIMPLEPAWS_EVENT_TYPE_TO_INTENT_KEY, SIMPLEPAWS_INTENT_CHANNEL_POLICY, SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE, SIMPLEPAWS_INTENT_TO_NOTIFICATION_TEMPLATE, SIMPLEPAWS_SUPPORTED_INTENTS, } from "./channelPolicy.js";
import { deriveCreativeMode, deriveCreativeObjective, isCreativeObjective, ORGANIC_SOCIAL_CREATIVE_EVENT_TYPES, } from "../src/lib/creativeObservabilityLabels.js";
import { defaultFormatProfileIdForGenericOrganicSocial, defaultFormatProfileIdForGenericPaidSocial, deriveSocialCopyVariantCompliance, getSocialFormatProfileSpec, } from "../src/lib/socialCreativeFormatProfile.js";
import { buildCreativeAssetBriefFromInputs, } from "../src/lib/creativeAssetBrief.js";
import { buildCreativeUpstreamSignalPayload } from "../src/lib/creativeUpstreamContext.js";
import { CREATIVE_SOCIAL_COPY_GENERATION_DECISION_TYPE, CREATIVE_SOCIAL_COPY_VARIANTS_DECISION_TYPE, } from "../src/lib/socialCreativeCopyVariants.js";
/** Re-export for docs/scripts that reference the map by path. */
export { SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE } from "./channelPolicy.js";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_MAX_TOKENS_DEFAULT = 500;
const CREATIVE_RECOMMENDATION_EVENT_TYPES = [
    "booking_abandoned",
    "booking_started",
    "booking_confirmed",
    "clean_completed",
    /** Active Cleanr spine — mirrors `decision.template` onto `creative_recommendation` for observability/handoff. */
    "review_submitted",
    "simplepaws_encourage_first_document",
    "simplepaws_complete_pet_enrichment",
    "simplepaws_records_organization_prompt",
    "simplepaws_vaccination_attention",
    "simplepaws_insurance_records_prompt",
    "simplepaws_plans_fit_message",
    "simplepaws_inactivity_reengagement",
];
const CREATIVE_HOOK_ANGLES = [
    "resume_booking",
    "save_time",
    "reduce_friction",
    "complete_setup",
    "value_reminder",
];
const CREATIVE_CTA_OPTIONS = [
    "Complete your booking",
    "Continue booking",
    "Finish setup",
    "Start setup",
    "Continue now",
    "Claim your offer",
    "View booking details",
    "Leave a review",
    "Upload first document",
    "Complete pet profile",
    "Organize pet records",
    "Add vaccination records",
    "Add insurance records",
    "Review plan options",
    "Pick up where you left off",
];
/**
 * Bounded segment-aware template preference hints.
 * Keys are event_type -> segment_key -> ordered template keyword hints.
 * Selection is constrained to current brand `allowedTemplateKeys`.
 */
const SEGMENT_TEMPLATE_PREFERENCE_HINTS = {
    booking_abandoned: {
        high_intent: ["recover", "resume", "booking"],
        price_sensitive: ["offer", "save", "deal"],
        friction_dropoff: ["finish", "continue", "booking"],
        nurture: ["reminder", "value", "booking"],
    },
    booking_started: {
        high_intent: ["booking", "complete", "continue"],
        friction_dropoff: ["finish", "start", "booking"],
        price_sensitive: ["offer", "save", "booking"],
    },
};
const EVENT_DEFAULT_HOOK_CTA = {
    booking_abandoned: { hookAngle: "resume_booking", cta: "Complete your booking" },
    booking_started: { hookAngle: "complete_setup", cta: "Continue booking" },
    booking_confirmed: { hookAngle: "value_reminder", cta: "View booking details" },
    clean_completed: { hookAngle: "value_reminder", cta: "Leave a review" },
    review_submitted: { hookAngle: "value_reminder", cta: "Continue now" },
    simplepaws_encourage_first_document: {
        hookAngle: "reduce_friction",
        cta: "Upload first document",
    },
    simplepaws_complete_pet_enrichment: {
        hookAngle: "complete_setup",
        cta: "Complete pet profile",
    },
    simplepaws_records_organization_prompt: {
        hookAngle: "reduce_friction",
        cta: "Organize pet records",
    },
    simplepaws_vaccination_attention: {
        hookAngle: "complete_setup",
        cta: "Add vaccination records",
    },
    simplepaws_insurance_records_prompt: {
        hookAngle: "value_reminder",
        cta: "Add insurance records",
    },
    simplepaws_plans_fit_message: {
        hookAngle: "value_reminder",
        cta: "Review plan options",
    },
    simplepaws_inactivity_reengagement: {
        hookAngle: "value_reminder",
        cta: "Pick up where you left off",
    },
};
/**
 * Explicit event-family template aliases for deterministic matching against allowlisted keys.
 * Matching is normalized (case-insensitive; separators ignored).
 */
const EVENT_TEMPLATE_PREFERENCE_ALIASES = {
    booking_abandoned: [
        "booking_recovery",
        "booking-recovery",
        "booking-recovery-email",
        "booking_recovery_email",
        "booking_abandoned",
        "booking-abandoned",
        "recover_booking",
    ],
    booking_started: [
        "booking_started",
        "booking-started",
        "booking_started_email",
        "booking-started-email",
        "booking_start_email",
        "booking-start-email",
        "booking_start",
        "booking-start",
        "start_booking",
        "continue_booking",
        "booking_recovery",
        "booking-recovery",
        "booking-recovery-email",
    ],
    booking_confirmed: [
        "booking_confirmation",
        "booking-confirmation",
        "booking_confirmation_email",
        "booking-confirmation-email",
        "booking_confirmed",
        "booking-confirmed",
    ],
    clean_completed: [
        "review_prompt",
        "review-prompt",
        "review_prompt_email",
        "review-prompt-email",
        "clean_completed",
        "clean-completed",
    ],
    /** Active Cleanr spine — no DB row in `CRITICAL_EVENT_FALLBACKS`; model may still choose `send_email`. */
    review_submitted: [
        "review_followup",
        "review-followup",
        "review_followup_email",
        "post_review",
        "post-review",
        "review_thanks",
        "review-thanks",
        "thank_you",
        "thank-you",
        "review_submitted",
        "review-submitted",
        "retention",
        "cleanr_retention_post_review_v1",
    ],
    simplepaws_encourage_first_document: [
        SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE.encourage_first_document,
    ],
    simplepaws_complete_pet_enrichment: [
        SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE.complete_pet_enrichment,
    ],
    simplepaws_records_organization_prompt: [],
    simplepaws_vaccination_attention: [],
    simplepaws_insurance_records_prompt: [],
    simplepaws_plans_fit_message: [],
    simplepaws_inactivity_reengagement: [],
};
const EVENT_TEMPLATE_HINTS = {
    booking_abandoned: ["booking", "recover", "abandon", "resume"],
    booking_started: ["booking", "start", "continue", "complete"],
    booking_confirmed: ["booking", "confirm", "confirmation", "details"],
    clean_completed: ["review", "clean", "completed", "feedback"],
    review_submitted: ["review", "thanks", "thank", "rating", "feedback", "repeat", "retention", "stars"],
    simplepaws_encourage_first_document: ["simplepaws", "document", "encourage", "first"],
    simplepaws_complete_pet_enrichment: ["simplepaws", "enrichment", "pet", "profile", "complete"],
    simplepaws_records_organization_prompt: [
        "simplepaws",
        "records",
        "organization",
        "organize",
        "documents",
    ],
    simplepaws_vaccination_attention: [
        "simplepaws",
        "vaccination",
        "vaccine",
        "immunization",
        "pet",
        "records",
    ],
    simplepaws_insurance_records_prompt: [
        "simplepaws",
        "insurance",
        "coverage",
        "pet",
        "records",
        "medical",
    ],
    simplepaws_plans_fit_message: [
        "simplepaws",
        "plan",
        "capacity",
        "limit",
        "upgrade",
        "subscription",
    ],
    simplepaws_inactivity_reengagement: [
        "simplepaws",
        "reengage",
        "inactive",
        "return",
        "come",
        "back",
        "nudge",
    ],
};
function isSimplePawsEvent(context) {
    const t = context.event?.event_type;
    return typeof t === "string" && t.startsWith("simplepaws_");
}
function getSimplePawsIntentKey(context) {
    const et = context.event?.event_type;
    const payload = context.event?.payload;
    const topIntent = payload?.topIntent;
    const fromPayload = typeof topIntent?.intent === "string" && topIntent.intent.trim()
        ? topIntent.intent.trim()
        : null;
    if (fromPayload)
        return fromPayload;
    if (typeof et === "string" && SIMPLEPAWS_EVENT_TYPE_TO_INTENT_KEY[et]) {
        return SIMPLEPAWS_EVENT_TYPE_TO_INTENT_KEY[et];
    }
    return null;
}
function isKnownSimplePawsIntent(intentKey) {
    return SIMPLEPAWS_SUPPORTED_INTENTS.includes(intentKey);
}
function getSimplePawsNotificationTemplate(intentKey) {
    return SIMPLEPAWS_INTENT_TO_NOTIFICATION_TEMPLATE[intentKey] ?? intentKey;
}
function withSimplePawsNotificationObservability(decision, intentKey, notificationTemplate, guardrailNormalized, notificationFirstPolicy) {
    return {
        ...decision,
        simplepaws_notification: {
            intentKey,
            notificationTemplate,
            notificationTemplateSource: "policy_map",
            guardrailNormalized,
            notificationFirstPolicy,
        },
    };
}
function isCreativeRecommendationEligible(context) {
    const eventType = context.event?.event_type;
    return (typeof eventType === "string" &&
        CREATIVE_RECOMMENDATION_EVENT_TYPES.includes(eventType));
}
function asHookAngle(v) {
    if (typeof v !== "string")
        return null;
    return CREATIVE_HOOK_ANGLES.includes(v)
        ? v
        : null;
}
function asCta(v) {
    if (typeof v !== "string")
        return null;
    return CREATIVE_CTA_OPTIONS.includes(v) ? v : null;
}
function normalizeTemplateKeyForMatch(v) {
    return v.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findExactTemplateAliasMatch(allowedTemplateKeys, aliases) {
    if (!allowedTemplateKeys.length || !aliases.length)
        return null;
    const allowedByNorm = new Map(allowedTemplateKeys.map((k) => [normalizeTemplateKeyForMatch(k), k]));
    for (const alias of aliases) {
        const hit = allowedByNorm.get(normalizeTemplateKeyForMatch(alias));
        if (hit)
            return hit;
    }
    return null;
}
/**
 * Map model `send_email` template to an allowlisted `templates.key` for this brand (case-insensitive + event aliases).
 * Returns null when no safe match exists.
 */
function coerceNonSimplePawsSendEmailTemplateToAllowlist(modelTemplate, allowed, context) {
    if (allowed.includes(modelTemplate))
        return modelTemplate;
    const ci = allowed.find((k) => normalizeTemplateKeyForMatch(k) === normalizeTemplateKeyForMatch(modelTemplate));
    if (ci)
        return ci;
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : null;
    const aliasPool = eventType
        ? [modelTemplate, ...(EVENT_TEMPLATE_PREFERENCE_ALIASES[eventType] ?? [])]
        : [modelTemplate];
    return findExactTemplateAliasMatch(allowed, aliasPool);
}
function findHintTemplateMatch(allowedTemplateKeys, hints) {
    if (!allowedTemplateKeys.length || !hints.length)
        return null;
    const normHints = hints.map((h) => normalizeTemplateKeyForMatch(h)).filter(Boolean);
    if (!normHints.length)
        return null;
    let best = null;
    for (const key of allowedTemplateKeys) {
        const normKey = normalizeTemplateKeyForMatch(key);
        let score = 0;
        let bestHintForKey = "";
        for (const hint of normHints) {
            if (!hint)
                continue;
            if (normKey === hint) {
                score += 4;
                if (!bestHintForKey)
                    bestHintForKey = hint;
            }
            else if (normKey.startsWith(hint)) {
                score += 3;
                if (!bestHintForKey)
                    bestHintForKey = hint;
            }
            else if (normKey.includes(hint)) {
                score += 1;
                if (!bestHintForKey)
                    bestHintForKey = hint;
            }
        }
        if (!best || score > best.score) {
            best = { key, score, matchedHint: bestHintForKey || normHints[0] || "" };
        }
    }
    return best && best.score > 0 ? { templateKey: best.key, matchedHint: best.matchedHint } : null;
}
function pickDeterministicTemplateSelection(context) {
    const allowed = context.allowedTemplateKeys ?? [];
    if (allowed.length === 0) {
        return { templateKey: null, strategy: "first_allowlisted", reason: "No allowlisted templates" };
    }
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : null;
    if (eventType) {
        const exact = findExactTemplateAliasMatch(allowed, EVENT_TEMPLATE_PREFERENCE_ALIASES[eventType] ?? []);
        if (exact) {
            return {
                templateKey: exact,
                strategy: "exact_alias",
                reason: `Exact alias match for event ${eventType}`,
            };
        }
        const byHint = findHintTemplateMatch(allowed, EVENT_TEMPLATE_HINTS[eventType] ?? []);
        if (byHint) {
            return {
                templateKey: byHint.templateKey,
                strategy: "hint_match",
                reason: `Event hint match (${byHint.matchedHint}) for ${eventType}`,
            };
        }
    }
    const bookingLike = findHintTemplateMatch(allowed, ["booking", "abandon", "recover"]);
    if (bookingLike) {
        return {
            templateKey: bookingLike.templateKey,
            strategy: "generic_fallback",
            reason: `Generic booking fallback hint (${bookingLike.matchedHint})`,
        };
    }
    return {
        templateKey: allowed[0] ?? null,
        strategy: "first_allowlisted",
        reason: "Fell back to first allowlisted template",
    };
}
function pickDeterministicOffer(context, preferredOfferName) {
    const offers = Array.isArray(context.brandContext?.offers)
        ? context.brandContext?.offers
        : [];
    if (offers.length === 0)
        return { offerId: null, offerName: null };
    if (preferredOfferName) {
        const match = offers.find((o) => o.name === preferredOfferName);
        if (match) {
            return {
                offerId: typeof match.id === "string" ? match.id : null,
                offerName: typeof match.name === "string" ? match.name : null,
            };
        }
    }
    const first = offers[0];
    return {
        offerId: typeof first?.id === "string" ? first.id : null,
        offerName: typeof first?.name === "string" ? first.name : null,
    };
}
function pickDeterministicSegment(context) {
    const segments = Array.isArray(context.brandContext?.segments)
        ? context.brandContext?.segments
        : [];
    if (segments.length === 0)
        return { segmentKey: null, segmentName: null };
    const payload = context.event?.payload && typeof context.event.payload === "object"
        ? context.event.payload
        : null;
    const payloadSegmentKey = typeof payload?.segment_key === "string" ? payload.segment_key : null;
    if (payloadSegmentKey) {
        const match = segments.find((s) => s.key === payloadSegmentKey);
        if (match) {
            return {
                segmentKey: typeof match.key === "string" ? match.key : null,
                segmentName: typeof match.name === "string" ? match.name : null,
            };
        }
    }
    const first = segments[0];
    return {
        segmentKey: typeof first?.key === "string" ? first.key : null,
        segmentName: typeof first?.name === "string" ? first.name : null,
    };
}
function deterministicCreativeRecommendation(context, decision, reason, confidence, usedFallback) {
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : null;
    if (!eventType || !isCreativeRecommendationEligible(context))
        return null;
    const selection = pickDeterministicTemplateSelection(context);
    const templateKey = typeof decision.template === "string" ? decision.template : selection.templateKey;
    const offer = pickDeterministicOffer(context, decision.offer);
    const segment = pickDeterministicSegment(context);
    const eventDefaults = EVENT_DEFAULT_HOOK_CTA[eventType] ?? {
        hookAngle: "resume_booking",
        cta: "Continue now",
    };
    return {
        decisionType: "creative_recommendation",
        eventType,
        creativeMode: deriveCreativeMode(eventType),
        creativeObjective: deriveCreativeObjective(eventType),
        templateKey: templateKey ?? null,
        templateSelectionStrategy: selection.strategy,
        templateSelectionReason: selection.reason,
        offerId: offer.offerId,
        offerName: offer.offerName,
        segmentKey: segment.segmentKey,
        segmentName: segment.segmentName,
        hookAngle: eventDefaults.hookAngle,
        cta: eventDefaults.cta,
        rationale: [reason],
        confidence,
        usedFallback,
    };
}
function attachAdStyleSurfaceCreatives(rec) {
    const { paidSocialCreative: _p, organicSocialCreative: _o, ...base } = rec;
    void _p;
    void _o;
    if (base.creativeMode !== "ad_style") {
        return base;
    }
    const mirror = {
        segmentKey: rec.segmentKey,
        segmentName: rec.segmentName ?? null,
        offerId: rec.offerId,
        offerName: rec.offerName ?? null,
        hookAngle: rec.hookAngle,
        cta: rec.cta,
        rationale: rec.rationale,
        confidence: rec.confidence,
        usedFallback: rec.usedFallback,
    };
    const out = {
        ...base,
        paidSocialCreative: {
            decisionType: "paid_social_creative_recommendation",
            platformTarget: "generic_paid_social",
            formatProfileId: defaultFormatProfileIdForGenericPaidSocial(),
            ...mirror,
        },
    };
    if (ORGANIC_SOCIAL_CREATIVE_EVENT_TYPES.has(base.eventType)) {
        out.organicSocialCreative = {
            decisionType: "organic_social_creative_recommendation",
            platformTarget: "generic_organic_social",
            formatProfileId: defaultFormatProfileIdForGenericOrganicSocial(),
            ...mirror,
        };
    }
    return out;
}
function withCreativeRecommendation(decision, context, usedFallback) {
    if (!isCreativeRecommendationEligible(context))
        return decision;
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : "";
    const deterministic = deterministicCreativeRecommendation(context, decision, decision.reason ?? "Deterministic creative recommendation", Number.isFinite(decision.confidence) ? decision.confidence : null, usedFallback);
    if (!deterministic)
        return decision;
    const modelRec = decision.creative_recommendation;
    const allowedTemplates = context.allowedTemplateKeys ?? [];
    const segmentRows = Array.isArray(context.brandContext?.segments)
        ? context.brandContext?.segments
        : [];
    const candidateSegmentKey = typeof modelRec?.segmentKey === "string" ? modelRec.segmentKey : deterministic.segmentKey;
    const resolvedSegmentKey = candidateSegmentKey &&
        segmentRows.some((s) => typeof s.key === "string" && s.key === candidateSegmentKey)
        ? candidateSegmentKey
        : null;
    const eventHints = SEGMENT_TEMPLATE_PREFERENCE_HINTS[deterministic.eventType] ?? null;
    const segmentHints = resolvedSegmentKey && eventHints ? eventHints[resolvedSegmentKey] ?? null : null;
    const preferredFromSegment = segmentHints && allowedTemplates.length > 0
        ? findHintTemplateMatch(allowedTemplates, segmentHints)
        : null;
    let segmentTemplateStatus = "not_present";
    if (resolvedSegmentKey) {
        if (!segmentHints) {
            segmentTemplateStatus = "ignored_unmapped_segment";
        }
        else if (!preferredFromSegment) {
            segmentTemplateStatus = "ignored_no_hint_match";
        }
        else {
            segmentTemplateStatus = "applied";
        }
    }
    console.log(JSON.stringify({
        creative_segment_template_preference: true,
        event_type: deterministic.eventType,
        segment_key: resolvedSegmentKey,
        preferred_template: preferredFromSegment?.templateKey ?? null,
        status: segmentTemplateStatus,
    }));
    const baseTemplateFromModel = modelRec?.templateKey && allowedTemplates.includes(modelRec.templateKey)
        ? modelRec.templateKey
        : deterministic.templateKey;
    const finalRecommendedTemplate = preferredFromSegment?.templateKey ?? baseTemplateFromModel;
    const templateSource = preferredFromSegment
        ? "segment_preference"
        : modelRec?.templateKey && allowedTemplates.includes(modelRec.templateKey)
            ? "creative_recommendation"
            : usedFallback
                ? "fallback"
                : "decision";
    if (!modelRec) {
        const creative_recommendation = attachAdStyleSurfaceCreatives({
            ...deterministic,
            templateKey: finalRecommendedTemplate,
            templateSource,
            templateSelectionStrategy: preferredFromSegment
                ? "hint_match"
                : deterministic.templateSelectionStrategy,
            templateSelectionReason: preferredFromSegment
                ? `Segment preference hint match (${preferredFromSegment.matchedHint})`
                : deterministic.templateSelectionReason ?? null,
            segmentKey: resolvedSegmentKey ?? deterministic.segmentKey,
            segmentTemplatePreferenceStatus: segmentTemplateStatus,
        });
        return {
            ...decision,
            creative_recommendation,
        };
    }
    const offer = pickDeterministicOffer(context, modelRec.offerName ?? decision.offer);
    const segment = modelRec.segmentKey && Array.isArray(context.brandContext?.segments)
        ? (context.brandContext?.segments).find((s) => s.key === modelRec.segmentKey)
        : undefined;
    const creative_recommendation = attachAdStyleSurfaceCreatives({
        ...deterministic,
        decisionType: "creative_recommendation",
        eventType,
        templateKey: finalRecommendedTemplate,
        templateSource,
        templateSelectionStrategy: preferredFromSegment
            ? "hint_match"
            : modelRec?.templateKey && allowedTemplates.includes(modelRec.templateKey)
                ? "model_allowlisted"
                : deterministic.templateSelectionStrategy,
        templateSelectionReason: preferredFromSegment
            ? `Segment preference hint match (${preferredFromSegment.matchedHint})`
            : modelRec?.templateKey && allowedTemplates.includes(modelRec.templateKey)
                ? "Model-selected template accepted by allowlist"
                : deterministic.templateSelectionReason ?? null,
        offerId: offer.offerId,
        offerName: offer.offerName,
        segmentKey: resolvedSegmentKey ?? deterministic.segmentKey,
        segmentName: typeof segment?.name === "string" ? segment.name : deterministic.segmentName,
        segmentTemplatePreferenceStatus: segmentTemplateStatus,
        hookAngle: modelRec.hookAngle ?? deterministic.hookAngle,
        cta: modelRec.cta ?? deterministic.cta,
        rationale: modelRec.rationale && modelRec.rationale.length > 0
            ? modelRec.rationale
            : deterministic.rationale,
        confidence: typeof modelRec.confidence === "number"
            ? modelRec.confidence
            : deterministic.confidence,
        usedFallback: usedFallback ||
            !modelRec.templateKey ||
            !modelRec.hookAngle ||
            !modelRec.cta,
    });
    return {
        ...decision,
        creative_recommendation,
    };
}
/**
 * For SimplePaws events, send_email uses only the deterministic template for the resolved intent.
 * Model template is logged; final template is always the mapped key (or action becomes none if intent cannot be mapped).
 * Non–SimplePaws decisions are unchanged.
 */
export function applySimplePawsTemplateGuardrail(decision, context) {
    if (!isSimplePawsEvent(context)) {
        return decision;
    }
    if (decision.action !== "send_email") {
        return decision;
    }
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : null;
    const intentKey = getSimplePawsIntentKey(context);
    const modelTemplate = decision.template?.trim() || null;
    const logBase = {
        simplepaws_template_guardrail: true,
        event_type: eventType,
        intent_key: intentKey,
        model_template: modelTemplate,
    };
    if (!intentKey) {
        console.log(JSON.stringify({
            ...logBase,
            final_template: null,
            guardrail_override: true,
            outcome: "rejected_missing_intent_key",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: "SimplePaws guardrail: could not resolve intent_key from event_type or payload.topIntent",
        };
    }
    const requiredTemplate = SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE[intentKey];
    if (!requiredTemplate) {
        console.log(JSON.stringify({
            ...logBase,
            final_template: null,
            guardrail_override: true,
            outcome: "rejected_unmapped_intent",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: `SimplePaws guardrail: no deterministic email template for intent "${intentKey}"`,
        };
    }
    const guardrailOverride = modelTemplate !== requiredTemplate;
    console.log(JSON.stringify({
        ...logBase,
        final_template: requiredTemplate,
        guardrail_override: guardrailOverride,
    }));
    return {
        ...decision,
        template: requiredTemplate,
        reason: guardrailOverride
            ? decision.reason
                ? `${decision.reason} | SimplePaws guardrail: template set to ${requiredTemplate}`
                : `SimplePaws guardrail: template set to ${requiredTemplate}`
            : decision.reason,
    };
}
/**
 * Non–SimplePaws: `send_email` may only use `templates.key` values loaded for this brand.
 * Rejects missing/unknown keys with `none` so `enqueue_message` never receives an invented key.
 */
export function applyNonSimplePawsEmailTemplateGuardrail(decision, context) {
    if (isSimplePawsEvent(context)) {
        return decision;
    }
    if (decision.action !== "send_email") {
        return decision;
    }
    const allowed = context.allowedTemplateKeys ?? [];
    const modelTemplate = decision.template?.trim() || null;
    const logBase = {
        non_simplepaws_template_guardrail: true,
        brand_id: context.brand_id,
        model_template: modelTemplate,
        allowed_count: allowed.length,
    };
    if (allowed.length === 0) {
        console.log(JSON.stringify({
            ...logBase,
            guardrail_override: true,
            outcome: "rejected_no_brand_templates",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: "Non–SimplePaws guardrail: no email template keys configured for this brand in `templates`",
        };
    }
    if (!modelTemplate) {
        console.log(JSON.stringify({
            ...logBase,
            guardrail_override: true,
            outcome: "rejected_missing_template",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: "Non–SimplePaws guardrail: send_email requires a template key from brand.allowed_email_template_keys",
        };
    }
    const canonicalTemplate = coerceNonSimplePawsSendEmailTemplateToAllowlist(modelTemplate, allowed, context);
    if (!canonicalTemplate) {
        console.log(JSON.stringify({
            ...logBase,
            final_template: null,
            guardrail_override: true,
            outcome: "rejected_template_not_in_allowlist",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: `Non–SimplePaws guardrail: template "${modelTemplate}" is not among this brand's template keys`,
        };
    }
    if (canonicalTemplate !== modelTemplate) {
        console.log(JSON.stringify({
            ...logBase,
            guardrail_override: false,
            outcome: "coerced_to_allowlisted_template",
            model_template: modelTemplate,
            final_template: canonicalTemplate,
        }));
    }
    return {
        ...decision,
        template: canonicalTemplate,
    };
}
function finalizeDecision(decision, context) {
    const policyDecision = applySimplePawsActionGuardrail(applySimplePawsTemplateGuardrail(applyNonSimplePawsEmailTemplateGuardrail(decision, context), context), context);
    return applyAiRules(policyDecision, context);
}
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asAction(v) {
    if (typeof v !== "string")
        return null;
    return isValidAction(v) ? v : null;
}
/**
 * Minimal deterministic ai_rules support for runtime guardrails.
 * Unknown/invalid rows are ignored (with log) to avoid accidental behavior drift.
 *
 * Supported rule_type:
 * - force_action: { action, template?, offer?, incentive?, reason? }
 * - block_action: { action, reason? }
 * - allow_template_keys: { keys: string[] } (send_email only)
 */
function applyAiRules(decision, context) {
    const rows = Array.isArray(context.ai_rules) ? context.ai_rules : [];
    if (rows.length === 0)
        return decision;
    let out = decision;
    for (const row of rows) {
        const ruleType = typeof row.rule_type === "string" ? row.rule_type.trim() : "";
        const cfg = isRecord(row.rule_config) ? row.rule_config : null;
        const ruleName = typeof row.rule_name === "string" && row.rule_name.trim()
            ? row.rule_name.trim()
            : row.id ?? "unnamed_rule";
        if (!ruleType || !cfg) {
            console.log(JSON.stringify({
                ai_rule_enforced: false,
                rule_name: ruleName,
                outcome: "ignored_invalid_shape",
            }));
            continue;
        }
        if (ruleType === "force_action") {
            const forcedAction = asAction(cfg.action);
            if (!forcedAction) {
                console.log(JSON.stringify({
                    ai_rule_enforced: false,
                    rule_name: ruleName,
                    rule_type: ruleType,
                    outcome: "ignored_invalid_action",
                }));
                continue;
            }
            out = {
                ...out,
                action: forcedAction,
                template: typeof cfg.template === "string" ? cfg.template : out.template,
                offer: typeof cfg.offer === "string" ? cfg.offer : out.offer,
                incentive: typeof cfg.incentive === "string" ? cfg.incentive : out.incentive,
                reason: [
                    out.reason,
                    typeof cfg.reason === "string" && cfg.reason.trim()
                        ? cfg.reason.trim()
                        : `ai_rules force_action: ${ruleName}`,
                ]
                    .filter(Boolean)
                    .join(" | "),
            };
            console.log(JSON.stringify({
                ai_rule_enforced: true,
                rule_name: ruleName,
                rule_type: ruleType,
                outcome: "forced_action",
                final_action: out.action,
            }));
            continue;
        }
        if (ruleType === "block_action") {
            const blockedAction = asAction(cfg.action);
            if (!blockedAction) {
                console.log(JSON.stringify({
                    ai_rule_enforced: false,
                    rule_name: ruleName,
                    rule_type: ruleType,
                    outcome: "ignored_invalid_action",
                }));
                continue;
            }
            if (out.action === blockedAction) {
                out = {
                    ...out,
                    action: "none",
                    template: undefined,
                    reason: [
                        out.reason,
                        typeof cfg.reason === "string" && cfg.reason.trim()
                            ? cfg.reason.trim()
                            : `ai_rules block_action: ${ruleName} blocked ${blockedAction}`,
                    ]
                        .filter(Boolean)
                        .join(" | "),
                };
                console.log(JSON.stringify({
                    ai_rule_enforced: true,
                    rule_name: ruleName,
                    rule_type: ruleType,
                    outcome: "blocked_action",
                    blocked_action: blockedAction,
                }));
            }
            continue;
        }
        if (ruleType === "allow_template_keys") {
            const keys = Array.isArray(cfg.keys) && cfg.keys.every((k) => typeof k === "string")
                ? cfg.keys
                : null;
            if (!keys || keys.length === 0) {
                console.log(JSON.stringify({
                    ai_rule_enforced: false,
                    rule_name: ruleName,
                    rule_type: ruleType,
                    outcome: "ignored_invalid_keys",
                }));
                continue;
            }
            if (out.action === "send_email" &&
                typeof out.template === "string" &&
                !keys.includes(out.template)) {
                out = {
                    ...out,
                    action: "none",
                    template: undefined,
                    reason: `${out.reason ?? ""}${out.reason ? " | " : ""}ai_rules allow_template_keys: template "${out.template}" not allowed by ${ruleName}`,
                };
                console.log(JSON.stringify({
                    ai_rule_enforced: true,
                    rule_name: ruleName,
                    rule_type: ruleType,
                    outcome: "blocked_template_not_allowed",
                }));
            }
            continue;
        }
        console.log(JSON.stringify({
            ai_rule_enforced: false,
            rule_name: ruleName,
            rule_type: ruleType,
            outcome: "ignored_unsupported_rule_type",
        }));
    }
    return out;
}
/**
 * Enforces SimplePaws channel policy without bypassing existing queue/worker rails.
 * Unsupported email intents degrade to in-app notification (or none if intent unknown).
 */
export function applySimplePawsActionGuardrail(decision, context) {
    if (!isSimplePawsEvent(context)) {
        return decision;
    }
    const intentKey = getSimplePawsIntentKey(context);
    const eventType = typeof context.event?.event_type === "string" ? context.event.event_type : null;
    const logBase = {
        simplepaws_action_guardrail: true,
        event_type: eventType,
        intent_key: intentKey,
        model_action: decision.action,
        model_template: decision.template ?? null,
    };
    if (!intentKey || !isKnownSimplePawsIntent(intentKey)) {
        console.log(JSON.stringify({
            ...logBase,
            final_action: "none",
            final_template: null,
            guardrail_override: decision.action !== "none",
            outcome: "rejected_unknown_intent",
        }));
        return {
            action: "none",
            template: undefined,
            offer: decision.offer,
            incentive: decision.incentive,
            confidence: decision.confidence,
            reason: decision.reason ??
                "SimplePaws guardrail: intent_key missing or unknown for channel policy",
        };
    }
    const policy = SIMPLEPAWS_INTENT_CHANNEL_POLICY[intentKey];
    const notificationTemplate = getSimplePawsNotificationTemplate(intentKey);
    const notificationFirstPolicy = !policy.allowEmail && policy.allowNotification;
    if (decision.action === "send_email" && !policy.allowEmail) {
        if (policy.allowNotification) {
            console.log(JSON.stringify({
                ...logBase,
                final_action: "send_notification",
                final_template: notificationTemplate,
                guardrail_override: true,
                outcome: "downgraded_email_to_notification",
            }));
            return withSimplePawsNotificationObservability({
                ...decision,
                action: "send_notification",
                template: notificationTemplate,
                reason: decision.reason
                    ? `${decision.reason} | SimplePaws guardrail: email disabled for ${intentKey}, using in-app notification`
                    : `SimplePaws guardrail: email disabled for ${intentKey}, using in-app notification`,
            }, intentKey, notificationTemplate, true, notificationFirstPolicy);
        }
        return {
            ...decision,
            action: "none",
            template: undefined,
            reason: decision.reason
                ? `${decision.reason} | SimplePaws guardrail: email disabled for ${intentKey}`
                : `SimplePaws guardrail: email disabled for ${intentKey}`,
        };
    }
    if (decision.action === "send_notification" && decision.template !== notificationTemplate) {
        console.log(JSON.stringify({
            ...logBase,
            final_action: "send_notification",
            final_template: notificationTemplate,
            guardrail_override: true,
            outcome: decision.template ? "notification_template_guardrailed" : "notification_template_defaulted",
        }));
        return withSimplePawsNotificationObservability({
            ...decision,
            template: notificationTemplate,
            reason: decision.template
                ? decision.reason
                    ? `${decision.reason} | SimplePaws guardrail: notification template set to ${notificationTemplate}`
                    : `SimplePaws guardrail: notification template set to ${notificationTemplate}`
                : decision.reason,
        }, intentKey, notificationTemplate, true, notificationFirstPolicy);
    }
    if (decision.action === "none" &&
        policy.allowNotification &&
        typeof decision.reason === "string" &&
        decision.reason.includes("no deterministic email template")) {
        console.log(JSON.stringify({
            ...logBase,
            final_action: "send_notification",
            final_template: notificationTemplate,
            guardrail_override: true,
            outcome: "fallback_notification_for_unmapped_email_intent",
        }));
        return withSimplePawsNotificationObservability({
            ...decision,
            action: "send_notification",
            template: notificationTemplate,
            reason: `${decision.reason} | SimplePaws guardrail: using in-app notification fallback`,
        }, intentKey, notificationTemplate, true, notificationFirstPolicy);
    }
    if (decision.action === "send_notification") {
        return withSimplePawsNotificationObservability(decision, intentKey, notificationTemplate, false, notificationFirstPolicy);
    }
    return decision;
}
function getDeterministicFallback(context, reason) {
    const eventType = context.event?.event_type;
    if (typeof eventType !== "string")
        return null;
    const fallback = CRITICAL_EVENT_FALLBACKS[eventType];
    if (!fallback)
        return null;
    return {
        action: fallback.action,
        template: fallback.template,
        confidence: 0.5,
        reason: `Deterministic fallback: ${reason}`,
    };
}
/**
 * **Promoted notification-first slices (3–7) + deferred intents** with `allowEmail: false`:
 * emit `send_notification` with the policy-map key **before** OpenAI.
 *
 * **Skipped** when `allowEmail: true` (promoted email slices 1–2): those intents use the normal OpenAI
 * decision path for first action on `ai_decision` jobs, with email/notification then guardrailed — or
 * operators route those events to `sequence` instead (see `docs/SIMPLEPAWS_SETUP.md`).
 *
 * Resolves intent from generic `simplepaws_intent` or dedicated `simplepaws_*` + `payload.topIntent`.
 */
function tryDeterministicSimplePawsNotificationFirstDecision(context) {
    if (!isSimplePawsEvent(context))
        return null;
    const intentKeyRaw = getSimplePawsIntentKey(context);
    if (!intentKeyRaw || !isKnownSimplePawsIntent(intentKeyRaw))
        return null;
    const policy = SIMPLEPAWS_INTENT_CHANNEL_POLICY[intentKeyRaw];
    if (!policy?.allowNotification || policy.allowEmail)
        return null;
    const template = getSimplePawsNotificationTemplate(intentKeyRaw);
    return {
        action: "send_notification",
        template,
        confidence: 0.92,
        reason: `Deterministic notification-first: SimplePaws intent "${intentKeyRaw}" (policy: no email template in Kinex; in-app template from policy map).`,
    };
}
const SOCIAL_COPY_GENERATION_MAX_TOKENS = 512;
const SOCIAL_COPY_GENERATION_SOURCE = "openai_v1";
function isSocialCopyGenerationEnabled() {
    const v = (process.env.KINEX_SOCIAL_COPY_GENERATION ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
const BRAND_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * When non-null, copy generation runs only for `context.brand_id` in this set (lowercased UUIDs).
 * Empty set = gate active but no valid tokens in env — no brand passes.
 */
function parseSocialCopyGenerationBrandAllowlist() {
    const raw = (process.env.KINEX_SOCIAL_COPY_GENERATION_BRAND_IDS ?? "").trim();
    if (!raw)
        return null;
    const set = new Set();
    for (const part of raw
        .split(/[,;\s]+/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)) {
        if (BRAND_UUID_RE.test(part))
            set.add(part);
        else
            console.warn("[AI Worker] KINEX_SOCIAL_COPY_GENERATION_BRAND_IDS: ignored non-UUID token:", part);
    }
    if (set.size === 0) {
        console.warn("[AI Worker] KINEX_SOCIAL_COPY_GENERATION_BRAND_IDS: no valid UUIDs; selective brand gate denies all.");
    }
    return set;
}
/**
 * When non-null, copy generation runs only for `creative_recommendation.creativeObjective` in this set.
 * Tokens must match worker `CreativeObjective` strings. Empty set = gate active but misconfigured — no objective passes.
 */
function parseSocialCopyGenerationObjectiveAllowlist() {
    const raw = (process.env.KINEX_SOCIAL_COPY_GENERATION_OBJECTIVES ?? "").trim();
    if (!raw)
        return null;
    const set = new Set();
    for (const part of raw
        .split(/[,;\s]+/)
        .map((p) => p.trim())
        .filter(Boolean)) {
        if (isCreativeObjective(part))
            set.add(part);
        else
            console.warn("[AI Worker] KINEX_SOCIAL_COPY_GENERATION_OBJECTIVES: unknown objective ignored:", part);
    }
    if (set.size === 0) {
        console.warn("[AI Worker] KINEX_SOCIAL_COPY_GENERATION_OBJECTIVES: no valid objectives; selective objective gate denies all.");
    }
    return set;
}
function socialCopyGenerationSelectiveContext(context, rec) {
    return {
        brand_id: context.brand_id ?? null,
        creative_objective: isCreativeObjective(rec.creativeObjective) ? rec.creativeObjective : null,
    };
}
function safeParseJsonObject(raw) {
    if (!raw)
        return null;
    try {
        const v = JSON.parse(raw);
        return isRecord(v) ? v : null;
    }
    catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
            try {
                const v = JSON.parse(raw.slice(start, end + 1));
                return isRecord(v) ? v : null;
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
function normalizeCopyVariantRow(contract, variantId, headline, primaryText, notes) {
    if (variantId !== "a" && variantId !== "b")
        return null;
    let h = typeof headline === "string" ? headline.trim() : "";
    let p = typeof primaryText === "string" ? primaryText.trim() : "";
    if (h.length > contract.headlineMaxChars)
        h = h.slice(0, contract.headlineMaxChars);
    if (p.length > contract.primaryTextMaxChars)
        p = p.slice(0, contract.primaryTextMaxChars);
    const nRaw = typeof notes === "string" ? notes.trim() : "";
    const n = nRaw.length > 0 ? nRaw.slice(0, 400) : undefined;
    const { aligned } = deriveSocialCopyVariantCompliance(contract, h, p);
    if (!aligned)
        return null;
    const row = { variantId, headline: h, primaryText: p };
    if (n)
        row.notes = n;
    return row;
}
function parseSurfaceVariantsFromModel(surfaceRoot, contract) {
    if (!isRecord(surfaceRoot))
        return [];
    const variants = surfaceRoot.variants;
    if (!Array.isArray(variants))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of variants) {
        if (!isRecord(item))
            continue;
        const row = normalizeCopyVariantRow(contract, item.variantId, item.headline, item.primaryText, item.notes);
        if (!row)
            continue;
        if (seen.has(row.variantId))
            continue;
        seen.add(row.variantId);
        out.push(row);
        if (out.length >= contract.maxVariants)
            break;
    }
    return out;
}
function mergeCopyGenerationObs(decision, evaluatedAt, patch) {
    const obs = {
        decisionType: CREATIVE_SOCIAL_COPY_GENERATION_DECISION_TYPE,
        evaluatedAt,
        attempted: patch.attempted,
        status: patch.status,
    };
    if (patch.surfacesRequested)
        obs.surfacesRequested = patch.surfacesRequested;
    if (patch.selectiveContext !== undefined)
        obs.selectiveContext = patch.selectiveContext;
    if (patch.paid !== undefined)
        obs.paid = patch.paid;
    if (patch.organic !== undefined)
        obs.organic = patch.organic;
    return { ...decision, creative_social_copy_generation: obs };
}
/**
 * Second bounded OpenAI call: headline/primaryText variants only, sibling to recommendation.
 * Default-off (`KINEX_SOCIAL_COPY_GENERATION`); failures are logged and ignored.
 * Always persists `creative_social_copy_generation` observability (bounded) when this runs.
 */
async function withOptionalSocialCopyVariants(decision, context) {
    const evaluatedAt = new Date().toISOString();
    const rec = decision.creative_recommendation;
    if (!rec) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "ineligible_no_recommendation",
        });
    }
    if (rec.creativeMode !== "ad_style") {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "ineligible_not_ad_style",
        });
    }
    if (!rec.paidSocialCreative) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "ineligible_no_paid_mirror",
        });
    }
    const wantsOrganic = Boolean(rec.organicSocialCreative);
    const paidProfileId = rec.paidSocialCreative.formatProfileId;
    const paidSpec = getSocialFormatProfileSpec(paidProfileId);
    const organicSpec = wantsOrganic
        ? getSocialFormatProfileSpec(rec.organicSocialCreative.formatProfileId)
        : null;
    if (!paidSpec || (wantsOrganic && !organicSpec)) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "ineligible_profile_spec",
            surfacesRequested: { paid: true, organic: wantsOrganic },
        });
    }
    const surfacesRequested = { paid: true, organic: wantsOrganic };
    if (!isSocialCopyGenerationEnabled()) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "skipped_flag_off",
            surfacesRequested,
        });
    }
    const brandAllowlist = parseSocialCopyGenerationBrandAllowlist();
    if (brandAllowlist !== null) {
        const bid = (context.brand_id ?? "").trim().toLowerCase();
        if (!bid || !brandAllowlist.has(bid)) {
            return mergeCopyGenerationObs(decision, evaluatedAt, {
                attempted: false,
                status: "skipped_selective_brand",
                surfacesRequested,
                selectiveContext: socialCopyGenerationSelectiveContext(context, rec),
            });
        }
    }
    const objectiveAllowlist = parseSocialCopyGenerationObjectiveAllowlist();
    if (objectiveAllowlist !== null) {
        const obj = rec.creativeObjective;
        if (!isCreativeObjective(obj) || !objectiveAllowlist.has(obj)) {
            return mergeCopyGenerationObs(decision, evaluatedAt, {
                attempted: false,
                status: "skipped_selective_objective",
                surfacesRequested,
                selectiveContext: socialCopyGenerationSelectiveContext(context, rec),
            });
        }
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "skipped_no_openai_key",
            surfacesRequested,
        });
    }
    if (decision.creative_social_copy_variants) {
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: false,
            status: "skipped_already_present",
            surfacesRequested,
        });
    }
    const upstreamSignals = buildCreativeUpstreamSignalPayload({
        eventType: rec.eventType,
        creativeMode: rec.creativeMode,
        creativeObjective: rec.creativeObjective,
        segmentKey: rec.segmentKey,
        segmentName: rec.segmentName ?? null,
        offerName: rec.offerName ?? null,
        hookAngle: rec.hookAngle,
        cta: rec.cta,
        rationale: rec.rationale,
        templateKey: rec.templateKey,
    });
    const userPayload = {
        bounded_contract: {
            paid_profile_id: paidProfileId,
            organic_profile_id: wantsOrganic ? rec.organicSocialCreative.formatProfileId : null,
            headline_max_chars: paidSpec.copyVariantContract.headlineMaxChars,
            primary_text_max_chars: paidSpec.copyVariantContract.primaryTextMaxChars,
            max_variants_per_surface: paidSpec.copyVariantContract.maxVariants,
            include_paid: true,
            include_organic: wantsOrganic,
        },
        recommendation_context: {
            event_type: rec.eventType,
            creative_mode: rec.creativeMode,
            creative_objective: rec.creativeObjective,
            segment_key: rec.segmentKey,
            segment_name: rec.segmentName ?? null,
            offer_name: rec.offerName ?? null,
            hook_angle: rec.hookAngle,
            cta: rec.cta,
            rationale: rec.rationale,
            template_key: rec.templateKey,
            upstream_signal_summary: upstreamSignals.upstream_signal_summary,
            segment_resolution: upstreamSignals.segment_resolution,
            offer_resolution: upstreamSignals.offer_resolution,
        },
    };
    const organicSchemaLine = wantsOrganic
        ? ',\n  "organic": { "variants": [ { "variantId": "a" | "b", "headline": string, "primaryText": string, "notes"?: string } ] }'
        : "";
    const inactivityReengagementSocialCopyRules = rec.eventType === "simplepaws_inactivity_reengagement"
        ? `
- simplepaws_inactivity_reengagement only: Lead with practical re-engagement, not pet sentiment. Every headline and primaryText must stay faithful to hook_angle, cta, and the first non-empty rationale line in recommendation_context.rationale (paraphrase ok). Spine: mirror recommendation_context.cta — if it is about resuming (e.g. pick up / continue / where you left off), use that resume/continue/continuity vocabulary explicitly; do not substitute unrelated emotional hooks.
- simplepaws_inactivity_reengagement only: Do not use anthropomorphic pet-emotion framing (pet missing the user, pet waiting, pet wanting attention, "your pet misses you", "they're waiting", etc.) unless that exact idea appears verbatim in hook_angle, cta, or rationale. Do not use "furry friend", "fur baby", or similar pet-nickname fluff.
- simplepaws_inactivity_reengagement only: Hard avoid these themes/words unless they appear verbatim in hook_angle, cta, or rationale: "miss you" / "misses you", "fun", "adventure" / "adventures", "waiting for you", playful pet fantasy. Prefer: resume, continue, pick up, unfinished, quick, simple, save time, stay on track, continuity, account/app value.
- simplepaws_inactivity_reengagement only: VariantId "a" must be continuity/progress-oriented (resume where they left off, finish what they started, stay on track). VariantId "b" must be ease/value-oriented (speed, simplicity, low friction, practical benefit) — not a light rephrase of "a"; different primary promise in both headline and primaryText.
- simplepaws_inactivity_reengagement only: Do not invent pet-specific facts (names, breeds, ages, health) absent from the input JSON.`
        : "";
    const userMessage = `You generate bounded social copy variants for operator review only (not published).
Input JSON:
${JSON.stringify(userPayload, null, 2)}

Respond with strict JSON only matching this shape:
{
  "paid": { "variants": [ { "variantId": "a" | "b", "headline": string, "primaryText": string, "notes"?: string } ] }${organicSchemaLine}
}

Rules:
- At most ${paidSpec.copyVariantContract.maxVariants} variants per surface; variantId must be "a" or "b" with no duplicate ids within a surface.
- headline and primaryText must be non-empty and at or under headline_max_chars / primary_text_max_chars from bounded_contract (character length).
- notes optional, max 400 characters.
- ${wantsOrganic ? 'Include both "paid" and "organic" keys (each with variants array).' : 'Include only "paid"; omit "organic".'}
- Align with hook_angle and cta; do not invent offers or claims beyond recommendation_context.
- If segment_resolution or offer_resolution is "missing", do not invent segment-specific claims or named offers; stay generic and aligned with hook_angle and cta only.${inactivityReengagementSocialCopyRules}`;
    const configuredModel = context.ai_model_config?.model_name?.trim() || OPENAI_MODEL;
    try {
        const response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: configuredModel,
                temperature: 0.2,
                max_tokens: SOCIAL_COPY_GENERATION_MAX_TOKENS,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: "You are Kinex copy assist. Reply with JSON only. Output is for internal operator review only; do not state that ads were published, scheduled, or sent to any network.",
                    },
                    { role: "user", content: userMessage },
                ],
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.log(JSON.stringify({
                kinex_social_copy_generation: true,
                outcome: "openai_http_error",
                status: response.status,
                detail: text.slice(0, 500),
            }));
            return mergeCopyGenerationObs(decision, evaluatedAt, {
                attempted: true,
                status: "attempted_error_http",
                surfacesRequested,
            });
        }
        const json = (await response.json());
        const rawContent = json.choices?.[0]?.message?.content?.trim() ?? "";
        const parsed = safeParseJsonObject(rawContent);
        if (!parsed) {
            console.log(JSON.stringify({
                kinex_social_copy_generation: true,
                outcome: "parse_failed",
            }));
            return mergeCopyGenerationObs(decision, evaluatedAt, {
                attempted: true,
                status: "attempted_error_parse",
                surfacesRequested,
            });
        }
        const stored = {
            decisionType: CREATIVE_SOCIAL_COPY_VARIANTS_DECISION_TYPE,
            source: SOCIAL_COPY_GENERATION_SOURCE,
            generatedAt: new Date().toISOString(),
        };
        const paidRows = parseSurfaceVariantsFromModel(parsed.paid, paidSpec.copyVariantContract);
        if (paidRows.length > 0) {
            stored.paid = {
                formatProfileId: paidProfileId,
                variants: paidRows,
            };
        }
        if (wantsOrganic && organicSpec) {
            const organicRows = parseSurfaceVariantsFromModel(parsed.organic, organicSpec.copyVariantContract);
            if (organicRows.length > 0) {
                stored.organic = {
                    formatProfileId: rec.organicSocialCreative.formatProfileId,
                    variants: organicRows,
                };
            }
        }
        if (!stored.paid && !stored.organic) {
            console.log(JSON.stringify({
                kinex_social_copy_generation: true,
                outcome: "no_compliant_variants",
            }));
            return mergeCopyGenerationObs(decision, evaluatedAt, {
                attempted: true,
                status: "attempted_rejected_noncompliant",
                surfacesRequested,
                paid: "none",
                organic: wantsOrganic ? "none" : "not_applicable",
            });
        }
        const paidOk = Boolean(stored.paid?.variants.length);
        const organicOk = Boolean(stored.organic?.variants.length);
        const paidOutcome = paidOk ? "generated" : "none";
        const organicOutcome = !wantsOrganic
            ? "not_applicable"
            : organicOk
                ? "generated"
                : "none";
        let genStatus;
        if (!wantsOrganic || (paidOk && organicOk)) {
            genStatus = "generated";
        }
        else {
            genStatus = "partial";
        }
        console.log(JSON.stringify({
            kinex_social_copy_generation: true,
            outcome: "attached",
            event_type: rec.eventType,
            paid_variants: stored.paid?.variants.length ?? 0,
            organic_variants: stored.organic?.variants.length ?? 0,
            generation_status: genStatus,
        }));
        return mergeCopyGenerationObs({ ...decision, creative_social_copy_variants: stored }, evaluatedAt, {
            attempted: true,
            status: genStatus,
            surfacesRequested,
            paid: paidOutcome,
            organic: organicOutcome,
        });
    }
    catch (err) {
        console.log(JSON.stringify({
            kinex_social_copy_generation: true,
            outcome: "exception",
            detail: err instanceof Error ? err.message : String(err),
        }));
        return mergeCopyGenerationObs(decision, evaluatedAt, {
            attempted: true,
            status: "attempted_error_exception",
            surfacesRequested,
        });
    }
}
function isCreativeAssetBriefEnabled() {
    const v = (process.env.KINEX_CREATIVE_ASSET_BRIEF ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
function mapCopyVariantHeadlinesForBrief(block) {
    if (!block?.variants?.length)
        return null;
    const out = [];
    for (const row of block.variants) {
        if (row.variantId !== "a" && row.variantId !== "b")
            continue;
        out.push({ variantId: row.variantId, headline: row.headline });
    }
    return out.length > 0 ? out : null;
}
/**
 * Default-off (`KINEX_CREATIVE_ASSET_BRIEF`). Deterministic brief from recommendation + optional copy variants only.
 * Append-only: skips if `creative_asset_brief` already present.
 */
function withOptionalCreativeAssetBrief(decision) {
    if (!isCreativeAssetBriefEnabled())
        return decision;
    if (decision.creative_asset_brief)
        return decision;
    const rec = decision.creative_recommendation;
    if (!rec || rec.creativeMode !== "ad_style" || !rec.paidSocialCreative)
        return decision;
    const paidProfile = rec.paidSocialCreative.formatProfileId;
    if (!paidProfile || !getSocialFormatProfileSpec(paidProfile))
        return decision;
    const cv = decision.creative_social_copy_variants;
    const assembledAt = new Date().toISOString();
    const rationaleLines = Array.isArray(rec.rationale)
        ? rec.rationale.filter((x) => typeof x === "string")
        : [];
    const brief = buildCreativeAssetBriefFromInputs({
        creativeMode: rec.creativeMode,
        creativeObjective: rec.creativeObjective,
        eventType: rec.eventType,
        segmentKey: rec.segmentKey,
        segmentName: rec.segmentName ?? null,
        offerName: rec.offerName ?? null,
        hookAnglePrimary: rec.hookAngle,
        rationaleLines,
        paid: {
            hookAngle: rec.paidSocialCreative.hookAngle,
            cta: rec.paidSocialCreative.cta,
            formatProfileId: rec.paidSocialCreative.formatProfileId ?? null,
        },
        organic: rec.organicSocialCreative
            ? {
                hookAngle: rec.organicSocialCreative.hookAngle,
                cta: rec.organicSocialCreative.cta,
                formatProfileId: rec.organicSocialCreative.formatProfileId ?? null,
            }
            : null,
        copyVariantsPaid: cv ? mapCopyVariantHeadlinesForBrief(cv.paid) : null,
        copyVariantsOrganic: cv ? mapCopyVariantHeadlinesForBrief(cv.organic) : null,
    }, assembledAt);
    if (!brief)
        return decision;
    return { ...decision, creative_asset_brief: brief };
}
async function finishWithCreativeSurfaces(decision, context, usedFallback) {
    const finalized = finalizeDecision(decision, context);
    const withRec = withCreativeRecommendation(finalized, context, usedFallback);
    const afterCopy = await withOptionalSocialCopyVariants(withRec, context);
    return withOptionalCreativeAssetBrief(afterCopy);
}
/** Same as `finishWithCreativeSurfaces` but skips `finalizeDecision` (matches legacy OpenAI hard-fail paths). */
async function finishWithCreativeSurfacesWithoutFinalize(decision, context, usedFallback) {
    const withRec = withCreativeRecommendation(decision, context, usedFallback);
    const afterCopy = await withOptionalSocialCopyVariants(withRec, context);
    return withOptionalCreativeAssetBrief(afterCopy);
}
export async function runDecision(context) {
    const deterministicNotificationFirst = tryDeterministicSimplePawsNotificationFirstDecision(context);
    if (deterministicNotificationFirst) {
        return finishWithCreativeSurfaces(deterministicNotificationFirst, context, true);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn("[AI Worker] Missing OPENAI_API_KEY, defaulting to none decision");
        return {
            action: "none",
            reason: "Missing OPENAI_API_KEY environment variable",
            confidence: 0,
        };
    }
    const aiInput = buildAiInput(context);
    const prompt = `Decision input (JSON):\n${JSON.stringify(aiInput, null, 2)}\n\nChoose the best action. Allowed actions: send_email, send_sms, send_notification, enqueue_sequence, none.\nUse only the services, offers, and incentives provided in brand.services, brand.offers, and brand.incentives. offers must match one of brand.offers[].name. incentives must match one of brand.incentives[].name. Do not invent new offers or incentives.\nFor send_email on non–SimplePaws events, template must be exactly one of brand.allowed_email_template_keys when that array is non-empty; if it is empty, do not choose send_email.\nIf event.event_type is one of ${CREATIVE_RECOMMENDATION_EVENT_TYPES.join(", ")}, include creative_recommendation with bounded values only:\n- hookAngle: one of ${CREATIVE_HOOK_ANGLES.join(", ")}\n- cta: one of ${CREATIVE_CTA_OPTIONS.join(" | ")}\n- templateKey from brand.allowed_email_template_keys or null\n- segmentKey from brand.segments[].key or null\n- offerName from brand.offers[].name or null\n- rationale as short string array\n- confidence as number 0..1\nDo not include creativeMode or creativeObjective in your JSON; Kinex sets those deterministically from event.event_type.\n\nRespond with strict JSON only in the form:\n{\n  "action": "send_email" | "send_sms" | "send_notification" | "enqueue_sequence" | "none",\n  "template": "optional-template-or-sequence-key",\n  "offer": "optional-offer-name-from-brand.offers",\n  "incentive": "optional-incentive-name-from-brand.incentives",\n  "confidence": 0.0,\n  "reason": "why you chose this action",\n  "creative_recommendation": {\n    "templateKey": "optional-template-key-or-null",\n    "offerName": "optional-offer-name-or-null",\n    "segmentKey": "optional-segment-key-or-null",\n    "hookAngle": "bounded-hook-angle-or-null",\n    "cta": "bounded-cta-or-null",\n    "rationale": ["short reason"],\n    "confidence": 0.0\n  }\n}`;
    try {
        const configuredModel = context.ai_model_config?.model_name?.trim() || OPENAI_MODEL;
        const configuredSystemPrompt = context.ai_model_config?.system_prompt?.trim() ||
            "You are the Kinex decision engine. Always reply with JSON only. Allowed actions are send_email, send_sms, send_notification, enqueue_sequence, and none. Treat brand.services, brand.offers, and brand.incentives as the allowed brand options. offers must match brand.offers[].name and incentives must match brand.incentives[].name. Do not invent new services, offers, or incentives.";
        const configuredTemperatureRaw = context.ai_model_config?.temperature;
        const configuredTemperature = typeof configuredTemperatureRaw === "number" && Number.isFinite(configuredTemperatureRaw)
            ? Math.min(2, Math.max(0, configuredTemperatureRaw))
            : 0.3;
        const configuredMaxTokensRaw = context.ai_model_config?.max_tokens;
        const configuredMaxTokens = typeof configuredMaxTokensRaw === "number" &&
            Number.isFinite(configuredMaxTokensRaw) &&
            configuredMaxTokensRaw > 0
            ? Math.floor(configuredMaxTokensRaw)
            : OPENAI_MAX_TOKENS_DEFAULT;
        const response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: configuredModel,
                temperature: configuredTemperature,
                max_tokens: configuredMaxTokens,
                messages: [
                    {
                        role: "system",
                        content: configuredSystemPrompt,
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error("[AI Worker] OpenAI decision API error", response.status, text);
            const reason = `OpenAI API error: ${response.status}`;
            const fallback = getDeterministicFallback(context, reason);
            console.log("[AI Decision] fallback check", {
                event_type: context.event?.event_type,
                fallback,
            });
            if (fallback) {
                const out = {
                    action: fallback.action,
                    template: fallback.template,
                    confidence: fallback.confidence,
                    reason: fallback.reason,
                };
                console.log("[AI Decision] returning fallback", out);
                return finishWithCreativeSurfaces(out, context, true);
            }
            return finishWithCreativeSurfacesWithoutFinalize({
                action: "none",
                reason,
                confidence: 0,
            }, context, true);
        }
        const json = (await response.json());
        const rawContent = json.choices?.[0]?.message?.content?.trim() ?? "";
        const decision = validateDecision(safeParseDecision(rawContent), context);
        if (!isValidAction(decision.action)) {
            return finishWithCreativeSurfaces({
                action: "none",
                reason: "Model returned invalid action; fell back to none",
                confidence: decision.confidence,
            }, context, true);
        }
        return finishWithCreativeSurfaces(decision, context, false);
    }
    catch (error) {
        console.error("[AI Worker] Error calling OpenAI for decision", error);
        const reason = "Exception while calling OpenAI decision API";
        const fallback = getDeterministicFallback(context, reason);
        console.log("[AI Decision] fallback check", {
            event_type: context.event?.event_type,
            fallback,
        });
        if (fallback) {
            const out = {
                action: fallback.action,
                template: fallback.template,
                confidence: fallback.confidence,
                reason: fallback.reason,
            };
            console.log("[AI Decision] returning fallback", out);
            return finishWithCreativeSurfaces(out, context, true);
        }
        return finishWithCreativeSurfacesWithoutFinalize({
            action: "none",
            reason,
            confidence: 0,
        }, context, true);
    }
}
function buildAiInput(context) {
    return {
        event: context.event,
        person: context.person_id ? { id: context.person_id } : null,
        personIntelligence: context.person_intelligence,
        brand: {
            platform_role: context.brandContext?.profile?.platform_role ?? null,
            business_type: context.brandContext?.profile?.business_type ?? null,
            markets: context.brandContext?.markets ?? [],
            services: context.brandContext?.services ?? [],
            offers: context.brandContext?.offers ?? [],
            incentives: context.brandContext?.incentives ?? [],
            segments: context.brandContext?.segments ?? [],
            /** Distinct keys from `templates` for this brand — only these may be used for send_email (non–SimplePaws). */
            allowed_email_template_keys: context.allowedTemplateKeys ?? [],
        },
        market: {
            supply: context.marketContext?.supply ?? null,
            demand: context.marketContext?.demand ?? null,
            pricing: context.marketContext?.pricing ?? null,
            signals: context.marketContext?.signals ?? null,
            windows: context.marketContext?.windows ?? null,
        },
    };
}
function safeParseDecision(raw) {
    if (!raw) {
        return { action: "none", reason: "Empty model response", confidence: 0 };
    }
    try {
        return normalizeDecision(JSON.parse(raw));
    }
    catch {
        // Try to recover JSON object from text that may contain extra commentary
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
            const candidate = raw.slice(start, end + 1);
            try {
                return normalizeDecision(JSON.parse(candidate));
            }
            catch {
                // fall through
            }
        }
        return {
            action: "none",
            reason: "Failed to parse JSON from model response",
            confidence: 0,
        };
    }
}
function isValidAction(action) {
    return (action === "send_email" ||
        action === "send_sms" ||
        action === "send_notification" ||
        action === "enqueue_sequence" ||
        action === "none");
}
function normalizeModelCreativeRecommendation(input) {
    if (!isRecord(input))
        return null;
    const rationale = Array.isArray(input.rationale) && input.rationale.every((x) => typeof x === "string")
        ? input.rationale
        : [];
    const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
        ? Math.min(1, Math.max(0, input.confidence))
        : null;
    return {
        templateKey: typeof input.templateKey === "string" ? input.templateKey : null,
        segmentKey: typeof input.segmentKey === "string" ? input.segmentKey : null,
        hookAngle: asHookAngle(input.hookAngle),
        cta: asCta(input.cta),
        rationale,
        confidence,
    };
}
function normalizeDecision(input) {
    const normalizedCreative = normalizeModelCreativeRecommendation(input?.creative_recommendation);
    return {
        action: isValidAction(input.action) ? input.action : "none",
        template: typeof input.template === "string" ? input.template : undefined,
        offer: typeof input.offer === "string" ? input.offer : undefined,
        incentive: typeof input.incentive === "string" ? input.incentive : undefined,
        confidence: typeof input.confidence === "number" ? input.confidence : 0,
        reason: typeof input.reason === "string" ? input.reason : undefined,
        creative_recommendation: normalizedCreative
            ? {
                decisionType: "creative_recommendation",
                eventType: "",
                creativeMode: "lifecycle",
                creativeObjective: "booking_recovery",
                templateKey: normalizedCreative.templateKey,
                offerId: null,
                offerName: typeof input?.creative_recommendation === "object" &&
                    input?.creative_recommendation?.offerName &&
                    typeof input?.creative_recommendation?.offerName === "string"
                    ? input.creative_recommendation.offerName
                    : null,
                segmentKey: normalizedCreative.segmentKey,
                segmentName: null,
                hookAngle: normalizedCreative.hookAngle,
                cta: normalizedCreative.cta,
                rationale: normalizedCreative.rationale,
                confidence: normalizedCreative.confidence,
                usedFallback: false,
            }
            : undefined,
    };
}
function validateDecision(contextDecision, context) {
    const allowedOffers = new Set((context.brandContext?.offers ?? [])
        .map((offer) => offer?.name)
        .filter((name) => typeof name === "string"));
    const allowedIncentives = new Set((context.brandContext?.incentives ?? [])
        .map((incentive) => incentive?.name)
        .filter((name) => typeof name === "string"));
    return {
        ...contextDecision,
        offer: contextDecision.offer && allowedOffers.has(contextDecision.offer)
            ? contextDecision.offer
            : undefined,
        incentive: contextDecision.incentive &&
            allowedIncentives.has(contextDecision.incentive)
            ? contextDecision.incentive
            : undefined,
    };
}
