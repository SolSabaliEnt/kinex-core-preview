const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
/** Max characters for model body text after strip — limits runaway copy (HTML is escaped after). */
const MAX_PERSONALIZATION_BODY_CHARS = 800;
export async function generatePersonalization(context, decision) {
    const fallbackSubject = "Something you might find useful";
    const fallbackHtml = "<p>We found something that might be helpful based on your recent activity.</p>";
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn("[AI Worker] Missing OPENAI_API_KEY, using fallback static personalization content");
        console.log(JSON.stringify({
            personalization_layer: true,
            template_key: decision.template ?? null,
            outcome: "fallback_no_api_key",
        }));
        return {
            subject: fallbackSubject,
            html: fallbackHtml,
        };
    }
    const aiInput = buildPersonalizationInput(context, decision);
    const prompt = `Write a short, friendly, personalized email introduction.\n\nPersonalization input (JSON):\n${JSON.stringify(aiInput, null, 2)}\n\nConstraints:\n- 2-3 concise sentences max.\n- Professional but warm tone.\n- No emojis.\n- Do not include a subject line, only the body copy.\n- Use only the services, offers, and incentives present in the provided brand data.\n- Do not invent new services, offers, or incentives.\n- Do not claim discounts, guarantees, or legal obligations not explicitly stated in the input.\n`;
    try {
        const response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                temperature: 0.3,
                messages: [
                    {
                        role: "system",
                        content: "Write concise marketing email body copy only. Use only the brand services, offers, and incentives provided in the input. Do not invent offers or incentives.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error("[AI Worker] OpenAI personalization API error", response.status, text);
            console.log(JSON.stringify({
                personalization_layer: true,
                template_key: decision.template ?? null,
                outcome: "fallback_http_error",
                http_status: response.status,
            }));
            return {
                subject: fallbackSubject,
                html: fallbackHtml,
            };
        }
        const json = (await response.json());
        const rawContent = (json.choices?.[0]?.message?.content ?? "").trim();
        const sanitized = rawContent.replace(/^```[a-zA-Z]*|```$/g, "").trim();
        const capped = sanitized.length > MAX_PERSONALIZATION_BODY_CHARS
            ? `${sanitized.slice(0, MAX_PERSONALIZATION_BODY_CHARS)}…`
            : sanitized;
        console.log(JSON.stringify({
            personalization_layer: true,
            template_key: decision.template ?? null,
            outcome: "openai_success",
            body_chars: capped.length,
            truncated: sanitized.length > MAX_PERSONALIZATION_BODY_CHARS,
        }));
        return {
            subject: fallbackSubject,
            html: `<p>${escapeHtml(capped)}</p>`,
        };
    }
    catch (error) {
        console.error("[AI Worker] Error calling OpenAI for personalization", error);
        console.log(JSON.stringify({
            personalization_layer: true,
            template_key: decision.template ?? null,
            outcome: "fallback_exception",
        }));
        return {
            subject: fallbackSubject,
            html: fallbackHtml,
        };
    }
}
/**
 * Bounded context for the personalization model — avoids passing full raw event payloads
 * (producer-controlled JSON) into the LLM. Template key / policy already fixed in
 * `workers/aiDecision.ts` before this runs.
 */
function buildPersonalizationInput(context, decision) {
    const ev = context.event;
    const event_summary = ev && typeof ev === "object"
        ? {
            id: typeof ev.id === "string" ? ev.id : undefined,
            event_type: typeof ev.event_type === "string" ? ev.event_type : undefined,
            occurred_at: typeof ev.occurred_at === "string" ? ev.occurred_at : undefined,
        }
        : null;
    return {
        event_summary,
        person: context.person_id ? { id: context.person_id } : null,
        personIntelligence: context.person_intelligence,
        decision,
        brand: {
            platform_role: context.brandContext?.profile?.platform_role ?? null,
            business_type: context.brandContext?.profile?.business_type ?? null,
            markets: context.brandContext?.markets ?? [],
            services: context.brandContext?.services ?? [],
            offers: context.brandContext?.offers ?? [],
            incentives: context.brandContext?.incentives ?? [],
        },
    };
}
function escapeHtml(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
