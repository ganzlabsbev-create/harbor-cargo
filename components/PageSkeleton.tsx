import Header from "./Header";

/**
 * Instant-loading placeholder shown while a page's JS + first data request
 * are still in flight (see the loading.tsx next to each data-fetching
 * route). Without this, Next.js has nothing to paint during that gap, so
 * the previous screen just sits frozen after a tap — which is what read as
 * "the app hangs for a second or two" even though nothing was actually
 * stuck, just invisible. This doesn't make the fetch itself faster, but it
 * gives immediate feedback that the tap registered.
 */
export default function PageSkeleton() {
  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <div className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-2xl border border-base-border bg-base-surface" />
          <div className="h-14 animate-pulse rounded-2xl border border-base-border bg-base-surface" />
          <div className="h-14 animate-pulse rounded-2xl border border-base-border bg-base-surface" />
        </div>
      </div>
    </main>
  );
}
