import { createClient } from "@supabase/supabase-js";
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
