"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { createTopicInput, id } from "@/domain/input-schemas";
import { getServices } from "@/server/container";

import { runAction } from "./run-action";

export async function createTopicAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const result = await runAction("createTopic", () => {
    const input = createTopicInput.parse({
      name: formData.get("name"),
      goal: formData.get("goal") ?? undefined,
    });
    return getServices().topics.createTopic(input);
  });

  if (!result.ok) return result;
  revalidatePath("/");
  redirect(`/topics/${result.data}`);
}

export async function deleteTopicAction(topicId: string): Promise<ActionResult> {
  const result = await runAction("deleteTopic", () => {
    getServices().topics.deleteTopic(id.parse(topicId));
    return undefined;
  });

  if (!result.ok) return result;
  revalidatePath("/");
  redirect("/");
}
