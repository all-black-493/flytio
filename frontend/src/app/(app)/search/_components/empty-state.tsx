import { PlaneTakeoff } from "lucide-react";

export function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <PlaneTakeoff className="size-8 text-muted-foreground" />
      <h1 className="text-xl font-bold">Search for a flight</h1>
      <p className="text-sm text-muted-foreground">
        Enter where you&apos;re flying from and to, and a departure date, to see live fares.
      </p>
    </div>
  );
}
