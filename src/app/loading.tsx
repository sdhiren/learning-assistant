import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-24 text-muted">
      <Spinner />
      Loading…
    </div>
  );
}
