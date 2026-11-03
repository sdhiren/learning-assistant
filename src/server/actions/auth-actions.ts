"use server";

import { redirect } from "next/navigation";

import { success, type ActionResult } from "@/lib/action-result";
import {
  loginInput,
  registerInput,
  safeNextPath,
  setInitialPasswordInput,
} from "@/domain/input-schemas";
import { getAuth } from "@/server/container";
import { endSession, LOGIN_PATH, setSessionCookie } from "@/server/session";

import { runAction } from "./run-action";

/** What the sign-in form should show next. */
export type LoginStep = "set-password";

/**
 * Signs in. A profile that has no password yet (the upgraded `sdhiren`)
 * returns "set-password" so the form can ask for one.
 */
export async function loginAction(
  _previous: ActionResult<LoginStep> | null,
  formData: FormData,
): Promise<ActionResult<LoginStep>> {
  const result = await runAction("login", async () => {
    const outcome = await getAuth().login(
      loginInput.parse({
        username: formData.get("username") ?? "",
        password: formData.get("password") ?? "",
      }),
    );
    if (outcome.kind === "set-password") return outcome.kind;
    await setSessionCookie(outcome.signedIn.token);
    return null;
  });

  if (!result.ok) return result;
  if (result.data) return success(result.data);
  redirect(safeNextPath(formData.get("next")));
}

export async function setInitialPasswordAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction("setInitialPassword", async () => {
    const signedIn = await getAuth().setInitialPassword(
      setInitialPasswordInput.parse({
        username: formData.get("username") ?? "",
        password: formData.get("password") ?? "",
        confirmPassword: formData.get("confirmPassword") ?? "",
      }),
    );
    await setSessionCookie(signedIn.token);
    return undefined;
  });

  if (!result.ok) return result;
  redirect(safeNextPath(formData.get("next")));
}

export async function registerAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction("register", async () => {
    const signedIn = await getAuth().register(
      registerInput.parse({
        username: formData.get("username") ?? "",
        password: formData.get("password") ?? "",
        confirmPassword: formData.get("confirmPassword") ?? "",
        firstName: formData.get("firstName") ?? "",
        lastName: formData.get("lastName") ?? "",
        targetRole: formData.get("targetRole") ?? "",
        experienceLevel: formData.get("experienceLevel") ?? undefined,
        interests: formData.getAll("interests"),
      }),
    );
    await setSessionCookie(signedIn.token);
    return undefined;
  });

  if (!result.ok) return result;
  redirect("/");
}

/** Deletes this browser's session and its cookie. */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
