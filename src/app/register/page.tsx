import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { Card } from "@/components/ui/card";
import { getCurrentProfile } from "@/server/session";

export const metadata: Metadata = { title: "Create a profile" };

export default async function RegisterPage() {
  if (await getCurrentProfile()) redirect("/");

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Create your profile</h1>
        <p className="text-sm text-muted">
          Your topics, quizzes and progress are kept separate from every other profile on this
          machine.
        </p>
      </div>
      <RegisterForm />
    </Card>
  );
}
