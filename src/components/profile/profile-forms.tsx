"use client";

import { Field, inputClasses } from "@/components/auth/field";
import { InterestPicker } from "@/components/auth/interest-picker";
import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  TARGET_ROLE_MAX_LENGTH,
} from "@/domain/input-schemas";
import { EXPERIENCE_LEVEL_LABELS, EXPERIENCE_LEVELS, type ExperienceLevel } from "@/domain/profile";
import { changePasswordAction, updateProfileAction } from "@/server/actions/profile-actions";

export interface ProfileDetails {
  firstName: string;
  lastName: string;
  targetRole: string;
  experienceLevel: ExperienceLevel | null;
  interests: string[];
}

export function ProfileDetailsForm({ details }: { details: ProfileDetails }) {
  const { result, formAction, pending } = useFormAction(updateProfileAction);
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
            defaultValue={details.firstName}
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
            defaultValue={details.lastName}
            autoComplete="family-name"
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="target-role" label="Target role" error={fieldErrors?.targetRole}>
          <input
            id="target-role"
            name="targetRole"
            maxLength={TARGET_ROLE_MAX_LENGTH}
            defaultValue={details.targetRole}
            className={inputClasses}
          />
        </Field>
        <Field id="experience-level" label="Experience" error={fieldErrors?.experienceLevel}>
          <select
            id="experience-level"
            name="experienceLevel"
            required
            defaultValue={details.experienceLevel ?? ""}
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
      <InterestPicker initial={details.interests} error={fieldErrors?.interests} />
      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}
      {result?.ok && <p className="text-sm text-muted">Saved.</p>}
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const { result, formAction, pending } = useFormAction(changePasswordAction);
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" aria-busy={pending}>
      <Field id="current-password" label="Current password" error={fieldErrors?.currentPassword}>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="current-password"
          className={inputClasses}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="new-password"
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fieldErrors?.password}
        >
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
        <Field id="confirm-password" label="Confirm" error={fieldErrors?.confirmPassword}>
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
      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}
      {result?.ok && (
        <p className="text-sm text-muted">
          Password changed. Other devices were signed out; your saved keys were kept.
        </p>
      )}
      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}
