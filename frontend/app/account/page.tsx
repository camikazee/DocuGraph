'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { useWatching } from '@/lib/useWatching';

interface DocItem {
  filePath: string;
  title: string;
  updatedAt: string;
  status: string | null;
  updatedBy: string | null;
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function Avatar({
  url,
  name,
  className,
  fontSize,
}: {
  url: string | null;
  name: string;
  className: string;
  fontSize: string;
}) {
  if (url) {
    return (
      <div
        className={cn('flex-none bg-cover bg-center', className)}
        style={{ backgroundImage: `url(${url})` }}
        role="img"
        aria-label={name}
      />
    );
  }
  return (
    <div
      className={cn(
        'grid flex-none place-items-center bg-gradient-to-br from-acc to-blue-500 font-bold text-white',
        className,
      )}
      style={{ fontSize }}
    >
      {initials(name)}
    </div>
  );
}

/** Wczytuje obrazek, skaluje do max 256px i zwraca JPEG data URL (mały payload). */
async function fileToAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('decode failed'));
    i.src = dataUrl;
  });
  const max = 256;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function statusDot(status: string | null): string {
  if (status === 'draft') return '#f59e0b';
  if (status === 'review') return 'var(--acc)';
  if (status === 'archived') return 'var(--fg3)';
  return '#10b981';
}

export default function AccountPage() {
  const { profile, error, reload } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  const ws = profile?.workspaces[0]?.id;
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [tab, setTab] = useState<'watching' | 'docs' | 'settings'>('watching');
  const { watching, toggle } = useWatching(ws);

  // Edit-profile modal
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUser, setDraftUser] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const unwatch = (fp: string) => toggle(fp, false);

  const load = useCallback(async () => {
    if (!ws) return;
    const list = await apiFetch<DocItem[]>(`/workspaces/${ws}/documents`);
    setDocs(list);
  }, [ws]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit() {
    if (!profile) return;
    setDraftName(profile.user.name);
    setDraftUser(profile.user.username ?? '');
    setDraftBio(profile.user.bio ?? '');
    setDraftAvatar(profile.user.avatarUrl);
    setEditing(true);
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast('Avatar must be a PNG or JPG image', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('Avatar must be 2 MB or smaller', 'error');
      return;
    }
    try {
      setDraftAvatar(await fileToAvatar(file));
    } catch {
      toast('Could not read that image', 'error');
    }
  }

  async function saveProfile() {
    if (!profile || !draftName.trim()) {
      toast('Display name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        name: draftName.trim(),
        username: draftUser.replace(/^@/, '').trim(),
        bio: draftBio,
      };
      if (draftAvatar && draftAvatar !== profile.user.avatarUrl) {
        body.avatarUrl = draftAvatar;
      }
      await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(body) });
      toast('Profile updated', 'success');
      reload();
      setEditing(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center text-fg2">
        {error}
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center text-fg3">
        Loading…
      </main>
    );
  }

  const role = profile.workspaces[0]?.role ?? 'member';
  const myDocs = docs.filter((d) => d.updatedBy === profile.user.id);
  const watchedDocs = watching
    .map((p) => docs.find((d) => d.filePath === p))
    .filter((d): d is DocItem => !!d);
  const stats = [
    { value: String(myDocs.length), label: 'Edited by you' },
    { value: String(docs.length), label: 'Documents in workspace' },
    { value: String(watchedDocs.length), label: 'Watching' },
    { value: role, label: 'Your role' },
  ];

  const tabs = [
    { key: 'watching' as const, label: 'Watching', count: watchedDocs.length },
    { key: 'docs' as const, label: 'My documentation', count: myDocs.length },
    { key: 'settings' as const, label: 'Settings', count: null },
  ];

  return (
    <AppShell>
      {/* identity */}
      <div className="mb-6 flex items-center gap-[18px]">
        <Avatar
          url={profile.user.avatarUrl}
          name={profile.user.name}
          className="h-20 w-20 rounded-[22px]"
          fontSize="28px"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              {profile.user.name}
            </h1>
            <span className="rounded-md border border-capbd bg-accsoft px-2 py-0.5 text-[11px] font-semibold capitalize text-accfg">
              {role}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[13.5px] text-fg3">
            {profile.user.username && <span>@{profile.user.username}</span>}
            {profile.user.username && <span className="text-line">·</span>}
            <span>{profile.user.email}</span>
          </div>
          {profile.user.bio && (
            <p className="mt-1.5 max-w-[560px] text-[13px] text-fg2">{profile.user.bio}</p>
          )}
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-1.5 rounded-[9px] border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5Z" stroke="var(--accfg)" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          Edit profile
        </button>
      </div>

      {/* stat strip */}
      <div className="mb-6 grid grid-cols-4 gap-3.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[13px] border border-line bg-card px-[17px] py-[15px]">
            <div className="text-2xl font-bold capitalize leading-none tracking-tight text-fg">
              {s.value}
            </div>
            <div className="mt-1.5 text-[12.5px] text-fg3">{s.label}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="mb-5 flex items-center gap-1 border-b border-line">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-[11px] text-[13.5px] font-semibold transition',
              tab === tb.key
                ? 'text-fg shadow-[inset_0_-2px_0_var(--acc)]'
                : 'text-fg3 hover:text-fg2',
            )}
          >
            {tb.label}
            {tb.count !== null && (
              <span className="rounded-full bg-capbg px-[7px] py-px text-[11px] font-semibold text-fg3">
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Watching */}
      {tab === 'watching' && (
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          {watchedDocs.map((d) => (
            <div
              key={d.filePath}
              className="flex w-full items-center gap-2.5 border-t border-line2 px-[18px] py-[13px] first:border-t-0 transition hover:bg-rowhover"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
                <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
              </svg>
              <button
                onClick={() => router.push(`/documents/view?path=${encodeURIComponent(d.filePath)}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[13.5px] font-semibold text-fg">{d.title}</div>
                <div className="truncate font-mono text-[11px] text-fg3">{d.filePath}</div>
              </button>
              <span className="text-[12px] text-fg3">
                {new Date(d.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => unwatch(d.filePath)}
                className="flex items-center gap-1.5 rounded-md border border-capbd bg-capbg px-2.5 py-1 text-[11.5px] font-semibold text-accfg transition hover:border-acc"
                title="Stop watching"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--acc)">
                  <path d="M8 1.8l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.9 4.3 13.8l.8-4.1-3-2.8 4.1-.5L8 1.8Z" stroke="var(--acc)" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                Watching
              </button>
            </div>
          ))}
          {watchedDocs.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-[18px] py-12 text-center">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.8l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.9 4.3 13.8l.8-4.1-3-2.8 4.1-.5L8 1.8Z" stroke="var(--fg3)" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
              <div className="text-sm font-semibold text-fg2">Not watching anything yet</div>
              <div className="text-[13px] text-fg3">
                Star a document on the dashboard to follow it here.
              </div>
            </div>
          )}
        </div>
      )}

      {/* My documentation */}
      {tab === 'docs' && (
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          <div className="flex border-b border-line2 px-[18px] py-[11px] text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            <span className="flex-1">Document</span>
            <span className="w-[120px]">Status</span>
            <span className="w-[110px] text-right">Updated</span>
          </div>
          {myDocs.map((d) => (
            <button
              key={d.filePath}
              onClick={() =>
                router.push(`/documents/view?path=${encodeURIComponent(d.filePath)}`)
              }
              className="flex w-full items-center border-t border-line2 px-[18px] py-[13px] text-left transition hover:bg-rowhover"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-fg">{d.title}</div>
                  <div className="truncate font-mono text-[11px] text-fg3">{d.filePath}</div>
                </div>
              </div>
              <span className="flex w-[120px] items-center gap-1.5 text-[12px] capitalize text-fg2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusDot(d.status) }} />
                {d.status ?? 'published'}
              </span>
              <span className="w-[110px] text-right text-[12.5px] text-fg3">
                {new Date(d.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
          {myDocs.length === 0 && (
            <div className="px-[18px] py-10 text-center text-sm text-fg3">
              You haven&apos;t edited any documents yet.
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <div className="grid max-w-[560px] gap-4">
          {[
            { label: 'Display name', value: profile.user.name },
            { label: 'Username', value: profile.user.username ? `@${profile.user.username}` : '—' },
            { label: 'Email', value: profile.user.email },
            { label: 'Role', value: role },
            { label: 'Bio', value: profile.user.bio || '—' },
          ].map((f) => (
            <div key={f.label} className="grid gap-1.5">
              <span className="text-[12.5px] font-semibold text-fg3">{f.label}</span>
              <div className="min-h-[42px] rounded-[9px] border border-inputbd bg-bg px-3 py-2.5 text-sm capitalize text-fg2">
                {f.value}
              </div>
            </div>
          ))}
          <div>
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 rounded-[9px] bg-acc px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5Z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Edit profile
            </button>
          </div>
          <p className="text-xs text-fg3">
            Email is your sign-in identity and can&apos;t be changed here.
          </p>
        </div>
      )}

      {/* Edit profile modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        onSubmit={saveProfile}
        submitLabel={saving ? 'Saving…' : 'Save changes'}
        submitting={saving}
        hint="Saved to your DocuGraph account"
      >
        <div className="grid gap-4">
          {/* avatar */}
          <div className="flex items-center gap-3.5">
            <Avatar url={draftAvatar} name={draftName || profile.user.name} className="h-16 w-16 rounded-2xl" fontSize="22px" />
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3 py-2 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 10.5V3M5 6l3-3 3 3M3 12.5h10" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Upload new avatar
              </button>
              <p className="mt-1.5 text-[11px] text-fg3">PNG or JPG, up to 2 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { void pickAvatar(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-fg3">Display name</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={80}
              className="h-[42px] rounded-[9px] border border-inputbd bg-bg px-3 text-sm text-fg outline-none focus:border-acc"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-fg3">Username</span>
            <div className="flex h-[42px] items-center rounded-[9px] border border-inputbd bg-bg px-3 focus-within:border-acc">
              <span className="font-mono text-sm text-fg3">@</span>
              <input
                value={draftUser.replace(/^@/, '')}
                onChange={(e) => setDraftUser(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                maxLength={40}
                placeholder="username"
                className="ml-0.5 h-full flex-1 bg-transparent font-mono text-sm text-fg outline-none"
              />
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-fg3">Role</span>
            <input
              value={role}
              disabled
              className="h-[42px] rounded-[9px] border border-inputbd bg-bg px-3 text-sm capitalize text-fg3"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-fg3">Bio</span>
            <textarea
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
              maxLength={280}
              rows={3}
              className="resize-none rounded-[9px] border border-inputbd bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-acc"
            />
            <span className="text-right text-[11px] text-fg3">{draftBio.length}/280</span>
          </label>
        </div>
      </Modal>
    </AppShell>
  );
}
