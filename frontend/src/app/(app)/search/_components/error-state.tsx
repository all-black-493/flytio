export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-xl font-bold">Couldn&apos;t load flights</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
