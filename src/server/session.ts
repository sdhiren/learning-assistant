import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { getContainer, getRegistry, type Services } from "@/server/container";
import type { ProfileRow } from "@/server/db/app-schema";
import { ProfileRepository } from "@/server/repositories/profile-repository";

/** Where a request with no profile is sent. */
export const NO_PROFILE_PATH = "/no-profile";

/**
 * The profile this request acts as, resolved once per request.
 * Until sign-in exists, this is the single registered profile.
 */
export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  return new ProfileRepository(getRegistry()).list()[0] ?? null;
});

/** The current profile, or a redirect when there is none. */
export async function requireProfile(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(NO_PROFILE_PATH);
  return profile;
}

/**
 * The current profile's services. Call this at the start of a page or action:
 * the services are bound to that profile, so a long AI call still writes to
 * the profile that started it.
 */
export async function getProfileServices(): Promise<Services> {
  return getContainer().servicesFor(await requireProfile());
}
