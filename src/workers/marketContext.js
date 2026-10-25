import { supabase } from "../../workers/supabaseClient.js";
import { computeMarketSignals } from "./marketSignalEngine.js";
import { recordMarketSignals } from "./marketSignalRecorder.js";
import { buildMarketMetricWindows, } from "./marketWindowLoader.js";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
    return UUID_REGEX.test(value);
}
async function resolveMarketRegionIdBySlug(brandId, slug) {
    const { data, error } = await supabase
        .from("market_regions")
        .select("id")
        .eq("brand_id", brandId)
        .ilike("name", `%${slug.trim()}%`)
        .limit(1)
        .maybeSingle();
    if (error || !data)
        return null;
    return data.id;
}
export async function buildMarketContext({ brandId, marketRegionId, serviceType, }) {
    let resolvedMarketRegionId = null;
    if (marketRegionId && typeof marketRegionId === "string" && marketRegionId.trim()) {
        if (isUuid(marketRegionId)) {
            resolvedMarketRegionId = marketRegionId;
        }
        else {
            resolvedMarketRegionId = await resolveMarketRegionIdBySlug(brandId, marketRegionId);
            if (!resolvedMarketRegionId) {
                console.warn("market_region_unresolved", {
                    brand_id: brandId,
                    slug: marketRegionId,
                    note: "slug did not resolve to market_regions.id; metrics may be brand-wide only",
                });
            }
        }
    }
    let supplyQuery = supabase
        .from("market_supply_metrics")
        .select("*")
        .eq("brand_id", brandId)
        .order("recorded_at", { ascending: false })
        .limit(1);
    let demandQuery = supabase
        .from("market_demand_metrics")
        .select("*")
        .eq("brand_id", brandId)
        .order("recorded_at", { ascending: false })
        .limit(1);
    let pricingQuery = supabase
        .from("market_pricing_signals")
        .select("*")
        .eq("brand_id", brandId)
        .order("recorded_at", { ascending: false })
        .limit(1);
    if (resolvedMarketRegionId) {
        supplyQuery = supplyQuery.eq("market_region_id", resolvedMarketRegionId);
        demandQuery = demandQuery.eq("market_region_id", resolvedMarketRegionId);
        pricingQuery = pricingQuery.eq("market_region_id", resolvedMarketRegionId);
    }
    if (serviceType) {
        supplyQuery = supplyQuery.eq("service_type", serviceType);
        demandQuery = demandQuery.eq("service_type", serviceType);
        pricingQuery = pricingQuery.eq("service_type", serviceType);
    }
    const [supplyResult, demandResult, pricingResult] = await Promise.all([
        supplyQuery,
        demandQuery,
        pricingQuery,
    ]);
    if (supplyResult.error)
        throw supplyResult.error;
    if (demandResult.error)
        throw demandResult.error;
    if (pricingResult.error)
        throw pricingResult.error;
    const supplyRow = supplyResult.data?.[0];
    const demandRow = demandResult.data?.[0];
    const pricingRow = pricingResult.data?.[0];
    const supply = {
        active_providers: supplyRow?.active_providers ?? null,
        providers_available_now: supplyRow?.providers_available_now ?? null,
        provider_acceptance_rate: supplyRow?.provider_acceptance_rate ?? null,
        avg_response_minutes: supplyRow?.avg_response_minutes ?? null,
    };
    const demand = {
        booking_requests: demandRow?.booking_requests ?? null,
        bookings_completed: demandRow?.bookings_completed ?? null,
        booking_abandonments: demandRow?.booking_abandonments ?? null,
        avg_booking_value: demandRow?.avg_booking_value ?? null,
    };
    const pricing = {
        avg_price: pricingRow?.avg_price ?? null,
        avg_discount_percent: pricingRow?.avg_discount_percent ?? null,
        incentive_usage_rate: pricingRow?.incentive_usage_rate ?? null,
    };
    const { windows } = await buildMarketMetricWindows({
        brandId,
        marketRegionId: resolvedMarketRegionId,
        serviceType,
    });
    const signals = computeMarketSignals({
        supply,
        demand,
        pricing,
        windows,
    });
    try {
        await recordMarketSignals({
            brandId,
            marketRegionId: resolvedMarketRegionId,
            serviceType,
            signals,
        });
    }
    catch (error) {
        console.error("[Market Context] Failed to record market signals", {
            brand_id: brandId,
            market_region_id: resolvedMarketRegionId ?? null,
            service_type: serviceType ?? null,
            error,
        });
    }
    return {
        supply,
        demand,
        pricing,
        signals,
        windows,
    };
}
