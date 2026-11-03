"use server";

import { refresh } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { generateReadingInput } from "@/domain/input-schemas";
import { getProfileServices } from "@/server/session";

import { runAction } from "./run-action";

export async function generateReadingAction(input: {
  topicId: string;
  conceptId: string;
  instructions?: string;
}): Promise<ActionResult> {
  const services = await getProfileServices();
  const result = await runAction("generateReading", async () => {
    await services.readings.generateReading(generateReadingInput.parse(input));
    return undefined;
  });

  if (result.ok) refresh();
  return result;
}
