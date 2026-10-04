import "server-only";

import { notFound } from "next/navigation";

import { NotFoundError } from "@/lib/errors";

/** Loads page data, rendering the 404 page when the record doesn't exist. */
export function orNotFound<T>(load: () => T): T {
  try {
    return load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
