'use client';

export default function RoomError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-page)', padding: '2rem' }}>
      <div className="w-full max-w-md border border-[var(--border)] bg-white p-10 text-center">
        <h2 className="font-serif italic text-2xl mb-4">Table unavailable</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-light)' }}>
          Something went wrong loading this room.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="border border-[var(--border)] px-6 py-2.5 text-sm font-sans hover:shadow-[2px_2px_0_var(--ink)] transition-all"
          >
            Try again
          </button>
          <a
            href="/"
            className="border border-[var(--border)] bg-[var(--ink)] text-[var(--bg-page)] px-6 py-2.5 text-sm font-sans hover:opacity-90 transition-opacity"
          >
            Back to lobby
          </a>
        </div>
      </div>
    </div>
  );
}
