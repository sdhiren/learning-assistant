"use server";

import { refresh } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { id } from "@/domain/input-schemas";
import { getServices } from "@/server/container";

import { runAction } from "./run-action";

export async function generateReadingAction(
  topicId: string,
  conceptId: string,
): Promise<ActionResult> {
  const result = await runAction("generateReading", async () => {
    await getServices().readings.generateReading(id.parse(topicId), id.parse(conceptId));
    return undefined;
  });

  if (result.ok) refresh();
  return result;
}
