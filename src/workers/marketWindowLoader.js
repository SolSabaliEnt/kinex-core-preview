import { supabase } from "../../workers/supabaseClient.js";
const EMPTY_WINDOWS = {
    windows: {
        "30m": null,
        "24h": null,
        "7d": null,
    },
};
export async function buildMarketMetricWindows({ brandId, marketRegionId, serviceType, }) {
    try {
        // Live DB may not match older `recorded_at` naming; prefer `created_at` (used elsewhere on market tables).
        let query = supabase
            .from("market_metric_windows")
            .select("*")
            .eq("brand_id", brandId)
            .in("window_type", ["30m", "24h", "7d"])
            .order("created_at", { ascending: false });
        if (marketRegionId) {
            query = query.eq("market_region_id", marketRegionId);
        }
        if (serviceType) {
            query = query.eq("service_type", serviceType);
        }
        const { data, error } = await query;
        if (error) {
            console.error("[MarketMetricWindows] query failed", error);
            return EMPTY_WINDOWS;
        }
        const latestByWindow = {
            "30m": null,
            "24h": null,
            "7d": null,
        };
        for (const row of data ?? []) {
            const windowType = row.window_type;
            if ((windowType === "30m" || windowType === "24h" || windowType === "7d") &&
                latestByWindow[windowType] === null) {
                latestByWindow[windowType] = row;
            }
        }
        return {
            windows: latestByWindow,
        };
    }
    catch (err) {
        console.error("[MarketMetricWindows] unexpected error", err);
        return EMPTY_WINDOWS;
    }
}
