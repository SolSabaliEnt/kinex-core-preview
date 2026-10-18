/**
 * Sibling to `creative_recommendation` / `creative_social_copy_variants`: bounded **asset brief**
 * for human/design handoff — review-first, no generated media, no execution.
 */
import { buildCreativeUpstreamSignalPayload, formatCreativeUpstreamResolutionSuffix, } from "./creativeUpstreamContext";
import { getSocialFormatProfileSpec, isSocialCreativeFormatProfileId, } from "./socialCreativeFormatProfile";
export const CREATIVE_ASSET_BRIEF_DECISION_TYPE = "creative_asset_brief";
const MAX_ANGLE_SUMMARY = 200;
const MAX_OFFER_SEGMENT = 280;
const MAX_VISUAL_DIRECTION = 200;
const MAX_FORMAT_NOTES = 240;
const MAX_CONSTRAINT = 100;
const MAX_CONSTRAINTS = 3;
const MAX_CONCEPT = 100;
const MAX_CONCEPTS = 4;
const MAX_MAPPING_SNIPPET = 80;
const MAX_MAPPINGS = 4;
function clip(s, max) {
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length <= max)
        return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}
function dedupeProfiles(ids) {
    const out = [];
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id))
            continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}
/**
 * Builds a bounded asset brief from recommendation + optional copy variants only (no model).
 * Returns null if paid format profile cannot be resolved (same gate as meaningful ad-style brief).
 */
export function buildCreativeAssetBriefFromInputs(input, assembledAtIso) {
    const paidId = input.paid.formatProfileId;
    if (!paidId)
        return null;
    const paidSpec = getSocialFormatProfileSpec(paidId);
    if (!paidSpec)
        return null;
    const targetSurfaces = ["paid_social"];
    const formatProfileIds = [paidId];
    let organicSpec = null;
    if (input.organic?.formatProfileId) {
        organicSpec = getSocialFormatProfileSpec(input.organic.formatProfileId);
        if (organicSpec) {
            targetSurfaces.push("organic_social");
            formatProfileIds.push(input.organic.formatProfileId);
        }
    }
    const hookBits = [];
    if (input.hookAnglePrimary)
        hookBits.push(`Row: ${input.hookAnglePrimary}`);
    if (input.paid.hookAngle)
        hookBits.push(`Paid: ${input.paid.hookAngle}`);
    if (input.organic?.hookAngle)
        hookBits.push(`Organic: ${input.organic.hookAngle}`);
    const angleSummary = clip(hookBits.join(" · ") || "No hook angles on recommendation mirrors.", MAX_ANGLE_SUMMARY);
    const seg = input.segmentName?.trim() || input.segmentKey?.trim() || "—";
    const off = input.offerName?.trim() || "—";
    const upstreamResolutions = buildCreativeUpstreamSignalPayload({
        eventType: input.eventType,
        creativeMode: input.creativeMode,
        creativeObjective: input.creativeObjective,
        segmentKey: input.segmentKey,
        segmentName: input.segmentName,
        offerName: input.offerName,
        hookAngle: input.hookAnglePrimary,
        cta: input.paid.cta ?? input.organic?.cta ?? null,
        rationale: input.rationaleLines,
        templateKey: null,
    });
    const offerSegmentContext = clip(`Objective ${input.creativeObjective}; event ${input.eventType}; segment ${seg}; offer ${off}; upstream: ${formatCreativeUpstreamResolutionSuffix(upstreamResolutions)}`, MAX_OFFER_SEGMENT);
    const visualDirectionLine = clip(`${paidSpec.label} — keep subject readable at feed scale; align mood with ${input.creativeObjective} and hook angles above (no auto-generated imagery).`, MAX_VISUAL_DIRECTION);
    const noteParts = [...paidSpec.notes];
    if (organicSpec)
        noteParts.push(...organicSpec.notes);
    const formatNotes = clip(noteParts.join(" "), MAX_FORMAT_NOTES);
    const ctaHint = input.paid.cta?.trim() || input.organic?.cta?.trim() || input.hookAnglePrimary || "see copy layer";
    const constraints = [
        clip(`Reserve clear space for CTA: ${ctaHint}`, MAX_CONSTRAINT),
        clip(`Copy contract (variants): headline ≤${paidSpec.copyVariantContract.headlineMaxChars} chars, primary ≤${paidSpec.copyVariantContract.primaryTextMaxChars} chars.`, MAX_CONSTRAINT),
    ];
    if (input.organic && organicSpec) {
        constraints.push(clip("Paid + organic mirrors: keep visual continuity across placements if both ship.", MAX_CONSTRAINT));
    }
    const productionConstraints = constraints.slice(0, MAX_CONSTRAINTS).map((c) => clip(c, MAX_CONSTRAINT));
    const concepts = [];
    const leadRationale = input.rationaleLines.find((l) => l.trim().length > 0);
    if (leadRationale)
        concepts.push(clip(`Storyboard from rationale: ${leadRationale}`, MAX_CONCEPT));
    concepts.push(clip(`Hero should reinforce ${input.hookAnglePrimary ?? input.paid.hookAngle ?? "hook"} without contradicting segment/offer context.`, MAX_CONCEPT));
    const assetConceptBullets = concepts.slice(0, MAX_CONCEPTS).map((c) => clip(c, MAX_CONCEPT));
    const copyToVisualMapping = [];
    const pushMappings = (channel, rows) => {
        if (!rows || copyToVisualMapping.length >= MAX_MAPPINGS)
            return;
        for (const row of rows) {
            if (copyToVisualMapping.length >= MAX_MAPPINGS)
                break;
            if (row.variantId !== "a" && row.variantId !== "b")
                continue;
            copyToVisualMapping.push({
                channel,
                variantId: row.variantId,
                headlineSnippet: clip(row.headline, MAX_MAPPING_SNIPPET),
            });
        }
    };
    pushMappings("paid", input.copyVariantsPaid);
    pushMappings("organic", input.copyVariantsOrganic);
    return {
        decisionType: CREATIVE_ASSET_BRIEF_DECISION_TYPE,
        assembledAt: assembledAtIso,
        source: "deterministic_worker_v1",
        briefVersion: 1,
        creativeObjective: clip(input.creativeObjective, 64),
        eventType: clip(input.eventType, 120),
        targetSurfaces,
        formatProfileIds: dedupeProfiles(formatProfileIds),
        angleSummary,
        offerSegmentContext,
        visualDirectionLine,
        formatNotes,
        productionConstraints,
        assetConceptBullets,
        copyToVisualMapping,
    };
}
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asVariantId(v) {
    return v === "a" || v === "b" ? v : null;
}
function parseMappingList(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (out.length >= MAX_MAPPINGS)
            break;
        if (!isRecord(item))
            continue;
        const channel = item.channel === "paid" || item.channel === "organic" ? item.channel : null;
        const variantId = asVariantId(item.variantId);
        const headlineSnippet = typeof item.headlineSnippet === "string" ? item.headlineSnippet.trim() : "";
        if (!channel || !variantId || !headlineSnippet)
            continue;
        out.push({
            channel,
            variantId,
            headlineSnippet: clip(headlineSnippet, MAX_MAPPING_SNIPPET),
        });
    }
    return out;
}
function parseStringList(raw, maxItems, maxEach) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const x of raw) {
        if (out.length >= maxItems)
            break;
        if (typeof x !== "string")
            continue;
        const s = clip(x, maxEach);
        if (s)
            out.push(s);
    }
    return out;
}
function parseSurfaces(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const x of raw) {
        if (out.length >= 2)
            break;
        if (x === "paid_social" || x === "organic_social")
            out.push(x);
    }
    return out;
}
function parseProfileIds(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const x of raw) {
        if (out.length >= 2)
            break;
        if (isSocialCreativeFormatProfileId(x))
            out.push(x);
    }
    return out;
}
export function parseCreativeAssetBriefFromDecision(decision) {
    if (!decision)
        return null;
    const raw = decision.creative_asset_brief;
    if (!isRecord(raw))
        return null;
    if (raw.decisionType !== CREATIVE_ASSET_BRIEF_DECISION_TYPE)
        return null;
    const assembledAt = typeof raw.assembledAt === "string" && raw.assembledAt.trim() ? raw.assembledAt.trim() : null;
    const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : "";
    const briefVersion = typeof raw.briefVersion === "number" && Number.isFinite(raw.briefVersion) ? raw.briefVersion : null;
    const creativeObjective = typeof raw.creativeObjective === "string" && raw.creativeObjective.trim()
        ? raw.creativeObjective.trim()
        : null;
    const eventType = typeof raw.eventType === "string" && raw.eventType.trim() ? raw.eventType.trim() : null;
    if (!assembledAt || !source || briefVersion === null || !creativeObjective || !eventType)
        return null;
    return {
        assembledAt,
        source,
        briefVersion,
        creativeObjective,
        eventType,
        targetSurfaces: parseSurfaces(raw.targetSurfaces),
        formatProfileIds: parseProfileIds(raw.formatProfileIds),
        angleSummary: typeof raw.angleSummary === "string" && raw.angleSummary.trim() ? raw.angleSummary.trim() : "",
        offerSegmentContext: typeof raw.offerSegmentContext === "string" && raw.offerSegmentContext.trim()
            ? raw.offerSegmentContext.trim()
            : "",
        visualDirectionLine: typeof raw.visualDirectionLine === "string" && raw.visualDirectionLine.trim()
            ? raw.visualDirectionLine.trim()
            : "",
        formatNotes: typeof raw.formatNotes === "string" && raw.formatNotes.trim() ? raw.formatNotes.trim() : "",
        productionConstraints: parseStringList(raw.productionConstraints, MAX_CONSTRAINTS, MAX_CONSTRAINT),
        assetConceptBullets: parseStringList(raw.assetConceptBullets, MAX_CONCEPTS, MAX_CONCEPT),
        copyToVisualMapping: parseMappingList(raw.copyToVisualMapping),
    };
}
export function hasCreativeAssetBriefPayload(decision) {
    return parseCreativeAssetBriefFromDecision(decision) != null;
}
function compositionLineFromContext(ctx) {
    const rec = !ctx.recommendationPresent
        ? "no recommendation in parse"
        : `recommendation (${ctx.recommendationCreativeMode ?? "mode unknown"})`;
    const mirrors = [];
    if (ctx.paidSocialPresent)
        mirrors.push("paid social mirror");
    if (ctx.organicSocialPresent)
        mirrors.push("organic social mirror");
    const mir = mirrors.length ? mirrors.join(" + ") : "no paid/organic social mirrors in parse";
    const copy = ctx.hasCopyVariants ? "has copy variants JSON" : "no copy variants JSON";
    const brief = ctx.hasBrief ? "has asset brief JSON" : "no asset brief JSON";
    return `Row composition (operator parse): ${rec} · ${mir} · ${copy} · ${brief}.`;
}
/**
 * Plain-language drilldown for AI Decisions expanded row — factual only; does not assert worker flags or skip causes.
 */
export function explainCreativeAssetBriefDrilldown(ctx) {
    const compositionLine = compositionLineFromContext(ctx);
    if (ctx.hasBrief && ctx.brief) {
        const b = ctx.brief;
        const supplemental = [];
        if (b.copyToVisualMapping.length > 0) {
            supplemental.push("Copy→visual lines are stored on the brief object; they are not recomputed when copy JSON on the row changes.");
        }
        else if (ctx.hasCopyVariants) {
            supplemental.push("Copy variants JSON is present on this row, but this brief’s stored copy→visual mapping list is empty.");
        }
        else {
            supplemental.push("No `creative_social_copy_variants` in operator parse on this row; this brief’s mapping list is empty.");
        }
        return {
            categoryLabel: "Asset brief present",
            statusSummary: `Deterministic handoff text (${b.source}, briefVersion ${b.briefVersion}). Review/export only — not generated imagery, not campaign launch.`,
            compositionLine,
            relationshipToSiblingsLine: "`creative_asset_brief` is a sibling to `creative_recommendation` and optional `creative_social_copy_variants`; it does not replace or merge into those objects.",
            whyNoBriefLine: null,
            supplementalLines: supplemental,
        };
    }
    const supplemental = [];
    let whyNoBriefLine;
    if (!ctx.recommendationPresent) {
        whyNoBriefLine =
            "No `creative_recommendation` in operator parse — there is no bounded creative spine here for a v1 asset brief to attach to.";
    }
    else if (ctx.recommendationCreativeMode !== "ad_style") {
        whyNoBriefLine = `Creative mode is "${ctx.recommendationCreativeMode ?? "unknown"}" (not "ad_style"). V1 brief assembly in the worker targets the ad-style paid-mirror path only; absence of a brief here is consistent with that boundary.`;
    }
    else if (!ctx.paidSocialPresent) {
        whyNoBriefLine =
            "Ad-style recommendation without a paid social mirror in parse — v1 brief assembly expects a paid mirror and resolvable paid format profile.";
    }
    else {
        whyNoBriefLine =
            "Ad-style row with paid social mirror, but stored JSON has no parseable `creative_asset_brief` — only that absence is observable on this row (Kinex does not infer a brief from other fields).";
        supplemental.push("Worker append rules and env are documented in-repo; decision JSON does not encode brief skip reasons.");
    }
    return {
        categoryLabel: "No asset brief stored",
        statusSummary: "The operator parser did not find a well-formed `decision.creative_asset_brief` sibling on this decision.",
        compositionLine,
        relationshipToSiblingsLine: "Without this layer, use recommendation mirrors plus optional copy variants for handoff context; still review-first — no execution or asset files from Kinex.",
        whyNoBriefLine,
        supplementalLines: supplemental,
    };
}
/** Build drilldown context from parsed creative slice (same facts as expanded row). */
export function creativeAssetBriefDrilldownContextFromCreative(creative) {
    return {
        hasBrief: creative.creativeAssetBrief != null,
        brief: creative.creativeAssetBrief,
        hasCopyVariants: creative.socialCopyVariants != null,
        recommendationPresent: creative.recommendationPresent,
        recommendationCreativeMode: creative.recommendationCreativeMode,
        paidSocialPresent: creative.paidSocialPresent,
        organicSocialPresent: creative.organicSocialPresent,
    };
}
/**
 * Table chip `title` when a brief exists — same sentences as the expanded card header, without supplemental bullets.
 */
export function creativeAssetBriefChipTooltipWhenPresent(ctx) {
    if (!ctx.hasBrief || !ctx.brief)
        return "";
    const ex = explainCreativeAssetBriefDrilldown(ctx);
    return [
        `${ex.categoryLabel}.`,
        "Stored creative_asset_brief: yes.",
        ex.statusSummary,
        ex.compositionLine,
        ex.relationshipToSiblingsLine,
    ].join(" ");
}
/**
 * Creative summary grid line suffix — aligned with drilldown vocabulary; optional clipped no-brief note.
 * When a brief exists, the grid already shows `yes · source`; this teaser omits duplicate “stored: yes”.
 */
export function creativeAssetBriefCreativeSummaryTeaser(ctx) {
    const ex = explainCreativeAssetBriefDrilldown(ctx);
    let why = ex.whyNoBriefLine;
    if (why && why.length > 160)
        why = `${why.slice(0, 157)}…`;
    const whyPart = why ? ` What we know (no brief): ${why}` : "";
    if (ctx.hasBrief) {
        return ` — ${ex.categoryLabel}. ${ex.statusSummary} ${ex.compositionLine} (Same vocabulary as Creative asset brief block below.)`;
    }
    return ` — Stored creative_asset_brief: no. ${ex.categoryLabel}. ${ex.statusSummary} ${ex.compositionLine}${whyPart} Full wording in Creative asset brief (handoff) below.`;
}
/** --- Operator-derived visual / concept handoff (text-only; no new JSON on the decision). --- */
const VCH_MAX_LINE = 240;
const VCH_MAX_LINES = 6;
const VCH_HEADLINE_SNIP = 96;
function clipVisualConceptLine(s, max = VCH_MAX_LINE) {
    return clip(s.trim().replace(/\s+/g, " "), max);
}
function liveCopyHeadlinePhrases(sc) {
    if (!sc)
        return [];
    const out = [];
    const take = (label, block) => {
        if (!block)
            return;
        for (const v of block.variants) {
            const h = v.headline?.trim();
            if (!h)
                continue;
            out.push(`${label} ${v.variantId}: ${clip(h, VCH_HEADLINE_SNIP)}`);
            if (out.length >= 4)
                return;
        }
    };
    take("paid", sc.paid);
    take("organic", sc.organic);
    return out;
}
/**
 * Single producer-facing readout: synthesizes stored brief fields with **live** copy variant headlines when present
 * (mapping on the brief may lag edits to copy JSON). If there is no brief but ad-style surface mirrors exist, returns a
 * thin sketch from hooks, CTAs, rationale, and copy only — still bounded and descriptive, not generative.
 */
export function deriveVisualConceptHandoffReadout(input) {
    const lines = [];
    const ab = input.creativeAssetBrief;
    if (ab) {
        if (ab.visualDirectionLine.trim()) {
            lines.push(clipVisualConceptLine(`Look / feel: ${ab.visualDirectionLine}`));
        }
        for (const cue of ab.assetConceptBullets.slice(0, 2)) {
            if (cue.trim())
                lines.push(clipVisualConceptLine(`Concept cue: ${cue}`));
        }
        if (ab.formatNotes.trim()) {
            lines.push(clipVisualConceptLine(`Format / placement notes: ${ab.formatNotes}`));
        }
        const live = liveCopyHeadlinePhrases(input.socialCopyVariants);
        if (live.length > 0) {
            lines.push(clipVisualConceptLine(`Copy emphasis (current row variants): ${live.join(" · ")}`));
        }
        else if (ab.copyToVisualMapping.length > 0) {
            const snap = ab.copyToVisualMapping
                .map((m) => `${m.channel} ${m.variantId}: ${m.headlineSnippet}`)
                .join(" · ");
            lines.push(clipVisualConceptLine(`Copy emphasis (brief snapshot at assemble time): ${snap}`));
        }
        if (ab.productionConstraints.length > 0) {
            lines.push(clipVisualConceptLine(`Production constraints: ${ab.productionConstraints.join(" · ")}`));
        }
        const trimmed = lines.filter(Boolean).slice(0, VCH_MAX_LINES);
        if (trimmed.length === 0)
            return null;
        return {
            kind: "brief_synthesis",
            headline: "Visual / concept handoff (synthesis from stored brief + current row)",
            lines: trimmed,
            provenanceNote: "Operator-only assembly: reorders and combines existing creative_asset_brief fields with live creative_social_copy_variants when present. Does not add persisted fields or generated imagery.",
        };
    }
    if (!input.recommendationPresent || input.recommendationCreativeMode !== "ad_style")
        return null;
    if (!input.paidSocialPresent && !input.organicSocialPresent)
        return null;
    const leadRat = input.paidSocialRationaleLines.find((l) => l.trim()) ??
        input.organicSocialRationaleLines.find((l) => l.trim()) ??
        null;
    if (leadRat) {
        lines.push(clipVisualConceptLine(`Story cue (recommendation rationale): ${leadRat}`));
    }
    const hooks = [];
    if (input.paidSocialHookAngle?.trim())
        hooks.push(`Paid hook: ${input.paidSocialHookAngle.trim()}`);
    if (input.organicSocialHookAngle?.trim()) {
        hooks.push(`Organic hook: ${input.organicSocialHookAngle.trim()}`);
    }
    if (hooks.length > 0)
        lines.push(clipVisualConceptLine(hooks.join(" · ")));
    const ctas = [input.paidSocialCta, input.organicSocialCta].filter((x) => Boolean(x?.trim()));
    if (ctas.length > 0) {
        lines.push(clipVisualConceptLine(`CTA cues: ${ctas.map((c) => c.trim()).join(" · ")}`));
    }
    const live = liveCopyHeadlinePhrases(input.socialCopyVariants);
    if (live.length > 0) {
        lines.push(clipVisualConceptLine(`Headlines (current row): ${live.join(" · ")}`));
    }
    const trimmed = lines.filter(Boolean).slice(0, VCH_MAX_LINES);
    if (trimmed.length === 0)
        return null;
    return {
        kind: "mirrors_copy_sketch",
        headline: "Visual / concept sketch (no stored asset brief on this row)",
        lines: trimmed,
        provenanceNote: "Operator-only sketch from ad-style recommendation mirrors and optional copy variants — no creative_asset_brief JSON. Does not invent imagery or production tasks.",
    };
}
/** Plain lines for human-readable handoff export (same derivation as AI Decisions). */
export function formatVisualConceptHandoffForPlainTextExport(creative) {
    const r = deriveVisualConceptHandoffReadout(creative);
    if (!r) {
        return ["  (none — not enough bounded row facts for a visual/concept sketch)"];
    }
    return [
        `  ${r.headline}`,
        ...r.lines.map((l) => `  · ${l}`),
        `  Provenance: ${clipVisualConceptLine(r.provenanceNote, 300)}`,
    ];
}
/** URL / operator triage for AI Decisions (`assetBriefTriage` query param). Factual: brief + copy JSON presence + ad-style paid surface. */
export const ASSET_BRIEF_TRIAGE_BUCKETS = [
    "all",
    "has_asset_brief",
    "no_asset_brief",
    "has_brief_and_copy",
    "copy_without_brief",
    "brief_without_copy",
    "ad_style_surface_no_brief",
];
const ASSET_BRIEF_TRIAGE_BUCKET_SET = new Set(ASSET_BRIEF_TRIAGE_BUCKETS);
export function isAssetBriefTriageBucket(v) {
    return ASSET_BRIEF_TRIAGE_BUCKET_SET.has(v);
}
export function assetBriefTriageMatchesRow(creative, bucket) {
    if (bucket === "all")
        return true;
    const hasBrief = creative.creativeAssetBrief != null;
    const hasCopy = creative.socialCopyVariants != null;
    switch (bucket) {
        case "has_asset_brief":
            return hasBrief;
        case "no_asset_brief":
            return !hasBrief;
        case "has_brief_and_copy":
            return hasBrief && hasCopy;
        case "copy_without_brief":
            return hasCopy && !hasBrief;
        case "brief_without_copy":
            return hasBrief && !hasCopy;
        case "ad_style_surface_no_brief":
            return (creative.recommendationPresent &&
                creative.recommendationCreativeMode === "ad_style" &&
                creative.paidSocialPresent &&
                !hasBrief);
        default:
            return true;
    }
}
