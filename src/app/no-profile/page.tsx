import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "No profile yet" };

/** Shown on a fresh install until registration exists. */
export default function NoProfilePage() {
  return (
    <Card className="mx-auto max-w-lg space-y-2 p-6">
      <h1 className="text-xl font-semibold">No profile yet</h1>
      <p className="text-muted">
        This installation has no profiles yet. Registering a new profile arrives in the next update.
      </p>
    </Card>
  );
}
