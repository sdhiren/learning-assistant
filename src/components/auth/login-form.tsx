"use client";

import Link from "next/link";
import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/domain/input-schemas";
import { loginAction, setInitialPasswordAction } from "@/server/actions/auth-actions";

import { Field, inputClasses } from "./field";

/**
 * Sign in. A profile with no password yet (data from before profiles) is
 * asked to set one instead, once.
 */
export function LoginForm({ next }: { next: string }) {
  const login = useFormAction(loginAction);
  const setPassword = useFormAction(setInitialPasswordAction);
  // The name submitted in the step before "Set your password".
  const username = login.values.username?.trim() ?? "";

  const needsPassword = login.result?.ok === true && login.result.data === "set-password";

  if (needsPassword) {
    const fieldErrors =
      setPassword.result && !setPassword.result.ok ? setPassword.result.fieldErrors : undefined;
    return (
      <form action={setPassword.formAction} className="space-y-4" aria-busy={setPassword.pending}>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Set your password</h2>
          <p className="text-sm text-muted">
            Profile <strong className="text-ink">{username}</strong> has no password yet. Choose one
            now; you&apos;ll use it to sign in from now on.
          </p>
        </div>
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="next" value={next} />
        <Field id="new-password" label="New password" error={fieldErrors?.password}>
          <input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            className={inputClasses}
          />
        </Field>
        <Field id="confirm-password" label="Confirm password" error={fieldErrors?.confirmPassword}>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            className={inputClasses}
          />
        </Field>
        {setPassword.result && !setPassword.result.ok && !fieldErrors && (
          <Alert>{setPassword.result.error}</Alert>
        )}
        <SubmitButton pendingLabel="Saving…" className="w-full">
          Set password and sign in
        </SubmitButton>
      </form>
    );
  }

  const fieldErrors = login.result && !login.result.ok ? login.result.fieldErrors : undefined;
  return (
    <form action={login.formAction} className="space-y-4" aria-busy={login.pending}>
      <input type="hidden" name="next" value={next} />
      <Field id="username" label="Username" error={fieldErrors?.username}>
        <input
          id="username"
          name="username"
          required
          defaultValue={login.values.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={inputClasses}
        />
      </Field>
      <Field id="password" label="Password" error={fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="current-password"
          className={inputClasses}
        />
      </Field>
      {login.result && !login.result.ok && !fieldErrors && <Alert>{login.result.error}</Alert>}
      <SubmitButton pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create a profile
        </Link>
      </p>
    </form>
  );
}
