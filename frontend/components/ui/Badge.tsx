import { cn } from '@/lib/cn';

export type BadgeTone = 'brand' | 'success' | 'neutral';

const tones: Record<BadgeTone, string> = {
  brand: 'bg-accsoft text-accfg',
  success: 'bg-emerald-500/15 text-emerald-300',
  neutral: 'bg-line text-fg3',
};

/** Mały pill — np. rola w workspace. */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
