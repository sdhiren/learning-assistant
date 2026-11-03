import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/domain/input-schemas";
import { getCurrentProfile } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentProfile()) redirect(next);

  return (
    <Card className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Pick up where you left off.</p>
      </div>
      <LoginForm next={next} />
    </Card>
  );
}
