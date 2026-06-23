import { cn } from '@/lib/cn';

/** Panel z obramowaniem i tłem — bazowy kontener treści. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-line bg-card p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
