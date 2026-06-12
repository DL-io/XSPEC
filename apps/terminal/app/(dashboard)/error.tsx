'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="systemError"> {/* HARDENED: top-level app error boundary prevents blank failure screens. */}
      <div className="systemErrorPanel">
        <span className="systemErrorLabel">SYSTEM ERROR</span>
        <h1>Terminal fault intercepted</h1>
        <p>{error.message || 'An unexpected terminal error occurred.'}</p>
        <div className="systemErrorMeta">Timestamp: {new Date().toISOString()}</div>
        <div className="systemErrorActions">
          <button onClick={reset}>Retry</button>
          <Link href="/">Return to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
