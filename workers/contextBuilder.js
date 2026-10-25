import { buildBrandContext } from "./buildBrandContext.js";
import { supabase } from "./supabaseClient.js";
import { buildMarketContext } from "../src/workers/marketContext.js";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
    return UUID_REGEX.test(value);
}
async function resolveMarketRegionId(brandId, marketRegionIdOrSlug) {
    if (isUuid(marketRegionIdOrSlug))
        return marketRegionIdOrSlug;
    const slug = marketRegionIdOrSlug.trim();
    // Substring match so payload slugs like "atlanta" match names "Atlanta" / "Atlanta Metro".
    const { data, error } = await supabase
        .from("market_regions")
        .select("id")
        .eq("brand_id", brandId)
        .ilike("name", `%${slug}%`)
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error("market_region_unresolved", { brand_id: brandId, slug, error: error.message });
        return null;
    }
    if (!data) {
        console.warn("market_region_unresolved", {
            brand_id: brandId,
            slug,
            note: "no market_regions row name-ilike this slug for brand; add a row or use a UUID market_region_id on events",
        });
        return null;
    }
    return data.id;
}
export async function buildContext(job) {
    if (!job.event_id) {
        console.warn("[AI Worker] Job is missing event_id, skipping", job);
        return null;
    }
    const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", job.event_id)
        .maybeSingle();
    if (eventError) {
        console.error("[AI Worker] Failed to load event", job.event_id, eventError);
        return null;
    }
    if (!event) {
        console.warn("[AI Worker] No event found for id", job.event_id);
        return null;
    }
    const personId = event.person_id ?? null;
    const brandId = event.brand_id ?? null;
    let personIntel = null;
    if (personId) {
        // Schema allows multiple person_intelligence rows per person (e.g. per brand).
        // maybeSingle() without limit fails with PGRST116 when more than one row exists.
        let intelQuery = supabase
            .from("person_intelligence")
            .select("*")
            .eq("person_id", personId);
        if (brandId) {
            intelQuery = intelQuery.eq("brand_id", brandId);
        }
        const { data, error } = await intelQuery
            .order("last_ai_update", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error("[AI Worker] Failed to load person_intelligence", error);
        }
        else {
            personIntel = data;
        }
    }
    const { data: templateStats, error: statsError } = await supabase
        .from("ai_template_performance")
        .select("*");
    if (statsError) {
        console.error("[AI Worker] Failed to load ai_template_performance", statsError);
    }
    let brandContext = null;
    let allowedTemplateKeys = [];
    let aiRules = [];
    let aiModelConfig = null;
    if (brandId) {
        try {
            brandContext = await buildBrandContext(brandId);
        }
        catch (error) {
            console.error("brand_context_missing", {
                brand_id: brandId,
                error,
            });
        }
        const { data: templateRows, error: templatesError } = await supabase
            .from("templates")
            .select("key")
            .eq("brand_id", brandId);
        if (templatesError) {
            console.error("[AI Worker] Failed to load templates for allowlist", templatesError);
        }
        else {
            const keys = (templateRows ?? [])
                .map((row) => typeof row.key === "string" ? row.key.trim() : "")
                .filter((k) => k.length > 0);
            allowedTemplateKeys = [...new Set(keys)];
        }
        const { data: rulesRows, error: rulesError } = await supabase
            .from("ai_rules")
            .select("id, rule_name, rule_type, rule_config, is_active, created_at")
            .eq("brand_id", brandId)
            .eq("is_active", true)
            .order("created_at", { ascending: true });
        if (rulesError) {
            console.error("[AI Worker] Failed to load active ai_rules", rulesError);
        }
        else {
            aiRules = rulesRows ?? [];
        }
        const { data: modelConfigRow, error: modelConfigError } = await supabase
            .from("ai_model_config")
            .select("model_name, temperature, max_tokens, system_prompt, created_at")
            .eq("brand_id", brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (modelConfigError) {
            console.error("[AI Worker] Failed to load ai_model_config", modelConfigError);
        }
        else if (modelConfigRow) {
            const row = modelConfigRow;
            aiModelConfig = {
                model_name: typeof row.model_name === "string" ? row.model_name : null,
                temperature: typeof row.temperature === "number" && Number.isFinite(row.temperature)
                    ? row.temperature
                    : null,
                max_tokens: typeof row.max_tokens === "number" && Number.isFinite(row.max_tokens)
                    ? row.max_tokens
                    : null,
                system_prompt: typeof row.system_prompt === "string" ? row.system_prompt : null,
            };
        }
    }
    let marketContext = null;
    if (brandId) {
        try {
            const rawMarketRegionId = event.market_region_id ??
                event.payload?.market_region_id ??
                null;
            const marketRegionId = typeof rawMarketRegionId === "string" && rawMarketRegionId.trim()
                ? await resolveMarketRegionId(brandId, rawMarketRegionId)
                : null;
            marketContext = await buildMarketContext({
                brandId,
                marketRegionId,
                serviceType: event.service_type ??
                    event.payload?.service_type ??
                    null,
            });
        }
        catch (error) {
            console.error("market_context_missing", {
                brand_id: brandId,
                error,
            });
        }
    }
    return {
        event,
        event_id: event.id,
        brand_id: brandId,
        person_id: personId,
        person_intelligence: personIntel,
        template_stats: templateStats ?? [],
        ai_rules: aiRules,
        ai_model_config: aiModelConfig,
        allowedTemplateKeys,
        brandContext,
        marketContext,
    };
}
