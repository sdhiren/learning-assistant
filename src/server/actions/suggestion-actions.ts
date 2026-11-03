"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createTopicInput, dismissSuggestionInput } from "@/domain/input-schemas";
import type { ActionResult } from "@/lib/action-result";
import type { TopicSuggestionsView } from "@/server/services/view-models";
import { getProfileServices, requireProfile } from "@/server/session";

import { runAction } from "./run-action";

/** Replaces the catalog suggestions with AI ones based on the profile's details. */
export async function personaliseSuggestionsAction(): Promise<ActionResult<TopicSuggestionsView>> {
  const profile = await requireProfile();
  const services = await getProfileServices();
  const result = await runAction("personaliseSuggestions", () =>
    services.suggestions.refresh({
      interests: profile.interests,
      targetRole: profile.targetRole,
      experienceLevel: profile.experienceLevel,
    }),
  );
  if (result.ok) revalidatePath("/");
  return result;
}

/** Starts a suggested topic through the normal create-topic flow. */
export async function createTopicFromSuggestionAction(suggestion: {
  name: string;
  goal: string;
}): Promise<ActionResult<string>> {
  const services = await getProfileServices();
  const result = await runAction("createTopicFromSuggestion", () =>
    services.topics.createTopic(createTopicInput.parse(suggestion)),
  );

  if (!result.ok) return result;
  revalidatePath("/");
  redirect(`/topics/${result.data}`);
}

export async function dismissSuggestionAction(name: string): Promise<ActionResult> {
  const services = await getProfileServices();
  const result = await runAction("dismissSuggestion", () => {
    services.suggestions.dismiss(dismissSuggestionInput.parse({ name }).name);
    return undefined;
  });
  if (result.ok) revalidatePath("/");
  return result;
}
