import "server-only";

import type { AiSettingsInput, UpdateProfileInput } from "@/domain/input-schemas";
import { AppError } from "@/lib/errors";
import { claudeSignInSupported, type ClaudeLoginFlow } from "@/server/ai/claude-login";
import { PROVIDERS, type ProviderId } from "@/server/ai/providers";
import type { RegistryDatabase } from "@/server/db/app-client";
import type { ProfileRow } from "@/server/db/app-schema";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import type { ResolvedSession } from "@/server/services/auth-service";
import {
  apiKeyKind,
  type SecretHint,
  type SecretKind,
  type SecretService,
} from "@/server/services/secret-service";

/** What the AI settings card may show. Never contains a secret, only hints. */
export interface AiSettingsView {
  /** The profile's own choice; null means the env default applies. */
  provider: ProviderId | null;
  model: string | null;
  hints: Partial<Record<SecretKind, SecretHint>>;
  claudeSignInSupported: boolean;
  claudeSignedInAt: Date | null;
}

export interface ClaudeConnection {
  email: string | null;
  plan: string | null;
  connectedAt: Date;
}

/** Checks a key or login with one tiny call before it's saved. Throws a user-facing error. */
export type CredentialCheck = () => Promise<void>;

/**
 * A profile's own details and AI settings. Secrets go through SecretService
 * (sealed under the session's data key); the Claude login goes through
 * ClaudeLoginFlow, which leaves the credential with Claude Code.
 */
export class ProfileService {
  private readonly profiles: ProfileRepository;

  constructor(
    registry: RegistryDatabase,
    private readonly secrets: SecretService,
    private readonly claudeLogin: ClaudeLoginFlow,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.profiles = new ProfileRepository(registry);
  }

  updateDetails(profileId: string, input: UpdateProfileInput): void {
    this.profiles.updateDetails(profileId, {
      firstName: input.firstName,
      lastName: input.lastName,
      targetRole: input.targetRole,
      experienceLevel: input.experienceLevel,
      interests: input.interests,
    });
  }

  aiSettings(profile: ProfileRow): AiSettingsView {
    const provider = profile.aiProvider as ProviderId | null;
    return {
      provider: provider && provider in PROVIDERS ? provider : null,
      model: profile.aiModel,
      hints: this.secrets.hints(profile.id),
      claudeSignInSupported: claudeSignInSupported(),
      claudeSignedInAt: profile.claudeSignedInAt,
    };
  }

  /**
   * Saves the provider choice, and a new key if one was given. A new key is
   * checked first (`check`) and stored only as ciphertext. Returns its hint.
   */
  async updateAiSettings(
    session: ResolvedSession,
    input: AiSettingsInput,
    check?: CredentialCheck,
  ): Promise<{ hint: string | null }> {
    const { profile, dek } = session;
    let hint: string | null = null;
    if (input.apiKey) {
      if (input.provider === "claude-code") {
        throw new AppError("The subscription doesn't use an API key. Choose an API provider.");
      }
      await check?.();
      hint = this.secrets.set(profile.id, dek, apiKeyKind(input.provider), input.apiKey).hint;
    }
    this.profiles.setAiSettings(profile.id, input.provider, input.model || null);
    return { hint };
  }

  /** The `claude setup-token` fallback: stored sealed, used as CLAUDE_CODE_OAUTH_TOKEN. */
  saveClaudeToken(session: ResolvedSession, token: string): { hint: string } {
    const { hint } = this.secrets.set(session.profile.id, session.dek, "claude_oauth_token", token);
    this.useSubscription(session.profile);
    return { hint };
  }

  removeSecret(profileId: string, kind: SecretKind): void {
    this.secrets.remove(profileId, kind);
  }

  /** Starting again replaces any earlier login (the config dir is emptied first). */
  startClaudeSignIn(profileId: string): Promise<{ flowId: string; url: string }> {
    this.assertSignInSupported();
    this.profiles.setClaudeSignedInAt(profileId, null);
    return this.claudeLogin.start(profileId);
  }

  /**
   * Finishes Sign in with Claude: the CLI must exit cleanly, `auth status`
   * must report a subscription login, and `check` (one tiny query through the
   * profile's config dir) must pass. Otherwise the login is removed again.
   */
  async completeClaudeSignIn(
    profile: ProfileRow,
    flowId: string,
    code: string,
    check?: CredentialCheck,
  ): Promise<ClaudeConnection> {
    this.assertSignInSupported();
    const status = await this.claudeLogin.complete(profile.id, flowId, code);
    const connectedAt = this.now();
    this.profiles.setClaudeSignedInAt(profile.id, connectedAt);
    try {
      await check?.();
    } catch (error) {
      await this.signOutOfClaude(profile.id);
      throw error;
    }
    this.useSubscription(profile);
    return { email: status.email ?? null, plan: status.plan ?? null, connectedAt };
  }

  cancelClaudeSignIn(profileId: string, flowId: string): void {
    this.claudeLogin.cancel(profileId, flowId);
  }

  async signOutOfClaude(profileId: string): Promise<void> {
    await this.claudeLogin.logout(profileId);
    this.profiles.setClaudeSignedInAt(profileId, null);
  }

  /** Who the profile is signed in as, for display. Null if it uses the machine login. */
  async claudeConnection(profile: ProfileRow): Promise<ClaudeConnection | null> {
    if (!profile.claudeSignedInAt) return null;
    const status = await this.claudeLogin.status(profile.id);
    if (!status.loggedIn) return null;
    return {
      email: status.email ?? null,
      plan: status.plan ?? null,
      connectedAt: profile.claudeSignedInAt,
    };
  }

  /**
   * After a CLI password reset the old data key is gone: delete the sealed
   * secrets and sign the profile out of Claude, so nothing outlives the reset.
   */
  async forgetCredentials(profileId: string): Promise<{ secretsDeleted: number }> {
    const secretsDeleted = this.secrets.removeAll(profileId);
    await this.signOutOfClaude(profileId);
    return { secretsDeleted };
  }

  private useSubscription(profile: ProfileRow): void {
    const keepModel = profile.aiProvider === "claude-code" || profile.aiProvider === "anthropic";
    this.profiles.setAiSettings(profile.id, "claude-code", keepModel ? profile.aiModel : null);
  }

  private assertSignInSupported(): void {
    if (!claudeSignInSupported()) {
      throw new AppError("Signing in per profile isn't supported on this platform. Paste a token.");
    }
  }
}
