import { supabase } from "../../workers/supabaseClient.js";
export async function recordMarketSignals({ brandId, marketRegionId, serviceType, signals, }) {
    let previousQuery = supabase
        .from("market_signals")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(1);
    previousQuery = marketRegionId
        ? previousQuery.eq("market_region_id", marketRegionId)
        : previousQuery.is("market_region_id", null);
    previousQuery = serviceType
        ? previousQuery.eq("service_type", serviceType)
        : previousQuery.is("service_type", null);
    const { data: previousRows, error: previousError } = await previousQuery;
    if (previousError) {
        throw previousError;
    }
    const previous = previousRows?.[0] ?? null;
    const { error: insertError } = await supabase.from("market_signals").insert({
        brand_id: brandId,
        market_region_id: marketRegionId ?? null,
        service_type: serviceType ?? null,
        supply_shortage: signals.supply_shortage,
        demand_spike: signals.demand_spike,
        pricing_pressure: signals.pricing_pressure,
        conversion_risk: signals.conversion_risk,
        signal_strength: signals.signal_strength,
    });
    if (insertError) {
        throw insertError;
    }
    const signalEventMap = [
        {
            key: "supply_shortage",
            eventType: "market_supply_shortage_detected",
        },
        {
            key: "demand_spike",
            eventType: "market_demand_spike_detected",
        },
        {
            key: "pricing_pressure",
            eventType: "market_pricing_pressure_detected",
        },
        {
            key: "conversion_risk",
            eventType: "market_conversion_risk_detected",
        },
    ];
    for (const { key, eventType } of signalEventMap) {
        if (key === "signal_strength")
            continue;
        const previousValue = Boolean(previous?.[key]);
        const nextValue = Boolean(signals[key]);
        if (!previousValue && nextValue) {
            const { error: eventError } = await supabase.from("events").insert({
                brand_id: brandId,
                event_type: eventType,
                payload: {
                    market_region_id: marketRegionId ?? null,
                    service_type: serviceType ?? null,
                },
            });
            if (eventError) {
                throw eventError;
            }
        }
    }
}
