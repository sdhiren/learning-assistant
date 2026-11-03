"use client";

import { useState, useTransition } from "react";

import { Field, inputClasses } from "@/components/auth/field";
import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { AI_MODEL_MAX_LENGTH, SECRET_MAX_LENGTH } from "@/domain/input-schemas";
import {
  cancelClaudeSignInAction,
  completeClaudeSignInAction,
  removeSecretAction,
  saveClaudeTokenAction,
  signOutOfClaudeAction,
  startClaudeSignInAction,
  updateAiSettingsAction,
} from "@/server/actions/profile-actions";

export interface ProviderOption {
  id: "anthropic" | "openai" | "gemini";
  displayName: string;
  defaultModel: string;
}

/** Everything the card shows. Secrets never reach the browser, only their last 4 characters. */
export interface AiSettingsProps {
  subscriptionLabel: string;
  subscriptionName: string;
  currentProvider: string;
  ownChoice: boolean;
  model: string | null;
  keyProviders: ProviderOption[];
  hints: Partial<Record<string, string>>;
  signInSupported: boolean;
  connection: { email: string | null; plan: string | null; connectedAt: string } | null;
}

const buttonClasses =
  "rounded-md border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50";

export function AiSettings(props: AiSettingsProps) {
  const [mode, setMode] = useState(
    props.currentProvider === "claude-code" ? "subscription" : "key",
  );

  return (
    <div className="space-y-5">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">How to run AI requests</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="ai-mode"
            checked={mode === "subscription"}
            onChange={() => setMode("subscription")}
          />
          {props.subscriptionName}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="ai-mode"
            checked={mode === "key"}
            onChange={() => setMode("key")}
          />
          API key
        </label>
      </fieldset>
      {!props.ownChoice && (
        <p className="text-sm text-muted">You&apos;re using this app&apos;s default provider.</p>
      )}
      {mode === "subscription" ? <SubscriptionSettings {...props} /> : <KeySettings {...props} />}
    </div>
  );
}

function SubscriptionSettings(props: AiSettingsProps) {
  const { subscriptionLabel: label, connection } = props;
  const [flow, setFlow] = useState<{ flowId: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = useFormAction(completeClaudeSignInAction);
  const signedIn = complete.result?.ok ? complete.result.data : connection;

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await startClaudeSignInAction();
      if (!result.ok) return setError(result.error);
      setFlow(result.data);
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });

  const cancel = () =>
    startTransition(async () => {
      if (flow) await cancelClaudeSignInAction(flow.flowId);
      setFlow(null);
    });

  const signOut = () =>
    startTransition(async () => {
      const result = await signOutOfClaudeAction();
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="space-y-4">
      {signedIn && !flow ? (
        <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">
            Signed in as <strong>{signedIn.email ?? "your account"}</strong>
            {signedIn.plan && <> · {signedIn.plan}</>} · since{" "}
            {new Date(signedIn.connectedAt).toLocaleDateString()}
          </p>
          <button type="button" className={buttonClasses} disabled={pending} onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Not signed in: requests use this computer&apos;s own {label} login.
        </p>
      )}

      {props.signInSupported && !flow && (
        <button type="button" className={buttonClasses} disabled={pending} onClick={start}>
          {signedIn ? `Sign in to ${label} again` : `Sign in with ${label}`}
        </button>
      )}

      {flow && (
        <form action={complete.formAction} className="space-y-3" aria-busy={complete.pending}>
          <p className="text-sm">
            A sign-in page opened in a new tab.{" "}
            <a href={flow.url} target="_blank" rel="noopener noreferrer" className="text-accent">
              Open it again
            </a>
            . Sign in with your own account, then paste the code it shows.
          </p>
          <input type="hidden" name="flowId" value={flow.flowId} />
          <Field id="sign-in-code" label="Paste the code shown after you sign in">
            <input
              id="sign-in-code"
              name="code"
              required
              maxLength={SECRET_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              className={inputClasses}
            />
          </Field>
          {complete.result && !complete.result.ok && <Alert>{complete.result.error}</Alert>}
          <div className="flex gap-2">
            <SubmitButton pendingLabel="Checking…">Finish signing in</SubmitButton>
            <button type="button" className={buttonClasses} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <Alert>{error}</Alert>}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">
          Paste a token from <code>claude setup-token</code> instead
        </summary>
        <div className="mt-3">
          <SecretHint kind="claude_oauth_token" hint={props.hints.claude_oauth_token} />
          <TokenForm />
        </div>
      </details>
    </div>
  );
}

function TokenForm() {
  const { result, formAction, pending } = useFormAction(saveClaudeTokenAction);
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  return (
    <form action={formAction} className="mt-2 space-y-3" aria-busy={pending}>
      <Field id="oauth-token" label="Token" error={fieldErrors?.token}>
        <input
          id="oauth-token"
          name="token"
          type="password"
          required
          maxLength={SECRET_MAX_LENGTH}
          autoComplete="off"
          className={inputClasses}
        />
      </Field>
      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}
      <SubmitButton pendingLabel="Saving…">Save token</SubmitButton>
    </form>
  );
}

function KeySettings(props: AiSettingsProps) {
  const initial = props.keyProviders.find((option) => option.id === props.currentProvider);
  const [provider, setProvider] = useState(initial?.id ?? props.keyProviders[0]?.id);
  const { result, formAction, pending } = useFormAction(updateAiSettingsAction);
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  const option = props.keyProviders.find((candidate) => candidate.id === provider);
  const kind = `api_key:${provider}`;

  return (
    <form action={formAction} className="space-y-4" aria-busy={pending}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="provider" label="Provider" error={fieldErrors?.provider}>
          <select
            id="provider"
            name="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as ProviderOption["id"])}
            className={inputClasses}
          >
            {props.keyProviders.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field id="model" label="Model (optional)" error={fieldErrors?.model}>
          <input
            id="model"
            name="model"
            maxLength={AI_MODEL_MAX_LENGTH}
            defaultValue={initial ? (props.model ?? "") : ""}
            placeholder={option?.defaultModel}
            spellCheck={false}
            className={inputClasses}
          />
        </Field>
      </div>
      <SecretHint kind={kind} hint={props.hints[kind]} />
      <Field
        id="api-key"
        label={props.hints[kind] ? "Replace key" : `Your ${option?.displayName ?? ""} key`}
        hint="Stored encrypted with your password. Leave empty to keep the saved key or use the server's."
        error={fieldErrors?.apiKey}
      >
        <input
          id="api-key"
          name="apiKey"
          type="password"
          maxLength={SECRET_MAX_LENGTH}
          autoComplete="off"
          className={inputClasses}
        />
      </Field>
      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}
      {result?.ok && <p className="text-sm text-muted">Saved. Your next request uses it.</p>}
      <SubmitButton pendingLabel="Checking and saving…">Save AI settings</SubmitButton>
    </form>
  );
}

function SecretHint({ kind, hint }: { kind: string; hint?: string }) {
  const [pending, startTransition] = useTransition();
  if (!hint) return null;
  return (
    <p className="flex items-center gap-3 text-sm">
      <span>
        Key ending <code>••••{hint}</code>
      </span>
      <button
        type="button"
        className={buttonClasses}
        disabled={pending}
        onClick={() => startTransition(() => removeSecretAction(kind).then(() => undefined))}
      >
        Remove
      </button>
    </p>
  );
}
