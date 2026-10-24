import { supabase } from "./supabaseClient.js";
export async function buildBrandContext(brandId) {
    const [profileResult, marketsResult, servicesResult, offersResult, incentivesResult, segmentsResult,] = await Promise.all([
        supabase
            .from("brand_profiles")
            .select("*")
            .eq("brand_id", brandId)
            .maybeSingle(),
        supabase.from("market_regions").select("*").eq("brand_id", brandId),
        supabase
            .from("service_departments")
            .select("*")
            .eq("brand_id", brandId)
            .eq("status", "active"),
        supabase.from("offers").select("*").eq("brand_id", brandId).eq("active", true),
        supabase
            .from("incentives")
            .select("*")
            .eq("brand_id", brandId)
            .eq("active", true),
        supabase.from("segments").select("*").eq("brand_id", brandId),
    ]);
    if (profileResult.error)
        throw profileResult.error;
    if (marketsResult.error)
        throw marketsResult.error;
    if (servicesResult.error)
        throw servicesResult.error;
    if (offersResult.error)
        throw offersResult.error;
    if (incentivesResult.error)
        throw incentivesResult.error;
    if (segmentsResult.error)
        throw segmentsResult.error;
    return {
        profile: profileResult.data ?? null,
        markets: marketsResult.data ?? [],
        services: servicesResult.data ?? [],
        offers: offersResult.data ?? [],
        incentives: incentivesResult.data ?? [],
        segments: segmentsResult.data ?? [],
    };
}
