/** Znak marki DocuGraph (graf: 3 węzły + krawędzie) + wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <line x1="11" y1="13" x2="29" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="11" y1="13" x2="26" y2="30" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="29" y1="10" x2="26" y2="30" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="11" cy="13" r="5.5" fill="currentColor" />
      <circle cx="29" cy="10" r="4" fill="currentColor" opacity="0.55" />
      <circle cx="26" cy="30" r="4" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark className="h-7 w-7 text-brand" />
      {withWordmark && (
        <span className="text-lg font-semibold tracking-tight text-slate-100">
          DocuGraph
        </span>
      )}
    </div>
  );
}
