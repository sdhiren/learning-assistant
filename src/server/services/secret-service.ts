import "server-only";

import type { ProviderId } from "@/server/ai/providers";
import { open, seal } from "@/server/crypto/secret-box";
import type { RegistryDatabase } from "@/server/db/app-client";
import { logger } from "@/server/logger";
import { SecretRepository } from "@/server/repositories/secret-repository";

export const SECRET_KINDS = [
  "api_key:anthropic",
  "api_key:openai",
  "api_key:gemini",
  "claude_oauth_token",
] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

export type KeyProviderId = Exclude<ProviderId, "claude-code">;

export function apiKeyKind(provider: KeyProviderId): SecretKind {
  return `api_key:${provider}`;
}

/** Decrypted secrets for one profile. Held in memory only, never logged or returned. */
export type ProfileSecrets = Partial<Record<SecretKind, string>>;

/** What the UI may see about a saved secret: never the value. */
export interface SecretHint {
  hint: string;
  updatedAt: Date;
}

const aadFor = (profileId: string, kind: SecretKind) => `${profileId}:${kind}`;

/**
 * Seals and opens a profile's saved secrets with its data key (AES-256-GCM,
 * AAD = profile id + kind), so a row can't be replayed under another profile
 * or kind. Only ciphertext and a 4-character hint reach the database.
 */
export class SecretService {
  private readonly secrets: SecretRepository;

  constructor(
    registry: RegistryDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.secrets = new SecretRepository(registry);
  }

  set(profileId: string, dek: Buffer, kind: SecretKind, value: string): SecretHint {
    const box = seal(dek, value, aadFor(profileId, kind));
    const saved = { hint: value.slice(-4), updatedAt: this.now() };
    this.secrets.upsert({ profileId, kind, ...box, ...saved });
    return saved;
  }

  remove(profileId: string, kind: SecretKind): void {
    this.secrets.delete(profileId, kind);
  }

  /** Deletes every saved secret (CLI password reset: the old data key is gone). */
  removeAll(profileId: string): number {
    return this.secrets.deleteAll(profileId);
  }

  hints(profileId: string): Partial<Record<SecretKind, SecretHint>> {
    const hints: Partial<Record<SecretKind, SecretHint>> = {};
    for (const row of this.secrets.list(profileId)) {
      if (isSecretKind(row.kind)) hints[row.kind] = { hint: row.hint, updatedAt: row.updatedAt };
    }
    return hints;
  }

  loadDecrypted(profileId: string, dek: Buffer): ProfileSecrets {
    const secrets: ProfileSecrets = {};
    for (const row of this.secrets.list(profileId)) {
      if (!isSecretKind(row.kind)) continue;
      try {
        secrets[row.kind] = open(dek, row, aadFor(profileId, row.kind));
      } catch {
        // Only the kind is logged; a failure here means the row was sealed under another key.
        logger.warn("Saved secret could not be decrypted", { kind: row.kind });
      }
    }
    return secrets;
  }
}

function isSecretKind(kind: string): kind is SecretKind {
  return (SECRET_KINDS as readonly string[]).includes(kind);
}
