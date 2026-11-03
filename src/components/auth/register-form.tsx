"use client";

import Link from "next/link";

import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  TARGET_ROLE_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/domain/input-schemas";
import { EXPERIENCE_LEVEL_LABELS, EXPERIENCE_LEVELS } from "@/domain/profile";
import { registerAction } from "@/server/actions/auth-actions";

import { Field, inputClasses } from "./field";
import { InterestPicker } from "./interest-picker";

export function RegisterForm() {
  const { result, values, formAction, pending } = useFormAction(registerAction);
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="first-name" label="First name" error={fieldErrors?.firstName}>
          <input
            id="first-name"
            name="firstName"
            required
            maxLength={NAME_MAX_LENGTH}
            defaultValue={values.firstName}
            autoComplete="given-name"
            className={inputClasses}
          />
        </Field>
        <Field id="last-name" label="Last name" error={fieldErrors?.lastName}>
          <input
            id="last-name"
            name="lastName"
            required
            maxLength={NAME_MAX_LENGTH}
            defaultValue={values.lastName}
            autoComplete="family-name"
            className={inputClasses}
          />
        </Field>
      </div>

      <Field
        id="username"
        label="Username"
        hint={`${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, digits, dots, dashes or underscores.`}
        error={fieldErrors?.username}
      >
        <input
          id="username"
          name="username"
          required
          minLength={USERNAME_MIN_LENGTH}
          maxLength={USERNAME_MAX_LENGTH}
          pattern="[a-zA-Z0-9_.\-]+"
          defaultValue={values.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={inputClasses}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="password"
          label="Password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fieldErrors?.password}
        >
          <input
            id="password"
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="target-role"
          label={
            <>
              Target role <span className="font-normal text-muted">(optional)</span>
            </>
          }
          error={fieldErrors?.targetRole}
        >
          <input
            id="target-role"
            name="targetRole"
            maxLength={TARGET_ROLE_MAX_LENGTH}
            defaultValue={values.targetRole}
            placeholder="e.g. Senior backend engineer"
            className={inputClasses}
          />
        </Field>
        <Field id="experience-level" label="Experience" error={fieldErrors?.experienceLevel}>
          <select
            id="experience-level"
            name="experienceLevel"
            required
            defaultValue={values.experienceLevel ?? ""}
            className={inputClasses}
          >
            <option value="" disabled>
              Choose…
            </option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EXPERIENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <InterestPicker error={fieldErrors?.interests} />

      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}

      <SubmitButton pendingLabel="Creating your profile…" className="w-full">
        Create profile
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have a profile?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
