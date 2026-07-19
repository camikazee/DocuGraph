'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiBaseUrl, apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useProfile } from '@/lib/useProfile';

interface Volume {
  id: string;
  name: string;
  provider: 'local' | 's3' | 'ftp';
  status: 'connected' | 'error';
  storageUsed: number;
  lastConnectedAt: string | null;
}
interface Asset {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'doc' | 'other';
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  volumeId: string;
  referencedIn: string[];
  createdAt: string;
}
interface Overview {
  usedBytes: number;
  quotaBytes: number;
  counts: { total: number; images: number; pdf: number; large: number; unused: number };
  brokenLinks: number;
}
type Filter = 'all' | 'image' | 'pdf' | 'unused';
type View = 'grid' | 'list';

const PROVIDER_LABEL = { local: 'Local disk', s3: 'Cloud (S3)', ftp: 'FTP / SFTP' };
const PROVIDER_SUB = {
  local: 'Local disk',
  s3: 'AWS S3',
  ftp: 'FTP / SFTP',
};

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function badgeOf(a: Asset): string {
  const m: Record<string, string> = {
    'image/svg+xml': 'SVG',
    'image/png': 'PNG',
    'image/jpeg': 'JPG',
    'image/gif': 'GIF',
    'image/webp': 'WEBP',
    'application/pdf': 'PDF',
  };
  return m[a.mimeType] ?? (a.mimeType.split('/')[1]?.slice(0, 4).toUpperCase() || a.type.toUpperCase());
}

export default function MediaPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const ws = profile?.workspaces[0]?.id;

  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('grid');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [uploadVolume, setUploadVolume] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState('');
  const [moving, setMoving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // mount wizard
  const [mounting, setMounting] = useState(false);
  const [provider, setProvider] = useState<'local' | 's3' | 'ftp'>('local');
  const [form, setForm] = useState<Record<string, string>>({ name: '' });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savingVol, setSavingVol] = useState(false);

  const publicUrl = (id: string) => `${apiBaseUrl}/public/workspaces/${ws}/assets/${id}`;

  const PAGE = 40;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const [v, a, o] = await Promise.all([
      apiFetch<Volume[]>(`/workspaces/${ws}/volumes`).catch(() => []),
      apiFetch<Asset[]>(
        `/workspaces/${ws}/assets?filter=${filter}&limit=${PAGE}`,
      ).catch(() => []),
      apiFetch<Overview>(`/workspaces/${ws}/assets/overview`).catch(() => null),
    ]);
    setVolumes(v);
    setAssets(a);
    setHasMore(a.length === PAGE);
    setOverview(o);
    setUploadVolume((cur) => cur || v[0]?.id || '');
  }, [ws, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMoreAssets() {
    if (!ws || !assets || assets.length === 0) return;
    setLoadingMore(true);
    try {
      const before = encodeURIComponent(assets[assets.length - 1].createdAt);
      const older = await apiFetch<Asset[]>(
        `/workspaces/${ws}/assets?filter=${filter}&limit=${PAGE}&before=${before}`,
      );
      setAssets((prev) => [...(prev ?? []), ...older]);
      setHasMore(older.length === PAGE);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load more', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  // Reset the move target whenever the selected asset changes.
  useEffect(() => {
    setMoveTarget('');
  }, [selected?.id]);

  async function uploadFiles(files: FileList | File[]) {
    if (!ws) return;
    const list = Array.from(files);
    setUploading((u) => [...u, ...list.map((f) => f.name)]);
    let ok = 0;
    for (const file of list) {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadVolume) fd.append('volumeId', uploadVolume);
      try {
        const res = await fetch(`${apiBaseUrl}/workspaces/${ws}/assets`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        if (!res.ok) {
          const msg = (await res.json().catch(() => ({}))).message;
          throw new Error(res.status === 501 ? 'This volume’s driver is not enabled yet' : msg || 'Upload failed');
        }
        ok++;
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
    if (ok) toast(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`, 'success');
    await load();
  }

  async function rename(a: Asset) {
    const name = window.prompt('Rename asset', a.name);
    if (!ws || !name || name === a.name) return;
    try {
      const updated = await apiFetch<Asset>(`/workspaces/${ws}/assets/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      toast('Renamed', 'success');
      setSelected(updated);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Rename failed', 'error');
    }
  }

  async function remove(a: Asset) {
    if (!ws || !window.confirm(`Delete ${a.name}? This cannot be undone.`)) return;
    try {
      await apiFetch(`/workspaces/${ws}/assets/${a.id}`, { method: 'DELETE' });
      toast('Deleted', 'success');
      if (selected?.id === a.id) setSelected(null);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Delete failed', 'error');
    }
  }

  async function moveAsset(a: Asset, targetId: string) {
    if (!ws || !targetId) return;
    setMoving(true);
    try {
      const updated = await apiFetch<Asset>(`/workspaces/${ws}/assets/${a.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ volumeId: targetId }),
      });
      toast(`Moved to ${volumes.find((v) => v.id === targetId)?.name ?? 'volume'}`, 'success');
      setSelected(updated);
      setMoveTarget('');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Move failed', 'error');
    } finally {
      setMoving(false);
    }
  }

  function copyRef(a: Asset) {
    const ref = `![${a.name}](${publicUrl(a.id)})`;
    void navigator.clipboard?.writeText(ref);
    toast('Markdown reference copied', 'success');
  }

  async function healthCheck() {
    await load();
    toast('Asset health refreshed', 'success');
  }

  // ---- mount wizard ----
  function openMount() {
    setProvider('local');
    setForm({ name: '' });
    setTestResult(null);
    setMounting(true);
  }
  function configFromForm(): Record<string, string> {
    const { name, ...rest } = form;
    void name;
    return rest;
  }
  async function testConnection() {
    if (!ws) return;
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/workspaces/${ws}/volumes/test`,
        { method: 'POST', body: JSON.stringify({ provider, config: configFromForm() }) },
      );
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof ApiError ? err.message : 'Test failed' });
    }
  }
  async function saveVolume() {
    if (!ws || !form.name?.trim()) {
      toast('Volume name is required', 'error');
      return;
    }
    setSavingVol(true);
    try {
      await apiFetch(`/workspaces/${ws}/volumes`, {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), provider, config: configFromForm() }),
      });
      toast('Volume mounted', 'success');
      setMounting(false);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Mount failed', 'error');
    } finally {
      setSavingVol(false);
    }
  }

  async function reconnect(v: Volume) {
    if (!ws) return;
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/workspaces/${ws}/volumes/${v.id}/reconnect`,
        { method: 'POST' },
      );
      toast(res.ok ? 'Reconnected' : res.message, res.ok ? 'success' : 'error');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Reconnect failed', 'error');
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [assets, query]);

  if (error) return <main className="grid min-h-screen place-items-center text-fg2">{error}</main>;

  const usedPct = overview ? Math.min(100, Math.round((overview.usedBytes / overview.quotaBytes) * 100)) : 0;
  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: overview?.counts.total },
    { key: 'image', label: 'Images', count: overview?.counts.images },
    { key: 'pdf', label: 'Documents', count: overview?.counts.pdf },
    { key: 'unused', label: 'Unused', count: overview?.counts.unused },
  ];
  const activeVol = volumes.find((v) => v.id === uploadVolume);

  return (
    <AppShell>
      {/* header */}
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">Media &amp; file manager</h1>
          <p className="mt-1 text-sm text-fg3">
            {overview ? `${overview.counts.total} asset${overview.counts.total === 1 ? '' : 's'}` : '—'}
            {' · '}
            {volumes.length} volume{volumes.length === 1 ? '' : 's'} mounted
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="ml-auto flex items-center gap-2 rounded-[11px] bg-acc px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Upload files
        </button>
      </div>

      {/* stat cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* usage */}
        <div className="flex items-center gap-4 rounded-[15px] border border-line bg-card p-5">
          <Ring pct={usedPct} />
          <div>
            <div className="text-[12.5px] text-fg3">Total usage</div>
            <div className="text-[19px] font-bold text-fg">
              {overview ? fmtBytes(overview.usedBytes) : '—'}
              <span className="ml-1 text-[12.5px] font-normal text-fg3">
                of {overview ? fmtBytes(overview.quotaBytes) : '—'}
              </span>
            </div>
            <div className="text-[11.5px] text-fg3">
              {overview ? `${fmtBytes(Math.max(0, overview.quotaBytes - overview.usedBytes))} available` : ''}
            </div>
          </div>
        </div>

        {/* broken links / health */}
        <div className="flex flex-col justify-between rounded-[15px] border border-line bg-card p-5">
          <div className="flex items-center gap-2.5">
            <span className={cn('grid h-7 w-7 place-items-center rounded-lg', (overview?.brokenLinks ?? 0) > 0 ? 'bg-amber-500/15' : 'bg-emerald-500/15')}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 5v3.5M8 11h.01" stroke={(overview?.brokenLinks ?? 0) > 0 ? '#f59e0b' : '#10b981'} strokeWidth="1.6" strokeLinecap="round" />
                <path d="M8 1.5 14.5 13H1.5L8 1.5Z" stroke={(overview?.brokenLinks ?? 0) > 0 ? '#f59e0b' : '#10b981'} strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className={cn('text-[19px] font-bold leading-none', (overview?.brokenLinks ?? 0) > 0 ? 'text-amber-400' : 'text-fg')}>
                {overview?.brokenLinks ?? 0}
              </div>
              <div className="text-[12px] text-fg3">Broken asset links</div>
            </div>
          </div>
          <button
            onClick={healthCheck}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-capbd bg-capbg px-3 py-2 text-[12px] font-semibold text-fg2 transition hover:border-acc"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Run asset health check
          </button>
        </div>

        {/* counts */}
        <div className="grid content-center gap-2.5 rounded-[15px] border border-line bg-card p-5">
          <CountRow icon="image" label="Images" value={overview?.counts.images ?? 0} />
          <CountRow icon="doc" label="Documents / PDF" value={overview?.counts.pdf ?? 0} />
          <CountRow icon="large" label="Large assets (>5MB)" value={overview?.counts.large ?? 0} />
        </div>
      </div>

      {/* volumes */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Volumes</span>
        <button onClick={openMount} className="flex items-center gap-1 text-[12px] font-semibold text-accfg hover:opacity-80">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Mount a new volume
        </button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {volumes.map((v) => (
          <button
            key={v.id}
            onClick={() => setUploadVolume(v.id)}
            className={cn(
              'flex items-center gap-3 rounded-[13px] border p-3 text-left transition',
              uploadVolume === v.id ? 'border-acc bg-accsoft' : 'border-line bg-card hover:border-acc/60',
            )}
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-panel text-fg2">
              <VolumeIcon provider={v.provider} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-fg">{v.name}</span>
              <span className="block truncate text-[11.5px] text-fg3">
                {PROVIDER_SUB[v.provider]} · {fmtBytes(v.storageUsed)}
              </span>
            </span>
            {v.status === 'error' ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); void reconnect(v); }}
                className="flex flex-none items-center gap-1 text-[11px] font-medium text-amber-400 hover:opacity-80"
                title="Connection lost — reconnect"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                reconnect
              </span>
            ) : (
              <span className="h-2 w-2 flex-none rounded-full bg-emerald-400" title="Connected" />
            )}
          </button>
        ))}
      </div>

      {/* upload zone + uploading list */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'grid cursor-pointer place-items-center rounded-[15px] border-2 border-dashed px-4 py-8 text-center transition',
            dragOver ? 'border-acc bg-accsoft' : 'border-capbd bg-card hover:border-acc',
          )}
        >
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-accsoft">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 10.5V3M5 6l3-3 3 3M3 12.5h10" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="text-[14px] text-fg2">
            Drag &amp; drop or <span className="font-semibold text-accfg">browse</span> to upload
          </div>
          <div className="mt-1 text-[11.5px] text-fg3">
            .png .jpg .gif .svg .pdf · 50MB · upload to{' '}
            <span className="font-medium text-fg2">{activeVol?.name ?? 'volume'}</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div className="rounded-[15px] border border-line bg-card p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {uploading.length ? `Uploading · ${uploading.length}` : 'Upload activity'}
          </div>
          {uploading.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-fg3">No transfers in progress.</p>
          ) : (
            <ul className="grid gap-2.5">
              {uploading.map((name, i) => (
                <li key={`${name}-${i}`}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-fg2">{name}</span>
                    <span className="flex-none text-fg3">uploading…</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-rowhover">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-acc" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* toolbar: search + filters + view */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="7" cy="7" r="4.5" stroke="var(--muted)" strokeWidth="1.4" />
            <path d="m11 11 3 3" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets…"
            className="h-9 w-[220px] rounded-[10px] border border-inputbd bg-bg pl-9 pr-3 text-[13px] text-fg outline-none focus:border-acc"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
              filter === f.key ? 'bg-acc text-white' : 'bg-card text-fg3 hover:text-fg2',
            )}
          >
            {f.label}{f.count != null ? ` ${f.count}` : ''}
          </button>
        ))}
        <div className="ml-auto flex items-center rounded-[10px] border border-line bg-card p-0.5">
          {(['grid', 'list'] as const).map((vw) => (
            <button
              key={vw}
              onClick={() => setView(vw)}
              className={cn('grid h-7 w-8 place-items-center rounded-md transition', view === vw ? 'bg-accsoft text-accfg' : 'text-fg3 hover:text-fg2')}
              title={vw === 'grid' ? 'Grid view' : 'List view'}
            >
              {vw === 'grid' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* assets + details */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div>
        <Loader loading={assets === null} empty={shown.length === 0} emptyTitle="No assets" emptyMessage="Upload files to get started." minHeight={260}>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {shown.map((a) => (
                <AssetCard key={a.id} a={a} selected={selected?.id === a.id} onClick={() => setSelected(a)} thumb={publicUrl(a.id)} badge={badgeOf(a)} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-line bg-card">
              <div className="flex items-center border-b border-line2 px-[18px] py-[11px] text-[10.5px] font-semibold uppercase tracking-wider text-muted">
                <span className="flex-1">Name</span>
                <span className="w-[70px]">Type</span>
                <span className="w-[90px]">Referenced</span>
                <span className="w-[80px] text-right">Size</span>
              </div>
              {shown.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    'flex w-full items-center border-t border-line2 px-[18px] py-2.5 text-left transition hover:bg-rowhover',
                    selected?.id === a.id && 'bg-accsoft',
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Thumb a={a} thumb={publicUrl(a.id)} className="h-8 w-8" />
                    <span className="truncate text-[13px] text-fg2">{a.name}</span>
                  </span>
                  <span className="w-[70px] text-[11px] font-semibold text-fg3">{badgeOf(a)}</span>
                  <span className="w-[90px] text-[12px] text-fg3">
                    {a.referencedIn.length ? `${a.referencedIn.length} doc${a.referencedIn.length === 1 ? '' : 's'}` : <span className="text-amber-500">unused</span>}
                  </span>
                  <span className="w-[80px] text-right font-mono text-[12px] text-fg3">{fmtBytes(a.size)}</span>
                </button>
              ))}
            </div>
          )}
        </Loader>
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={loadMoreAssets}
              disabled={loadingMore}
              className="rounded-lg border border-capbd bg-capbg px-4 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        </div>

        {/* details */}
        <div className="rounded-[14px] border border-line bg-card p-5">
          {!selected ? (
            <div className="grid place-items-center py-20 text-center text-[13px] text-fg3">
              Select an asset to see its details.
            </div>
          ) : (
            <div className="grid gap-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Asset details</div>
              <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line2 bg-panel">
                <Thumb a={selected} thumb={publicUrl(selected.id)} className="h-full w-full" big />
              </div>
              <div>
                <div className="truncate text-[15px] font-semibold text-fg">{selected.name}</div>
                <div className="mt-0.5 inline-flex rounded-md bg-panel px-2 py-0.5 text-[10.5px] font-semibold text-fg3">{badgeOf(selected)}</div>
              </div>
              <div className="grid gap-1.5 border-t border-line2 pt-3 text-[12.5px]">
                {selected.width != null && <Row label="Dimensions" value={`${selected.width} × ${selected.height}`} />}
                <Row label="Size" value={fmtBytes(selected.size)} />
                <Row label="Volume" value={volumes.find((v) => v.id === selected.volumeId)?.name ?? '—'} />
                <Row label="Created" value={new Date(selected.createdAt).toLocaleDateString()} />
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Used in</div>
                {selected.referencedIn.length === 0 ? (
                  <p className="text-[12.5px] text-fg3">Not referenced in any document yet.</p>
                ) : (
                  <ul className="grid gap-1">
                    {selected.referencedIn.map((d) => (
                      <li key={d} className="flex items-center gap-2 truncate rounded-lg bg-panel px-2.5 py-1.5 text-[12px] text-fg2">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-none">
                          <path d="M4 2h5l3 3v9H4V2Z" stroke="var(--fg3)" strokeWidth="1.2" strokeLinejoin="round" />
                          <path d="M9 2v3h3" stroke="var(--fg3)" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                        <span className="truncate font-mono">{d}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {volumes.length > 1 && (
                <div className="grid gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Move to volume</div>
                  <div className="flex gap-2">
                    <select
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-inputbd bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-acc"
                    >
                      <option value="">Choose a volume…</option>
                      {volumes
                        .filter((v) => v.id !== selected.volumeId)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} · {PROVIDER_SUB[v.provider]}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => moveAsset(selected, moveTarget)}
                      disabled={!moveTarget || moving}
                      className="flex-none rounded-lg border border-capbd bg-capbg px-3 py-2 text-[12.5px] font-medium text-fg2 transition hover:border-acc disabled:opacity-40"
                    >
                      {moving ? 'Moving…' : 'Move'}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => copyRef(selected)}
                className="flex items-center justify-center gap-2 rounded-lg bg-acc px-3 py-2.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                Copy markdown reference
              </button>
              <div className="flex gap-2">
                <button onClick={() => rename(selected)} className="flex-1 rounded-lg border border-capbd bg-capbg px-3 py-2 text-[12.5px] font-medium text-fg2 transition hover:border-acc">Rename</button>
                <button onClick={() => remove(selected)} className="flex-1 rounded-lg border border-red-500/35 px-3 py-2 text-[12.5px] font-medium text-red-400 transition hover:bg-red-500/10">Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* mount wizard */}
      <Modal
        open={mounting}
        onClose={() => setMounting(false)}
        title="Mount a new volume"
        size="md"
        onSubmit={saveVolume}
        submitLabel={savingVol ? 'Mounting…' : 'Mount volume'}
        submitting={savingVol}
        hint="Connect a storage source to your workspace"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(['local', 's3', 'ftp'] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setProvider(p); setTestResult(null); }}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-[12.5px] font-semibold transition',
                  provider === p ? 'border-acc bg-accsoft text-fg' : 'border-line bg-panel text-fg3 hover:border-acc',
                )}
              >
                {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>

          <Field label="Volume name" value={form.name ?? ''} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Design assets" />

          {provider === 's3' && (
            <>
              <Field label="Bucket" value={form.bucket ?? ''} onChange={(v) => setForm((f) => ({ ...f, bucket: v }))} placeholder="my-bucket" />
              <Field label="Region" value={form.region ?? ''} onChange={(v) => setForm((f) => ({ ...f, region: v }))} placeholder="us-east-1" />
              <Field label="Endpoint (optional)" value={form.endpoint ?? ''} onChange={(v) => setForm((f) => ({ ...f, endpoint: v }))} placeholder="https://s3.example.com" />
              <Field label="Access key ID" value={form.accessKeyId ?? ''} onChange={(v) => setForm((f) => ({ ...f, accessKeyId: v }))} />
              <Field label="Secret access key" type="password" value={form.secretAccessKey ?? ''} onChange={(v) => setForm((f) => ({ ...f, secretAccessKey: v }))} />
            </>
          )}
          {provider === 'ftp' && (
            <>
              <Field label="Protocol (ftp / sftp)" value={form.protocol ?? 'sftp'} onChange={(v) => setForm((f) => ({ ...f, protocol: v }))} />
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <Field label="Host" value={form.host ?? ''} onChange={(v) => setForm((f) => ({ ...f, host: v }))} placeholder="ftp.example.com" />
                <Field label="Port" value={form.port ?? ''} onChange={(v) => setForm((f) => ({ ...f, port: v }))} placeholder="22" />
              </div>
              <Field label="Username" value={form.username ?? ''} onChange={(v) => setForm((f) => ({ ...f, username: v }))} />
              <Field label="Password" type="password" value={form.password ?? ''} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
              <Field label="Base path" value={form.basePath ?? ''} onChange={(v) => setForm((f) => ({ ...f, basePath: v }))} placeholder="/docs/media" />
              <p className="text-[11.5px] text-fg3">
                Use <span className="font-mono">sftp</span> (port 22) or{' '}
                <span className="font-mono">ftp</span> (port 21). Credentials are encrypted at rest.
              </p>
            </>
          )}

          <div className="flex items-center gap-3">
            <button onClick={testConnection} className="rounded-lg border border-capbd bg-capbg px-3 py-2 text-[12.5px] font-semibold text-fg2 transition hover:border-acc">
              Test connection
            </button>
            {testResult && (
              <span className={cn('flex items-center gap-1.5 text-[12.5px]', testResult.ok ? 'text-emerald-400' : 'text-red-400')}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: testResult.ok ? '#10b981' : '#ef4444' }} />
                {testResult.ok ? 'Connection successful' : testResult.message}
              </span>
            )}
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="relative h-[60px] w-[60px] flex-none">
      <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--rowhover)" strokeWidth="6" />
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--acc)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[12.5px] font-bold text-fg">{pct}%</span>
    </div>
  );
}

function CountRow({ icon, label, value }: { icon: 'image' | 'doc' | 'large'; label: string; value: number }) {
  const paths: Record<typeof icon, JSX.Element> = {
    image: (
      <>
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
        <path d="m3 12 3.5-3.5L9 11l2-2 2 2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </>
    ),
    doc: (
      <>
        <path d="M4 2h5l3 3v9H4V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </>
    ),
    large: (
      <>
        <path d="M8 11V3M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 13h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-panel text-fg3">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">{paths[icon]}</svg>
      </span>
      <span className="flex-1 text-[12.5px] text-fg2">{label}</span>
      <span className="text-[15px] font-bold text-fg">{value}</span>
    </div>
  );
}

function VolumeIcon({ provider }: { provider: 'local' | 's3' | 'ftp' }) {
  if (provider === 's3') {
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
        <path d="M3 6a5 3 0 0 0 10 0M3 6v4a5 3 0 0 0 10 0V6M3 6a5 3 0 0 1 10 0" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (provider === 'ftp') {
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="2" y="9" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="5" r="0.6" fill="currentColor" />
        <circle cx="4.5" cy="11" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function Thumb({ a, thumb, className, big }: { a: Asset; thumb: string; className?: string; big?: boolean }) {
  if (a.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumb} alt={a.name} className={cn('rounded border border-line2 bg-panel object-cover', big && 'object-contain', className)} />;
  }
  const isPdf = a.type === 'pdf';
  return (
    <span className={cn('grid place-items-center rounded border border-line2 bg-panel text-fg3', className)}>
      {isPdf ? (
        <svg width={big ? 40 : 16} height={big ? 40 : 16} viewBox="0 0 16 16" fill="none">
          <path d="M4 2h5l3 3v9H4V2Z" stroke="#ef6b6b" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M9 2v3h3" stroke="#ef6b6b" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width={big ? 40 : 16} height={big ? 40 : 16} viewBox="0 0 16 16" fill="none">
          <path d="M6 5 3 8l3 3M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function AssetCard({ a, selected, onClick, thumb, badge }: { a: Asset; selected: boolean; onClick: () => void; thumb: string; badge: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group overflow-hidden rounded-[13px] border bg-card text-left transition',
        selected ? 'border-acc ring-1 ring-acc' : 'border-line hover:border-acc/60',
      )}
    >
      <div className="relative grid h-28 place-items-center overflow-hidden bg-panel">
        {a.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={a.name} className="h-full w-full object-cover" />
        ) : a.type === 'pdf' ? (
          <svg width="34" height="34" viewBox="0 0 16 16" fill="none">
            <path d="M4 2h5l3 3v9H4V2Z" stroke="#ef6b6b" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M9 2v3h3" stroke="#ef6b6b" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="text-fg3">
            <path d="M6 5 3 8l3 3M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="absolute right-2 top-2 rounded-md bg-bg/80 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-fg2 backdrop-blur">{badge}</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-[12.5px] font-medium text-fg2">{a.name}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-fg3">{fmtBytes(a.size)}</span>
          {a.referencedIn.length ? (
            <span className="truncate rounded bg-accsoft px-1.5 py-0.5 text-[10px] font-medium text-accfg">{a.referencedIn[0]}{a.referencedIn.length > 1 ? ` +${a.referencedIn.length - 1}` : ''}</span>
          ) : (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">Unused</span>
          )}
        </div>
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg3">{label}</span>
      <span className="truncate font-medium text-fg2">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-fg3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[40px] rounded-[9px] border border-inputbd bg-bg px-3 text-sm text-fg outline-none focus:border-acc"
      />
    </label>
  );
}
