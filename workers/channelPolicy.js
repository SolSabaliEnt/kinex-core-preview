/**
 * Brand / channel policy — **constants only** (Kinex v1).
 *
 * This module holds deterministic tables consumed by `workers/aiDecision.ts`.
 * It is **not** a policy engine: no DB reads, no runtime interpretation of `ai_rules`.
 *
 * **Layers (execution order in `finalizeDecision`):**
 * 1. **Non–SimplePaws email:** `allowedTemplateKeys` from `templates` (see `contextBuilder`) — `applyNonSimplePawsEmailTemplateGuardrail`.
 * 2. **SimplePaws email template:** intent → deterministic `templates.key` — `applySimplePawsTemplateGuardrail`.
 * 3. **SimplePaws channel:** intent → email vs notification downgrade — `applySimplePawsActionGuardrail`.
 *
 * **Elsewhere:**
 * - **OpenAI failure fallbacks** keyed by `event_type` — `CRITICAL_EVENT_FALLBACKS` (Cleanr-oriented event names in docs).
 * - **Pre-decision:** `workers/guardrails.ts` — `cold_lead` only.
 *
 * **SimplePaws:** `SIMPLEPAWS_EVENT_TYPE_TO_INTENT_KEY` lists dedicated promoted `trigger_event` values;
 * `receipts_organization_prompt` resolves from `payload.topIntent` on `simplepaws_intent` (**deferred** dedicated typing:
 * ranking/suppression — not missing notification mapping — `docs/SIMPLEPAWS_SETUP.md`).
 * **Routing:** which `routing_rules.action_type` to use per promoted slice (`sequence` vs `ai_decision`) is normalized in
 * `docs/SIMPLEPAWS_SETUP.md` — **Promoted-slice routing normalization** (not enforced in this module).
 */
/** When OpenAI decision call fails, use this action+template if `event.event_type` matches. */
export const CRITICAL_EVENT_FALLBACKS = {
    booking_abandoned: { action: "send_notification", template: "booking_recovery" },
    booking_confirmed: { action: "enqueue_sequence", template: "booking_confirmation" },
    clean_completed: { action: "send_notification", template: "review_prompt" },
};
/** Intent-specific SimplePaws event types → canonical intent_key (when payload.topIntent is missing). */
export const SIMPLEPAWS_EVENT_TYPE_TO_INTENT_KEY = {
    simplepaws_encourage_first_document: "encourage_first_document",
    simplepaws_complete_pet_enrichment: "complete_pet_enrichment",
    simplepaws_records_organization_prompt: "records_organization_prompt",
    simplepaws_vaccination_attention: "vaccination_attention",
    simplepaws_insurance_records_prompt: "insurance_records_prompt",
    simplepaws_plans_fit_message: "plans_fit_message",
    simplepaws_inactivity_reengagement: "inactivity_reengagement",
};
export const SIMPLEPAWS_SUPPORTED_INTENTS = [
    "encourage_first_document",
    "complete_pet_enrichment",
    "records_organization_prompt",
    "vaccination_attention",
    "insurance_records_prompt",
    "receipts_organization_prompt",
    "plans_fit_message",
    "inactivity_reengagement",
];
/**
 * Deterministic email template_key per SimplePaws intent (`templates.key`).
 * **Promoted email slices only** (1–2). Intents omitted here have **no** grounded email artifact in Kinex;
 * `SIMPLEPAWS_INTENT_CHANNEL_POLICY` sets `allowEmail: false` for those so the AI worker uses the
 * pre-model notification-first path when `action_type = ai_decision` — see `docs/SIMPLEPAWS_SETUP.md`
 * (“Lifecycle actioning — promoted slices”). Optional delayed **email** follow-up for notification-first
 * slices (3–7) uses operator `templates` + `sequence_steps`, not this map — same doc,
 * **Operating rule — promoted notification-first slices (3–7)** (under **Promoted-slice follow-up sequencing posture**).
 */
export const SIMPLEPAWS_INTENT_TO_EMAIL_TEMPLATE = {
    encourage_first_document: "simplepaws-encourage-first-document-email",
    complete_pet_enrichment: "simplepaws-complete-pet-enrichment-email",
};
/**
 * Deterministic in-app notification template key per SimplePaws intent.
 * Every supported intent has a row so guardrails can normalize `send_notification`.
 */
export const SIMPLEPAWS_INTENT_TO_NOTIFICATION_TEMPLATE = {
    encourage_first_document: "encourage_first_document",
    complete_pet_enrichment: "complete_pet_enrichment",
    records_organization_prompt: "records_organization_prompt",
    vaccination_attention: "vaccination_attention",
    insurance_records_prompt: "insurance_records_prompt",
    receipts_organization_prompt: "receipts_organization_prompt",
    plans_fit_message: "plans_fit_message",
    inactivity_reengagement: "inactivity_reengagement",
};
/**
 * SimplePaws: email vs in-app notification per resolved intent (lifecycle actioning input for `aiDecision`).
 *
 * - **Slices 1–2** (`encourage_first_document`, `complete_pet_enrichment`): both channels allowed; first
 *   action on `ai_decision` goes through the model unless operator uses `sequence` routing instead.
 * - **Promoted slices 3–7** (`records_organization_prompt`, `vaccination_attention`,
 *   `insurance_records_prompt`, `plans_fit_message`, `inactivity_reengagement`): `allowEmail: false` → **notification-only** for
 *   deterministic execution; `tryDeterministicSimplePawsNotificationFirstDecision` runs pre-OpenAI.
 * - **Deferred** `receipts_organization_prompt`: same notification-only keys; resolves from `payload.topIntent` on
 *   `simplepaws_intent` (**ranking contract** — `topIntent` not expected to be receipts under current org rules).
 */
export const SIMPLEPAWS_INTENT_CHANNEL_POLICY = {
    encourage_first_document: { allowEmail: true, allowNotification: true },
    complete_pet_enrichment: { allowEmail: true, allowNotification: true },
    records_organization_prompt: { allowEmail: false, allowNotification: true },
    vaccination_attention: { allowEmail: false, allowNotification: true },
    insurance_records_prompt: { allowEmail: false, allowNotification: true },
    receipts_organization_prompt: { allowEmail: false, allowNotification: true },
    plans_fit_message: { allowEmail: false, allowNotification: true },
    inactivity_reengagement: { allowEmail: false, allowNotification: true },
};
