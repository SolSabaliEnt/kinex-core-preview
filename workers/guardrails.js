export async function checkGuardrails(context) {
    const brandId = context.brand_id;
    const personId = context.person_id;
    const lifecycleStage = context.person_intelligence
        ?.lifecycle_stage;
    if (lifecycleStage === "cold_lead") {
        console.log(JSON.stringify({
            guardrail_enforced: true,
            guardrail_id: "cold_lead_block",
            source: "person_intelligence.lifecycle_stage",
            brand_id: brandId,
            person_id: personId,
        }));
        return { allowed: false };
    }
    return { allowed: true };
}
