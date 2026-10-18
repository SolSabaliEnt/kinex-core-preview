/**
 * Deterministic email HTML shell merge for the AI worker path.
 * When `templates.html` contains `{{body}}`, the model-generated fragment replaces
 * that token; otherwise the worker keeps the prior behavior (generated HTML only).
 * Does not substitute other `{{name}}` tokens — those remain literal unless the
 * brand uses the dev outbound send path with explicit variables.
 */
const BODY_TOKEN = "{{body}}";
/**
 * Merge DB `templates.html` with AI-generated body HTML.
 * - Empty / whitespace `templateHtml` → use `generatedBodyHtml` only.
 * - Non-empty template without `{{body}}` → generated body only (shell not used);
 *   avoids sending a static template that was meant for a different rendering path.
 */
export function mergeEmailTemplateShell(templateHtml, generatedBodyHtml) {
    const raw = typeof templateHtml === "string" ? templateHtml.trim() : "";
    if (!raw) {
        return { html: generatedBodyHtml, mode: "generated_body_only" };
    }
    if (!raw.includes(BODY_TOKEN)) {
        console.warn("[AI Worker] templates.html is non-empty but has no {{body}} placeholder; outbound body uses generated HTML only (see workers/templateShell.ts)");
        return { html: generatedBodyHtml, mode: "generated_body_only" };
    }
    const html = raw.split(BODY_TOKEN).join(generatedBodyHtml);
    return { html, mode: "shell_with_body_placeholder" };
}
