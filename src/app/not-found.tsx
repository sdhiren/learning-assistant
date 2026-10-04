import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted">
        This topic, concept or quiz doesn’t exist. It may have been deleted.
      </p>
      <Link href="/" className={buttonClasses("primary")}>
        Back to your topics
      </Link>
    </div>
  );
}
