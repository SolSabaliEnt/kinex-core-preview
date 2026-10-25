/**
 * Deterministic upstream signal readout for bounded creative paths (copy prompt shaping, operator visibility).
 * Does not add persisted decision fields; summarizes recommendation spine inputs already on the decision.
 */
const MAX_SUMMARY = 360;
function clip(s, max) {
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length <= max)
        return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}
export function resolveSegmentUpstreamResolution(segmentKey, segmentName) {
    const k = segmentKey?.trim() || null;
    const n = segmentName?.trim() || null;
    if (k && n)
        return "key_and_name";
    if (k)
        return "key_only";
    if (n)
        return "name_only";
    return "missing";
}
export function resolveOfferUpstreamResolution(offerName) {
    return offerName?.trim() ? "named" : "missing";
}
/** Single-line normalized summary for model prompts and operator readout. */
export function buildCreativeUpstreamSignalSummaryLine(shape) {
    const seg = shape.segmentName?.trim() || shape.segmentKey?.trim() || null;
    const segNote = seg ? `segment: ${clip(seg, 80)}` : "segment: (none resolved)";
    const off = shape.offerName?.trim() || null;
    const offNote = off ? `offer: ${clip(off, 80)}` : "offer: (none resolved)";
    const rat0 = shape.rationale.find((l) => l.trim())?.trim() ?? "";
    const ratNote = rat0 ? `rationale_lead: ${clip(rat0, 100)}` : "rationale: (empty)";
    return clip(`mode=${shape.creativeMode}; objective=${shape.creativeObjective}; event=${shape.eventType || "—"}; ${segNote}; ${offNote}; hook=${shape.hookAngle?.trim() || "—"}; cta=${shape.cta?.trim() || "—"}; template=${shape.templateKey?.trim() || "—"}; ${ratNote}`, MAX_SUMMARY);
}
export function buildCreativeUpstreamSignalPayload(shape) {
    return {
        upstream_signal_summary: buildCreativeUpstreamSignalSummaryLine(shape),
        segment_resolution: resolveSegmentUpstreamResolution(shape.segmentKey, shape.segmentName),
        offer_resolution: resolveOfferUpstreamResolution(shape.offerName),
    };
}
/** Compact suffix for deterministic brief rollup (same vocabulary as copy-generation JSON). */
export function formatCreativeUpstreamResolutionSuffix(payload) {
    return `segment=${payload.segment_resolution} offer=${payload.offer_resolution}`;
}
