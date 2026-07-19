'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-line bg-card p-10 text-center">
        {/* graph-node motif */}
        <div className="mb-6 flex justify-center">
          <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
            <line x1="60" y1="32" x2="28" y2="18" stroke="var(--line)" strokeWidth="1" />
            <line x1="60" y1="32" x2="94" y2="20" stroke="var(--line)" strokeWidth="1" />
            <line x1="60" y1="32" x2="40" y2="56" stroke="var(--fg3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="28" cy="18" r="5" fill="var(--rowhover)" stroke="var(--fg3)" strokeWidth="1" />
            <circle cx="94" cy="20" r="5" fill="var(--rowhover)" stroke="var(--fg3)" strokeWidth="1" />
            <circle cx="40" cy="56" r="4" fill="var(--rowhover)" stroke="var(--fg3)" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx="60" cy="32" r="9" fill="var(--acc)" stroke="#a5b4fc" strokeWidth="1.4" />
          </svg>
        </div>
        <div className="text-5xl font-bold tracking-tight text-fg">404</div>
        <div className="mt-2 text-lg font-semibold text-fg">
          This node isn&apos;t in the graph
        </div>
        <p className="mx-auto mt-2 max-w-[340px] text-sm leading-relaxed text-fg3">
          The document you&apos;re looking for was moved, renamed, or never
          existed. Its backlinks may need updating.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href="/dashboard">Back to dashboard</Button>
          <Button href="/search" variant="secondary">
            Search docs
          </Button>
        </div>
        {pathname && (
          <div className="mt-7 font-mono text-[11.5px] text-muted">
            {pathname}
          </div>
        )}
      </div>
    </main>
  );
}
