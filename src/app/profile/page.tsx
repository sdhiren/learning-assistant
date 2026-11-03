import type { Metadata } from "next";
import { connection } from "next/server";

import { AiSettings, type ProviderOption } from "@/components/profile/ai-settings";
import { ChangePasswordForm, ProfileDetailsForm } from "@/components/profile/profile-forms";
import { Card } from "@/components/ui/card";
import { PROVIDERS } from "@/server/ai/providers";
import { getAiProviderInfo, getProfileSettings } from "@/server/container";
import { requireProfile } from "@/server/session";

export const metadata: Metadata = { title: "Profile" };

const KEY_PROVIDERS = ["anthropic", "openai", "gemini"] as const;

export default async function ProfilePage() {
  await connection();
  const profile = await requireProfile();
  const settings = getProfileSettings();
  const ai = settings.aiSettings(profile);
  const current = getAiProviderInfo(profile);
  const connected = await settings.claudeConnection(profile);
  const subscription = PROVIDERS["claude-code"];

  const keyProviders: ProviderOption[] = KEY_PROVIDERS.map((id) => ({
    id,
    displayName: PROVIDERS[id].displayName,
    defaultModel: PROVIDERS[id].defaultModel,
  }));
  const hints = Object.fromEntries(
    Object.entries(ai.hints).map(([kind, hint]) => [kind, hint.hint]),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted">
          Signed in as <strong>{profile.username}</strong>. Your topics, quizzes and usage are
          stored only in your own profile.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">AI settings</h2>
        <Card>
          <AiSettings
            subscriptionLabel={subscription.label}
            subscriptionName={subscription.displayName}
            currentProvider={current.id}
            ownChoice={ai.provider !== null}
            model={ai.model}
            keyProviders={keyProviders}
            hints={hints}
            signInSupported={ai.claudeSignInSupported}
            connection={
              connected && { ...connected, connectedAt: connected.connectedAt.toISOString() }
            }
          />
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Details and interests</h2>
        <Card>
          <ProfileDetailsForm
            details={{
              firstName: profile.firstName,
              lastName: profile.lastName,
              targetRole: profile.targetRole,
              experienceLevel: profile.experienceLevel,
              interests: profile.interests,
            }}
          />
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Password</h2>
        <Card>
          <ChangePasswordForm />
        </Card>
      </section>
    </div>
  );
}
