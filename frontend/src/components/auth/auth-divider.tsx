/** "or continue with"-style rule, shared between LoginForm and
 * RegisterForm so the divider styling isn't duplicated. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
