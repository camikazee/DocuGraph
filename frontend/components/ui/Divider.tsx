/** Pozioma linia, opcjonalnie z etykietą pośrodku. */
export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <span className="block h-px bg-edge" />;
  }
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="h-px flex-1 bg-edge" />
      {label}
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}
