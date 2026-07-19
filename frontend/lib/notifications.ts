export interface AppNotification {
  id: string;
  filePath: string;
  title: string;
  kind: string;
  actor: string;
  read: boolean;
  createdAt: string;
}

/** Czasownik zdarzenia wg rodzaju (np. „moved" vs domyślne „updated"). */
export function verbFor(kind: string): string {
  if (kind === 'moved') return 'moved';
  if (kind === 'comment') return 'commented on';
  if (kind === 'mention') return 'mentioned you in';
  if (kind === 'deleted') return 'deleted';
  if (kind === 'review') return 'reviewed';
  return 'updated';
}

/** Zwięzły „ile temu" (just now / Nm / Nh / Nd) dla znacznika czasu ISO. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
