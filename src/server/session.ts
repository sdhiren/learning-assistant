import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE, SESSION_IDLE_MS } from "@/server/auth/session-token";
import { getAuth, getContainer, type Services } from "@/server/container";
import type { ProfileRow } from "@/server/db/app-schema";
import type { ResolvedSession } from "@/server/services/auth-service";

/** Where a request with no valid session is sent. */
export const LOGIN_PATH = "/login";

/**
 * The signed-in session of this request, resolved once per request from the
 * `la_session` cookie. Null when there is no cookie or it is unknown or expired.
 */
export const getCurrentSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getAuth().resolveSession(token) : null;
});

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  return (await getCurrentSession())?.profile ?? null;
}

/**
 * The signed-in profile, or a redirect to /login. Every page and server
 * action (other than sign-in and registration) must go through this: the
 * proxy's redirect is only an optimistic check of whether a cookie exists.
 */
export async function requireSession(): Promise<ResolvedSession> {
  const session = await getCurrentSession();
  if (!session) redirect(LOGIN_PATH);
  return session;
}

export async function requireProfile(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(LOGIN_PATH);
  return profile;
}

/**
 * The current profile's services. Call this at the start of a page or action:
 * the services are bound to that profile, so a long AI call still writes to
 * the profile that started it.
 */
export async function getProfileServices(): Promise<Services> {
  const session = await requireSession();
  return getContainer().servicesFor(session.profile, session.dek);
}

/** Sets the session cookie. Only callable from server actions and route handlers. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_IDLE_MS / 1000,
    // `secure` stays unset: the app is served over plain http on loopback.
  });
}

/** Deletes this browser's session from the registry and clears its cookie. */
export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) getAuth().logout(token);
  cookieStore.delete(SESSION_COOKIE);
}
