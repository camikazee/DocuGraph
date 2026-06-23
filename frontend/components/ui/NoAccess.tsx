import Link from 'next/link';

/** Stan 403 — brak dostępu do dokumentu/workspace. */
export function NoAccess({ backHref = '/dashboard' }: { backHref?: string }) {
  return (
    <div className="grid place-items-center py-16">
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-card p-10 text-center">
        <div className="mb-5 flex justify-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-capbg">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="6.5" rx="1.3" stroke="var(--fg3)" strokeWidth="1.3" />
              <path d="M5 7V5.2a3 3 0 0 1 6 0V7" stroke="var(--fg3)" strokeWidth="1.3" />
              <circle cx="8" cy="10" r="1" fill="var(--fg3)" />
            </svg>
          </span>
        </div>
        <div className="text-lg font-semibold text-fg">
          You don&apos;t have access
        </div>
        <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-fg3">
          This document lives in a workspace you&apos;re not a member of. Ask an
          owner for access, or switch to a workspace you belong to.
        </p>
        <Link
          href={backHref}
          className="mt-6 inline-block text-sm font-medium text-accfg"
        >
          ← Back to my workspace
        </Link>
      </div>
    </div>
  );
}
