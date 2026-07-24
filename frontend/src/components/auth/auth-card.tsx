import { Card, CardContent } from "@/components/ui/card";

export interface AuthCardProps {
  /** Left board-strip label, e.g. "CHECK-IN". */
  strip: string;
  /** Right board-strip label, e.g. "GATE 01". */
  gate: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** Shared boarding-pass shell for the auth pages: dark board strip on top,
 * form in the body, dashed "perforation" above the footer link. */
export function AuthCard({ strip, gate, title, subtitle, children, footer }: AuthCardProps) {
  return (
    <Card className="w-full max-w-sm gap-0 overflow-hidden py-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">{strip}</span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">{gate}</span>
      </div>
      <CardContent className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        {children}
        <p className="mt-5 border-t border-dashed pt-4 text-sm text-muted-foreground">{footer}</p>
      </CardContent>
    </Card>
  );
}
