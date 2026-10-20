"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addSubtopicInput, deleteSubtopicInput } from "@/domain/input-schemas";
import type { ActionResult } from "@/lib/action-result";
import { getServices } from "@/server/container";

import { runAction } from "./run-action";

export async function addSubtopicAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  let topicId = "";
  const result = await runAction("addSubtopic", () => {
    const input = addSubtopicInput.parse({
      topicId: formData.get("topicId"),
      name: formData.get("name"),
      notes: formData.get("notes") ?? undefined,
    });
    topicId = input.topicId;
    return getServices().subtopics.addSubtopic(input);
  });

  if (!result.ok) return result;
  redirect(`/topics/${topicId}/subtopics/${result.data}`);
}

export async function deleteSubtopicAction(input: {
  topicId: string;
  subtopicId: string;
}): Promise<ActionResult> {
  let topicId = "";
  const result = await runAction("deleteSubtopic", () => {
    const parsed = deleteSubtopicInput.parse(input);
    topicId = parsed.topicId;
    getServices().subtopics.deleteSubtopic(parsed.topicId, parsed.subtopicId);
    return undefined;
  });

  if (!result.ok) return result;
  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}`);
}
