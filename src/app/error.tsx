"use client";

import { Button } from "@/components/ui/button";

/** Shown when a page fails to render. Details stay in the server logs. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">
        The page couldn’t be loaded. Check the terminal running the app for details, then try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
