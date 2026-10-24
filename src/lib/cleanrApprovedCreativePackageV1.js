/**
 * Cleanr First Content Batch — bounded creative package **schema v1** (`cleanr_ccp_v1`).
 * Lived inside `decision.cleanr_approved_creative_package.approved` when valid.
 * Review-first; no publishing or media generation semantics here.
 */
export const CLEANR_CCP_SCHEMA_VERSION = "cleanr_ccp_v1";
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function reqString(o, key, errors) {
    const v = o[key];
    if (typeof v !== "string" || !v.trim()) {
        errors.push(`missing or empty string: ${key}`);
        return null;
    }
    return v.trim();
}
function optString(o, key) {
    const v = o[key];
    if (v === undefined || v === null)
        return undefined;
    if (typeof v !== "string")
        return undefined;
    const t = v.trim();
    return t ? t : undefined;
}
function optStringArray(v, field, errors) {
    if (v === undefined || v === null)
        return undefined;
    if (!Array.isArray(v)) {
        errors.push(`${field} must be an array of strings when present`);
        return undefined;
    }
    const out = [];
    for (const x of v) {
        if (typeof x !== "string" || !x.trim()) {
            errors.push(`${field} entries must be non-empty strings`);
            return undefined;
        }
        out.push(x.trim());
    }
    return out.length ? out : undefined;
}
function parseIdentity(raw, errors) {
    if (!isRecord(raw)) {
        errors.push("identity must be an object");
        return null;
    }
    const package_id = reqString(raw, "package_id", errors);
    const schema_version = reqString(raw, "schema_version", errors);
    if (!package_id || !schema_version)
        return null;
    if (schema_version !== CLEANR_CCP_SCHEMA_VERSION) {
        errors.push(`identity.schema_version must be "${CLEANR_CCP_SCHEMA_VERSION}"`);
        return null;
    }
    return {
        package_id,
        schema_version: CLEANR_CCP_SCHEMA_VERSION,
        batch_label: optString(raw, "batch_label"),
    };
}
function parseObjective(raw, errors) {
    if (!isRecord(raw)) {
        errors.push("objective must be an object");
        return null;
    }
    const category = reqString(raw, "category", errors);
    const objective = reqString(raw, "objective", errors);
    if (!category || !objective)
        return null;
    return { category, objective };
}
function parseReview(raw, errors) {
    if (!isRecord(raw)) {
        errors.push("review must be an object");
        return null;
    }
    const status = reqString(raw, "status", errors);
    if (!status)
        return null;
    return {
        status,
        checklist_version: optString(raw, "checklist_version"),
        accepted_at: optString(raw, "accepted_at"),
    };
}
function parseSlots(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!Array.isArray(raw)) {
        errors.push("slots must be an array when present");
        return undefined;
    }
    const out = [];
    let i = 0;
    for (const row of raw) {
        if (!isRecord(row)) {
            errors.push(`slots[${i}] must be an object`);
            return undefined;
        }
        const slot = {};
        const sid = optString(row, "slot_id");
        const tk = optString(row, "template_key");
        const ch = optString(row, "channel");
        const pr = row.priority;
        if (sid)
            slot.slot_id = sid;
        if (tk)
            slot.template_key = tk;
        if (ch)
            slot.channel = ch;
        if (typeof pr === "number" && Number.isFinite(pr))
            slot.priority = pr;
        out.push(slot);
        i += 1;
    }
    return out.length ? out : undefined;
}
function parseAudience(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("audience must be an object when present");
        return undefined;
    }
    const segments = optStringArray(raw.segments, "audience.segments", errors);
    if (errors.length)
        return undefined;
    const tone_notes = optString(raw, "tone_notes");
    if (!segments && !tone_notes)
        return undefined;
    return { segments, tone_notes };
}
function parseServiceContext(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("service_context must be an object when present");
        return undefined;
    }
    const service_type = optString(raw, "service_type");
    const market_region_id = optString(raw, "market_region_id");
    const booking_refs = optStringArray(raw.booking_refs, "service_context.booking_refs", errors);
    if (errors.length)
        return undefined;
    if (!service_type && !market_region_id && !booking_refs)
        return undefined;
    return { service_type, market_region_id, booking_refs };
}
function parseMessage(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("message must be an object when present");
        return undefined;
    }
    const headline = optString(raw, "headline");
    const body = optString(raw, "body");
    const cta_label = optString(raw, "cta_label");
    if (!headline && !body && !cta_label)
        return undefined;
    return { headline, body, cta_label };
}
function parseTruthReferences(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("truth_references must be an object when present");
        return undefined;
    }
    const sourcesRaw = raw.sources;
    if (sourcesRaw === undefined || sourcesRaw === null)
        return undefined;
    if (!Array.isArray(sourcesRaw)) {
        errors.push("truth_references.sources must be an array when present");
        return undefined;
    }
    const sources = [];
    let i = 0;
    for (const s of sourcesRaw) {
        if (!isRecord(s)) {
            errors.push(`truth_references.sources[${i}] must be an object`);
            return undefined;
        }
        const label = reqString(s, "label", errors);
        if (!label)
            return undefined;
        sources.push({ label, ref: optString(s, "ref") });
        i += 1;
    }
    return sources.length ? { sources } : undefined;
}
function parseGuardrails(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("guardrails must be an object when present");
        return undefined;
    }
    const must_not_claim = optStringArray(raw.must_not_claim, "guardrails.must_not_claim", errors);
    const compliance_tags = optStringArray(raw.compliance_tags, "guardrails.compliance_tags", errors);
    if (errors.length)
        return undefined;
    if (!must_not_claim && !compliance_tags)
        return undefined;
    return { must_not_claim, compliance_tags };
}
function parseOperatorNotes(raw, errors) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isRecord(raw)) {
        errors.push("operator_notes must be an object when present");
        return undefined;
    }
    const notes = optString(raw, "notes");
    const reviewer_ids = optStringArray(raw.reviewer_ids, "operator_notes.reviewer_ids", errors);
    if (errors.length)
        return undefined;
    if (!notes && !reviewer_ids)
        return undefined;
    return { notes, reviewer_ids };
}
/**
 * Validates and normalizes producer `approved` payload to **v1** contract.
 * Rejects unknown top-level keys beyond the defined schema (prevents arbitrary JSON surface in v1 path).
 */
export function validateCleanrApprovedPackageV1(raw) {
    const errors = [];
    if (!isRecord(raw)) {
        return { ok: false, errors: ["root must be a JSON object"] };
    }
    const allowedTop = new Set([
        "identity",
        "objective",
        "review",
        "slots",
        "audience",
        "service_context",
        "message",
        "truth_references",
        "guardrails",
        "operator_notes",
    ]);
    for (const k of Object.keys(raw)) {
        if (!allowedTop.has(k))
            errors.push(`unknown top-level key: ${k}`);
    }
    if (errors.length)
        return { ok: false, errors };
    const identity = parseIdentity(raw.identity, errors);
    const objective = parseObjective(raw.objective, errors);
    const review = parseReview(raw.review, errors);
    if (!identity || !objective || !review)
        return { ok: false, errors };
    const slots = parseSlots(raw.slots, errors);
    const audience = parseAudience(raw.audience, errors);
    const service_context = parseServiceContext(raw.service_context, errors);
    const message = parseMessage(raw.message, errors);
    const truth_references = parseTruthReferences(raw.truth_references, errors);
    const guardrails = parseGuardrails(raw.guardrails, errors);
    const operator_notes = parseOperatorNotes(raw.operator_notes, errors);
    if (errors.length)
        return { ok: false, errors };
    const value = {
        identity,
        objective,
        review,
        ...(slots ? { slots } : {}),
        ...(audience ? { audience } : {}),
        ...(service_context ? { service_context } : {}),
        ...(message ? { message } : {}),
        ...(truth_references ? { truth_references } : {}),
        ...(guardrails ? { guardrails } : {}),
        ...(operator_notes ? { operator_notes } : {}),
    };
    return { ok: true, value };
}
/** True if object declares v1 schema (used to choose validator vs legacy opaque). */
export function looksLikeCleanrCcpV1Payload(raw) {
    if (!isRecord(raw))
        return false;
    const id = raw.identity;
    if (!isRecord(id))
        return false;
    return id.schema_version === CLEANR_CCP_SCHEMA_VERSION;
}
