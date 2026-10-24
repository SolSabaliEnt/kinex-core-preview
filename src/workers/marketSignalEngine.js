export function computeMarketSignals({ supply, demand, pricing, windows, }) {
    const supply_shortage = (supply.providers_available_now ?? 0) < 5;
    const demand_spike = (demand.booking_requests ?? 0) > 30;
    const pricing_pressure = (pricing.avg_discount_percent ?? 0) > 30;
    const conversion_risk = (demand.booking_abandonments ?? 0) > (demand.bookings_completed ?? 0);
    const demand_accelerating = (windows?.["30m"]?.booking_requests ?? 0) >
        (windows?.["24h"]?.booking_requests ?? 0) / 24;
    const conversion_declining = (windows?.["24h"]?.booking_abandonments ?? 0) >
        (windows?.["24h"]?.bookings_completed ?? 0);
    const signal_strength = [
        supply_shortage,
        demand_spike,
        pricing_pressure,
        conversion_risk,
        demand_accelerating,
        conversion_declining,
    ].filter(Boolean).length;
    return {
        supply_shortage,
        demand_spike,
        pricing_pressure,
        conversion_risk,
        demand_accelerating,
        conversion_declining,
        signal_strength,
    };
}
