import { supabase } from "./supabaseClient.js";
async function runWorker() {
    console.log("[Intel Worker] Starting intelligence worker");
    while (true) {
        try {
            const { data: events, error } = await supabase
                .from("events")
                .select("*")
                .order("occurred_at", { ascending: false })
                .limit(25);
            if (error) {
                console.error("[Intel Worker] Error loading events", error);
                await sleep(5000);
                continue;
            }
            if (!events || events.length === 0) {
                await sleep(2000);
                continue;
            }
            for (const event of events) {
                try {
                    await processEvent(event);
                }
                catch (err) {
                    console.error("[Intel Worker] Error processing event", event.id, err);
                }
            }
        }
        catch (err) {
            console.error("[Intel Worker] Unhandled error in main loop", err);
            await sleep(5000);
        }
    }
}
async function processEvent(event) {
    if (!event.person_id)
        return;
    const engagement = scoreEvent(event);
    const interests = deriveInterest(event);
    await supabase.from("person_intelligence").upsert({
        person_id: event.person_id,
        brand_id: event.brand_id,
        engagement_score: engagement,
        last_event_at: event.occurred_at,
        interests,
    });
}
function scoreEvent(event) {
    switch (event.event_type) {
        case "email_opened":
            return 2;
        case "email_clicked":
            return 5;
        case "guide_downloaded":
            return 10;
        case "product_purchased":
            return 20;
        default:
            return 1;
    }
}
function deriveInterest(event) {
    if (!event.payload)
        return [];
    if (event.payload.topic) {
        return [event.payload.topic];
    }
    return [];
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
void runWorker();
