"use client";

// In a production build Next.js replaces the message of a server-side error with a generic one and
// provides a digest instead, so only show the message when it is the real one.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md py-16 text-center">
      <p className="text-destructive text-sm">
        {error.digest ? "Something went wrong while loading this page." : error.message}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Check QRATI_API_KEY / QRATI_BASE_URL in .env.local — this demo needs a real Qrati API key to call live endpoints.
      </p>
      <button onClick={reset} className="btn-outline mt-4 px-3 py-1.5">
        Retry
      </button>
    </div>
  );
}
