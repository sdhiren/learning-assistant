"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  aiSettingsInput,
  changePasswordInput,
  claudeSignInCodeInput,
  claudeTokenInput,
  id,
  removeSecretInput,
  updateProfileInput,
} from "@/domain/input-schemas";
import type { ActionResult } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { claudeConfigDirFor } from "@/server/ai/profile-ai-config";
import { getEnv, resolveAiConfig, type AiConfig } from "@/server/config/env";
import {
  createLlmClient,
  getAuth,
  getProfileSettings,
  invalidateProfile,
} from "@/server/container";
import type { ClaudeConnection } from "@/server/services/profile-service";
import { requireSession } from "@/server/session";

import { runAction } from "./run-action";

/** One tiny structured call, so a bad key or login fails here rather than mid-quiz. */
async function checkCredential(config: AiConfig): Promise<void> {
  await createLlmClient(config).generateStructured({
    task: "check-credential",
    systemPrompt: "Reply with the JSON object requested.",
    prompt: 'Return {"ok": true}.',
    schema: z.object({ ok: z.boolean() }),
    effort: "low",
  });
}

function done(profileId: string): void {
  invalidateProfile(profileId);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction("updateProfile", async () => {
    const { profile } = await requireSession();
    getProfileSettings().updateDetails(
      profile.id,
      updateProfileInput.parse({
        firstName: formData.get("firstName") ?? "",
        lastName: formData.get("lastName") ?? "",
        targetRole: formData.get("targetRole") ?? "",
        experienceLevel: formData.get("experienceLevel") ?? undefined,
        interests: formData.getAll("interests"),
      }),
    );
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function changePasswordAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction("changePassword", async () => {
    const session = await requireSession();
    await getAuth().changePassword(
      session,
      changePasswordInput.parse({
        currentPassword: formData.get("currentPassword") ?? "",
        password: formData.get("password") ?? "",
        confirmPassword: formData.get("confirmPassword") ?? "",
      }),
    );
    return undefined;
  });
}

/** Saves the provider and model, and a new key if given. Returns only the key's hint. */
export async function updateAiSettingsAction(
  _previous: ActionResult<{ hint: string | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ hint: string | null }>> {
  return runAction("updateAiSettings", async () => {
    const session = await requireSession();
    const input = aiSettingsInput.parse({
      provider: formData.get("provider") ?? "",
      model: formData.get("model") ?? "",
      apiKey: formData.get("apiKey") ?? "",
    });
    const config: AiConfig = {
      ...resolveAiConfig({ ...getEnv(), AI_PROVIDER: input.provider, CLAUDE_MODEL: undefined }),
      ...(input.model ? { model: input.model } : {}),
      apiKey: input.apiKey,
    };
    const result = await getProfileSettings().updateAiSettings(session, input, () =>
      checkCredential(config),
    );
    done(session.profile.id);
    return result;
  });
}

export async function saveClaudeTokenAction(
  _previous: ActionResult<{ hint: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ hint: string }>> {
  return runAction("saveClaudeToken", async () => {
    const session = await requireSession();
    const { token } = claudeTokenInput.parse({ token: formData.get("token") ?? "" });
    const result = getProfileSettings().saveClaudeToken(session, token);
    done(session.profile.id);
    return result;
  });
}

export async function removeSecretAction(kind: string): Promise<ActionResult> {
  return runAction("removeSecret", async () => {
    const { profile } = await requireSession();
    getProfileSettings().removeSecret(profile.id, removeSecretInput.parse({ kind }).kind);
    done(profile.id);
    return undefined;
  });
}

/** Starts `claude auth login` for this profile. The URL is shown to its own user only. */
export async function startClaudeSignInAction(): Promise<
  ActionResult<{ flowId: string; url: string }>
> {
  return runAction("startClaudeSignIn", async () => {
    const { profile } = await requireSession();
    const flow = await getProfileSettings().startClaudeSignIn(profile.id);
    invalidateProfile(profile.id);
    return flow;
  });
}

/** Feeds the pasted code to the CLI and verifies the login. Never returns the code. */
export async function completeClaudeSignInAction(
  _previous: ActionResult<ClaudeConnection> | null,
  formData: FormData,
): Promise<ActionResult<ClaudeConnection>> {
  return runAction("completeClaudeSignIn", async () => {
    const { profile } = await requireSession();
    const { flowId, code } = claudeSignInCodeInput.parse({
      flowId: formData.get("flowId") ?? "",
      code: formData.get("code") ?? "",
    });
    const env = getEnv();
    const config: AiConfig = {
      ...resolveAiConfig({ ...env, AI_PROVIDER: "claude-code" }),
      claudeConfigDir: claudeConfigDirFor(env.PROFILES_DIR, profile.id),
    };
    const connection = await getProfileSettings().completeClaudeSignIn(
      profile,
      flowId,
      code,
      async () => {
        try {
          await checkCredential(config);
        } catch {
          throw new AppError("Signed in, but a test request failed. Please try again.");
        }
      },
    );
    done(profile.id);
    return connection;
  });
}

export async function cancelClaudeSignInAction(flowId: string): Promise<ActionResult> {
  return runAction("cancelClaudeSignIn", async () => {
    const { profile } = await requireSession();
    getProfileSettings().cancelClaudeSignIn(profile.id, id.parse(flowId));
    return undefined;
  });
}

export async function signOutOfClaudeAction(): Promise<ActionResult> {
  return runAction("signOutOfClaude", async () => {
    const { profile } = await requireSession();
    await getProfileSettings().signOutOfClaude(profile.id);
    done(profile.id);
    return undefined;
  });
}
