/**
 * Shared skeleton primitives for loading states.
 * Accessible via aria-busy and aria-live regions.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading content" className="space-y-4">
      <div className="beyu-panel p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="beyu-panel p-5"><Skeleton className="h-24 w-full" /></div>
        <div className="beyu-panel p-5"><Skeleton className="h-24 w-full" /></div>
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading form" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading table" className="beyu-panel overflow-hidden">
      <div className="border-b p-3"><Skeleton className="h-4 w-24" /></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b p-3 last:border-0">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
