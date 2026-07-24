export function NoResultsState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-xl font-bold">No flights found</h1>
      <p className="text-sm text-muted-foreground">
        Nothing matched that route and date. Try a different date or a nearby airport.
      </p>
    </div>
  );
}
