'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** Pozycja nawigacji w sidebarze: ikona + etykieta + stan aktywny. */
export function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] transition',
        active
          ? 'bg-accsoft font-semibold text-fg shadow-[inset_2px_0_0_var(--acc)]'
          : 'font-medium text-fg2 hover:bg-rowhover',
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d={icon}
          stroke={active ? 'var(--accfg)' : 'var(--fg3)'}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </Link>
  );
}
