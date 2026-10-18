import { supabase } from "../../../workers/supabaseClient.js";
export async function handleNotificationDecision({ decision, runtimeContext, sourceAiDecisionId, }) {
    if (decision.action !== "send_notification")
        return;
    try {
        const title = decision.template ?? decision.reason ?? "Notification";
        const body = decision.reason ??
            "You have a new update available in your Kinex experience.";
        const row = {
            brand_id: runtimeContext.event.brand_id,
            person_id: runtimeContext.person.id,
            type: "in_app",
            title,
            body,
            template: decision.template,
            offer: decision.offer,
            incentive: decision.incentive,
            status: "pending",
        };
        if (typeof sourceAiDecisionId === "string" && sourceAiDecisionId.length > 0) {
            row.source_ai_decision_id = sourceAiDecisionId;
        }
        const { error } = await supabase.from("notifications").insert(row);
        if (error) {
            console.error("[Notification Handler] insert failed", error);
        }
    }
    catch (error) {
        console.error("[Notification Handler] insert failed", error);
    }
}
