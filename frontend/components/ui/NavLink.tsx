'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** Link nawigacyjny z automatycznym podświetleniem aktywnej trasy. */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm transition',
        active
          ? 'bg-white/[0.06] text-slate-100'
          : 'text-slate-400 hover:text-slate-200',
      )}
    >
      {children}
    </Link>
  );
}
