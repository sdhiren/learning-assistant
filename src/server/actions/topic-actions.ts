"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { createTopicInput, id } from "@/domain/input-schemas";
import { getProfileServices } from "@/server/session";

import { runAction } from "./run-action";

export async function createTopicAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const services = await getProfileServices();
  const result = await runAction("createTopic", () => {
    const input = createTopicInput.parse({
      name: formData.get("name"),
      goal: formData.get("goal") ?? undefined,
    });
    return services.topics.createTopic(input);
  });

  if (!result.ok) return result;
  revalidatePath("/");
  redirect(`/topics/${result.data}`);
}

export async function deleteTopicAction(topicId: string): Promise<ActionResult> {
  const services = await getProfileServices();
  const result = await runAction("deleteTopic", () => {
    services.topics.deleteTopic(id.parse(topicId));
    return undefined;
  });

  if (!result.ok) return result;
  revalidatePath("/");
  redirect("/");
}
