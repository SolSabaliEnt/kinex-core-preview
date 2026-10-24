/**
 * Cleanr-approved bounded creative package — sibling JSON on `ai_decisions.decision`.
 * Review-first: Kinex persists producer truth from `events.payload` without publishing or media generation.
 *
 * **v1 contract** (`cleanr_ccp_v1`): typed + validated via `cleanrApprovedCreativePackageV1.ts`.
 * **Legacy:** non-v1-shaped objects are still stored as opaque `approved` with `package_legacy_unvalidated`
 * for backward compatibility until producers migrate.
 */
import { looksLikeCleanrCcpV1Payload, validateCleanrApprovedPackageV1, } from "./cleanrApprovedCreativePackageV1.js";
export { CLEANR_CCP_SCHEMA_VERSION } from "./cleanrApprovedCreativePackageV1.js";
export const CLEANR_APPROVED_CREATIVE_PACKAGE_DECISION_TYPE = "cleanr_approved_creative_package";
/** Producer sends approved package on the event under this key (inside `events.payload`). */
export const CLEANR_EVENT_PAYLOAD_KEY = "cleanr_approved_creative_package";
export function parseCleanrPackageFromEventPayload(payload) {
    if (payload === undefined || payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }
    const raw = payload[CLEANR_EVENT_PAYLOAD_KEY];
    if (raw === undefined || raw === null)
        return null;
    if (typeof raw !== "object" || Array.isArray(raw))
        return null;
    return raw;
}
/**
 * Merges Cleanr-approved package from the ingest event onto the persisted decision (append-once).
 * Does not touch `creative_recommendation` or other bounded siblings.
 *
 * - **v1-shaped** payloads (`identity.schema_version === cleanr_ccp_v1`): validated; on failure stores
 *   `package_merge_rejected` only (no `approved` body).
 * - **Other shapes:** stored as legacy `approved` plus `package_legacy_unvalidated: true`.
 */
export function mergeCleanrApprovedCreativePackageIntoDecision(decision, eventPayload) {
    const approvedRaw = parseCleanrPackageFromEventPayload(eventPayload);
    if (!approvedRaw)
        return decision;
    const existing = decision.cleanr_approved_creative_package;
    if (existing !== undefined && existing !== null)
        return decision;
    const mergedAt = new Date().toISOString();
    const base = {
        decisionType: CLEANR_APPROVED_CREATIVE_PACKAGE_DECISION_TYPE,
        mergedAt,
    };
    if (looksLikeCleanrCcpV1Payload(approvedRaw)) {
        const v = validateCleanrApprovedPackageV1(approvedRaw);
        if (!v.ok) {
            return {
                ...decision,
                cleanr_approved_creative_package: {
                    ...base,
                    package_merge_rejected: {
                        reason: "v1_validation_failed",
                        errors: v.errors,
                        producer_top_level_keys: Object.keys(approvedRaw).slice(0, 32),
                    },
                },
            };
        }
        return {
            ...decision,
            cleanr_approved_creative_package: {
                ...base,
                approved: v.value,
            },
        };
    }
    return {
        ...decision,
        cleanr_approved_creative_package: {
            ...base,
            approved: approvedRaw,
            package_legacy_unvalidated: true,
        },
    };
}
const JSON_PREVIEW_MAX = 12_000;
function clipJson(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max)}\n… (truncated)`;
}
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function parseCleanrApprovedCreativePackageFromDecision(decisionObj) {
    const empty = {
        present: false,
        packageShape: "none",
        mergedAt: null,
        rejectedErrors: [],
        legacyUnvalidated: false,
        v1PackageId: null,
        v1ReviewStatus: null,
        v1ObjectiveLine: null,
        v1Category: null,
        approvedTopLevelKeys: [],
        approvedJsonPreview: null,
    };
    if (!decisionObj)
        return empty;
    const raw = decisionObj.cleanr_approved_creative_package;
    if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return empty;
    }
    const o = raw;
    const mergedAt = typeof o.mergedAt === "string" && o.mergedAt.trim() ? o.mergedAt.trim() : null;
    const rej = o.package_merge_rejected;
    if (isRecord(rej) && rej.reason === "v1_validation_failed") {
        const errs = Array.isArray(rej.errors)
            ? rej.errors.filter((x) => typeof x === "string")
            : [];
        let preview = null;
        try {
            preview = clipJson(JSON.stringify({ package_merge_rejected: rej }, null, 2), JSON_PREVIEW_MAX);
        }
        catch {
            preview = null;
        }
        return {
            present: true,
            packageShape: "rejected_v1",
            mergedAt,
            rejectedErrors: errs,
            legacyUnvalidated: false,
            v1PackageId: null,
            v1ReviewStatus: null,
            v1ObjectiveLine: null,
            v1Category: null,
            approvedTopLevelKeys: [],
            approvedJsonPreview: preview,
        };
    }
    const approved = o.approved;
    if (!approved || !isRecord(approved)) {
        return {
            present: true,
            mergedAt,
            packageShape: "legacy_untyped",
            rejectedErrors: [],
            legacyUnvalidated: o.package_legacy_unvalidated === true,
            v1PackageId: null,
            v1ReviewStatus: null,
            v1ObjectiveLine: null,
            v1Category: null,
            approvedTopLevelKeys: [],
            approvedJsonPreview: null,
        };
    }
    const keys = Object.keys(approved).sort();
    let preview = null;
    try {
        preview = clipJson(JSON.stringify(approved, null, 2), JSON_PREVIEW_MAX);
    }
    catch {
        preview = null;
    }
    if (looksLikeCleanrCcpV1Payload(approved)) {
        const v = validateCleanrApprovedPackageV1(approved);
        if (v.ok) {
            const a = v.value;
            return {
                present: true,
                packageShape: "valid_v1",
                mergedAt,
                rejectedErrors: [],
                legacyUnvalidated: false,
                v1PackageId: a.identity.package_id,
                v1ReviewStatus: a.review.status,
                v1ObjectiveLine: a.objective.objective,
                v1Category: a.objective.category,
                approvedTopLevelKeys: keys,
                approvedJsonPreview: preview,
            };
        }
        return {
            present: true,
            packageShape: "legacy_untyped",
            mergedAt,
            rejectedErrors: v.errors,
            legacyUnvalidated: true,
            v1PackageId: null,
            v1ReviewStatus: null,
            v1ObjectiveLine: null,
            v1Category: null,
            approvedTopLevelKeys: keys,
            approvedJsonPreview: preview,
        };
    }
    return {
        present: true,
        packageShape: "legacy_untyped",
        mergedAt,
        rejectedErrors: [],
        legacyUnvalidated: o.package_legacy_unvalidated === true,
        v1PackageId: null,
        v1ReviewStatus: null,
        v1ObjectiveLine: null,
        v1Category: null,
        approvedTopLevelKeys: keys,
        approvedJsonPreview: preview,
    };
}
/** One-line summary for handoff export quick-scan blocks. */
export function cleanrApprovedPackagePresenceSummary(p) {
    if (!p.present)
        return "cleanr_approved_creative_package: no";
    if (p.packageShape === "rejected_v1") {
        const n = p.rejectedErrors.length;
        return `cleanr_approved_creative_package: rejected_v1 · mergedAt: ${p.mergedAt ?? "—"} · errors: ${n}`;
    }
    const shape = p.packageShape === "valid_v1" ? "v1" : p.packageShape === "legacy_untyped" ? "legacy" : "?";
    const idPart = p.v1PackageId ? `id: ${p.v1PackageId}` : "id: —";
    const rev = p.v1ReviewStatus ? `review: ${p.v1ReviewStatus}` : "";
    return `cleanr_approved_creative_package: yes (${shape}) · mergedAt: ${p.mergedAt ?? "—"} · ${idPart}${rev ? ` · ${rev}` : ""}`;
}
