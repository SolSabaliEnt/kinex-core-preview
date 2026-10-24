import { supabase } from "./supabaseClient.js";
/**
 * `fetch_pending_jobs` (see migrations) atomically claims rows: status=processing, attempts++.
 * Each worker must release rows it does not own so the other worker (or a later poll) can process them.
 */
export async function releaseClaimedJob(job) {
    const prevAttempts = Math.max(0, (job.attempts ?? 0) - 1);
    const { error } = await supabase
        .from("automation_queue")
        .update({
        status: "pending",
        attempts: prevAttempts,
        processed_at: null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
    })
        .eq("id", job.id);
    if (error) {
        console.error("[Queue] Failed to release claimed job (wrong worker)", job.id, error);
        return;
    }
    // Expected when the AI worker polls mixed `action_type` batches: success is noisy at default log level.
    if (process.env.KINEX_AI_WORKER_QUEUE_DEBUG === "1") {
        console.log("[Queue] Released claimed job back to pending", job.id);
    }
}
