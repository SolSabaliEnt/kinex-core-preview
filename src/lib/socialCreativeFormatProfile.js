/**
 * Code-defined format profile ids for bounded `paidSocialCreative` / `organicSocialCreative` objects.
 * Worker-set only — not model output. Extends platform-aware contracts without publishing payloads.
 *
 * Full specs live here only — never embedded in `ai_decisions.decision` JSON.
 */
const PROFILE_SET = new Set(["generic_paid_social_v1", "generic_organic_social_v1"]);
export function isSocialCreativeFormatProfileId(v) {
    return typeof v === "string" && PROFILE_SET.has(v);
}
export const SOCIAL_FORMAT_PROFILE_SPECS = {
    generic_paid_social_v1: {
        id: "generic_paid_social_v1",
        label: "Generic paid social — format contract v1",
        surfaceType: "paid_social",
        distributionMode: "recommendation_mirror",
        headlineRequired: false,
        bodyRequired: false,
        headlineMaxChars: null,
        bodyMaxChars: null,
        ctaExpected: true,
        copyVariantContract: {
            headlineMaxChars: 50,
            primaryTextMaxChars: 280,
            headlineRequired: true,
            primaryTextRequired: true,
            maxVariants: 2,
        },
        notes: [
            "Kinex stores segment, offer, hookAngle, cta, rationale, and confidence — no ad account, campaign, or creative ids.",
            "No separate headline/body on the recommendation mirror; hook + CTA are the short-form units.",
            "Optional sibling JSON `decision.creative_social_copy_variants` holds review-first headline + primaryText variants; limits are Kinex contract bounds, not a specific network API.",
        ],
        handoffAspectRatioHint: "Paid placements: plan 1:1 or 4:5 for feed; use 9:16 when running Stories/Reels-style units — confirm crop in your ad network UI.",
    },
    generic_organic_social_v1: {
        id: "generic_organic_social_v1",
        label: "Generic organic social — format contract v1",
        surfaceType: "organic_social",
        distributionMode: "recommendation_mirror",
        headlineRequired: false,
        bodyRequired: false,
        headlineMaxChars: null,
        bodyMaxChars: null,
        ctaExpected: true,
        copyVariantContract: {
            headlineMaxChars: 50,
            primaryTextMaxChars: 280,
            headlineRequired: true,
            primaryTextRequired: true,
            maxVariants: 2,
        },
        notes: [
            "Same bounded shape as paid mirror for observability; not a scheduled or published organic post.",
            "Optional `decision.creative_social_copy_variants.organic` uses the same copy-variant contract as paid for symmetry.",
        ],
        handoffAspectRatioHint: "Organic feed: default to 1:1 or 4:5; Stories/Reels-style surfaces favor 9:16 with headline-safe top margin.",
    },
};
export function getSocialFormatProfileSpec(id) {
    if (!id || !isSocialCreativeFormatProfileId(id))
        return null;
    return SOCIAL_FORMAT_PROFILE_SPECS[id];
}
function hasNonEmptyTrimmedString(v) {
    return typeof v === "string" && v.trim().length > 0;
}
/**
 * Non-blocking, read-only hint: compares a few bounded row fields to the code-defined profile.
 * Does not validate platform APIs, character limits when spec max is null, or publish readiness.
 */
export function deriveSocialFormatReadinessHint(spec, fields) {
    if (!spec) {
        return {
            status: "unresolved",
            summary: "No profile to check against.",
            reasons: ["Missing or unknown formatProfileId."],
        };
    }
    const reasons = [];
    if (spec.ctaExpected && !hasNonEmptyTrimmedString(fields.cta)) {
        reasons.push("Profile expects a CTA; value is missing or empty.");
    }
    if (spec.headlineRequired && !hasNonEmptyTrimmedString(fields.hookAngle)) {
        reasons.push("Profile expects headline copy; hookAngle is empty (v1 uses hookAngle as the short headline slot).");
    }
    if (spec.bodyRequired && fields.rationaleLineCount < 1) {
        reasons.push("Profile expects body copy; rationale has no lines.");
    }
    const status = reasons.length === 0 ? "aligned" : "partial";
    const summary = status === "aligned"
        ? "Shallow checks match this profile (CTA / headline / body flags only)."
        : "One or more checked expectations are not met.";
    return { status, summary, reasons };
}
/**
 * Derives readiness from a persisted `paidSocialCreative` / `organicSocialCreative` object shape.
 * For Analytics aggregation — same rules as AI Decisions hints.
 */
/**
 * Read-only check: persisted copy variant strings vs `copyVariantContract` (character counts + required flags).
 */
export function deriveSocialCopyVariantCompliance(contract, headline, primaryText) {
    const reasons = [];
    const h = typeof headline === "string" ? headline.trim() : "";
    const p = typeof primaryText === "string" ? primaryText.trim() : "";
    if (contract.headlineRequired && !h) {
        reasons.push("Headline required for copy variant layer but empty.");
    }
    if (contract.primaryTextRequired && !p) {
        reasons.push("Primary text required for copy variant layer but empty.");
    }
    if (h.length > contract.headlineMaxChars) {
        reasons.push(`Headline length ${h.length} exceeds copy contract max ${contract.headlineMaxChars}.`);
    }
    if (p.length > contract.primaryTextMaxChars) {
        reasons.push(`Primary text length ${p.length} exceeds copy contract max ${contract.primaryTextMaxChars}.`);
    }
    return { aligned: reasons.length === 0, reasons };
}
export function deriveReadinessStatusFromNestedSocialCreative(obj) {
    if (!obj)
        return "unresolved";
    const profileId = isSocialCreativeFormatProfileId(obj.formatProfileId) ? obj.formatProfileId : null;
    const spec = getSocialFormatProfileSpec(profileId);
    const rationale = Array.isArray(obj.rationale)
        ? obj.rationale.filter((x) => typeof x === "string")
        : [];
    const fields = {
        cta: typeof obj.cta === "string" ? obj.cta : null,
        hookAngle: typeof obj.hookAngle === "string" ? obj.hookAngle : null,
        rationaleLineCount: rationale.length,
    };
    return deriveSocialFormatReadinessHint(spec, fields).status;
}
/** Default profile while `platformTarget` is `generic_paid_social`. */
export function defaultFormatProfileIdForGenericPaidSocial() {
    return "generic_paid_social_v1";
}
/** Default profile while `platformTarget` is `generic_organic_social`. */
export function defaultFormatProfileIdForGenericOrganicSocial() {
    return "generic_organic_social_v1";
}
