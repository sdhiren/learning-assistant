import "server-only";

import path from "node:path";

import { resolveAiConfig, type AiConfig, type Env } from "@/server/config/env";
import type { ProfileRow } from "@/server/db/app-schema";
import { apiKeyKind, type ProfileSecrets } from "@/server/services/secret-service";

import { PROVIDER_IDS, type ProviderId } from "./providers";

export type ProfileAiFields = Pick<
  ProfileRow,
  "id" | "aiProvider" | "aiModel" | "claudeSignedInAt"
>;

/** Where Sign in with Claude keeps a profile's login: `PROFILES_DIR/<id>/claude`. */
export function claudeConfigDirFor(profilesDir: string, profileId: string): string {
  return path.resolve(profilesDir, profileId, "claude");
}

export function profileProvider(profile: Pick<ProfileRow, "aiProvider">, env: Env): ProviderId {
  const chosen = profile.aiProvider;
  return chosen && (PROVIDER_IDS as readonly string[]).includes(chosen)
    ? (chosen as ProviderId)
    : env.AI_PROVIDER;
}

/**
 * The AI settings one profile's calls use. The profile's own choice wins;
 * with none (sdhiren, new profiles) the env defaults apply, as before.
 * A saved key wins over the env key. For the subscription: the profile's own
 * Claude login, then a pasted token, then this machine's Claude Code login.
 */
export function resolveProfileAiConfig(
  profile: ProfileAiFields,
  env: Env,
  secrets: ProfileSecrets,
): AiConfig {
  const provider = profileProvider(profile, env);
  const ownChoice = Boolean(profile.aiProvider);
  const base = resolveAiConfig({
    ...env,
    AI_PROVIDER: provider,
    AI_MODEL: (ownChoice ? profile.aiModel : env.AI_MODEL) ?? undefined,
    CLAUDE_MODEL: ownChoice ? undefined : env.CLAUDE_MODEL,
  });

  if (provider === "claude-code") {
    if (profile.claudeSignedInAt) {
      return { ...base, claudeConfigDir: claudeConfigDirFor(env.PROFILES_DIR, profile.id) };
    }
    const oauthToken = secrets.claude_oauth_token;
    return oauthToken ? { ...base, oauthToken } : base;
  }

  return { ...base, apiKey: secrets[apiKeyKind(provider)] ?? base.apiKey };
}
