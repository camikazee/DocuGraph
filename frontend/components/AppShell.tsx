'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { LogoMark } from '@/components/ui/Logo';
import { SidebarLink } from '@/components/ui/SidebarLink';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { CommandPalette, openCommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M2 6.5L8 2l6 4.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z' },
  { href: '/documents', label: 'Documents', icon: 'M5 2.5h4l2.5 2.5V13a.5.5 0 0 1-.5.5H5A.5.5 0 0 1 4.5 13V3a.5.5 0 0 1 .5-.5Z' },
  { href: '/media', label: 'Media', icon: 'M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1ZM3 11l3-3 2 2 3-3 3 3' },
  { href: '/graph', label: 'Graph', icon: 'M5.5 6l5 4M4 5.5a2 2 0 1 0 0-.1M12 4.5a1.5 1.5 0 1 0 0-.1M11 12a1.5 1.5 0 1 0 0-.1' },
  { href: '/team', label: 'Team', icon: 'M6 8a2.3 2.3 0 1 0 0-4.6A2.3 2.3 0 0 0 6 8ZM1.5 13c0-2.2 2-3.5 4.5-3.5M10.6 8a2 2 0 1 0 0-4M14 13c0-1.8-1.2-3-3-3.3' },
  { href: '/connect', label: 'Connect', icon: 'M5 4v8M5 5.5a1.6 1.6 0 1 0 0-.1M5 11a1.6 1.6 0 1 0 0-.1M11 7a1.6 1.6 0 1 0 0-.1M11 7.2v.8a2.5 2.5 0 0 1-2.5 2.5H5' },
  { href: '/stats', label: 'Statistics', icon: 'M3 13V8M8 13V4M13 13V10' },
  { href: '/account', label: 'Account', icon: 'M8 8a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 8 8ZM3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg2">
      <aside className="flex w-[222px] flex-none flex-col border-r border-line bg-panel px-3 py-[18px]">
        <Link
          href="/dashboard"
          aria-label="DocuGraph home"
          className="-mx-1 mb-5 flex items-center gap-2.5 rounded-lg px-3 py-1 transition hover:bg-rowhover"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-acc to-blue-500">
            <LogoMark className="h-4 w-4 text-white" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-fg">
            DocuGraph
          </span>
        </Link>
        <button
          onClick={openCommandPalette}
          className="mb-3 flex items-center gap-2.5 rounded-[9px] border border-line bg-card px-3 py-2 text-left text-[13px] text-fg3 transition hover:border-acc"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
            <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="flex-1">Search…</span>
          <kbd className="rounded border border-capbd bg-capbg px-1.5 py-px font-mono text-[10px] font-semibold text-fg3">
            ⌘K
          </kbd>
        </button>
        <div className="mb-3">
          <NotificationBell />
        </div>
        <div className="px-2.5 pb-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">
          Workspace
        </div>
        <nav className="grid gap-0.5">
          {NAV.map((n) => (
            <SidebarLink key={n.href} {...n} />
          ))}
        </nav>

        <div className="mt-auto grid gap-3 px-1 pt-4">
          <ThemeSwitcher />
          <button
            onClick={logout}
            className="rounded-[9px] border border-line px-3 py-2 text-sm text-fg2 transition hover:bg-rowhover"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-11 py-9">{children}</div>
      </main>

      <CommandPalette />
    </div>
  );
}
