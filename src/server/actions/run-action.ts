import "server-only";

import { z } from "zod";

import { failure, success, type ActionResult } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { logger } from "@/server/logger";

const UNEXPECTED_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Runs a server action body and converts failures into an ActionResult:
 * validation errors become field errors, AppErrors keep their (safe)
 * messages, and anything else is logged and replaced with a generic message.
 */
export async function runAction<T>(
  name: string,
  body: () => Promise<T> | T,
): Promise<ActionResult<T>> {
  try {
    return success(await body());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure("Please fix the highlighted fields.", toFieldErrors(error));
    }
    if (error instanceof AppError) {
      return failure(error.message);
    }
    logger.error(`Action "${name}" failed`, error);
    return failure(UNEXPECTED_ERROR_MESSAGE);
  }
}

function toFieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const fieldErrors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}
