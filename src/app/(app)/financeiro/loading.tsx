export default function FinanceLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-64 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-44 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-3xl bg-muted" />
        <div className="h-28 animate-pulse rounded-3xl bg-muted" />
        <div className="h-28 animate-pulse rounded-3xl bg-muted" />
      </div>
    </div>
  );
}
