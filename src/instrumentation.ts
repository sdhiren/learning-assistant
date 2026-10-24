/**
 * Runs once when the server starts. Validating the environment here makes a
 * bad configuration (e.g. AI_PROVIDER=anthropic without ANTHROPIC_API_KEY)
 * stop the app at startup instead of on the first page load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getAiConfig } = await import("@/server/config/env");
  getAiConfig();
}
