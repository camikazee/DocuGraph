'use client';

import { Theme, useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/cn';

const OPTIONS: { value: Theme; label: string; dot: string }[] = [
  { value: 'light', label: 'Light', dot: 'bg-white ring-1 ring-black/10' },
  { value: 'grey', label: 'Grey', dot: 'bg-zinc-400' },
  { value: 'violet', label: 'Violet', dot: 'bg-violet-500' },
];

/** Przełącznik motywu Light / Grey / Violet (jak w makietach). */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-1 rounded-[9px] border border-line bg-card p-[3px]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition',
            theme === o.value
              ? 'bg-acc text-white'
              : 'text-fg3 hover:text-fg2',
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', o.dot)} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
