'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, apiBaseUrl, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface Source {
  provider: string | null;
  repo: string | null;
  branch: string;
  root: string;
  realtimeWebhooks: boolean;
  bidirectional: boolean;
  enforceTemplates: boolean;
  lastIndexedAt: string | null;
  pushConfigured: boolean;
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-6 w-[42px] items-center rounded-full p-[3px] transition',
        on ? 'bg-acc' : 'bg-capbd',
      )}
    >
      <span
        className={cn(
          'h-[18px] w-[18px] rounded-full bg-white transition',
          on && 'translate-x-[18px]',
        )}
      />
    </button>
  );
}

export default function ConnectPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  const ws = profile?.workspaces[0]?.id;
  const isOwner = profile?.workspaces[0]?.role === 'owner';

  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [root, setRoot] = useState('');
  const [webhooks, setWebhooks] = useState(false);
  const [bidirectional, setBidirectional] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastIndexed, setLastIndexed] = useState<string | null>(null);
  const [webhookCfg, setWebhookCfg] = useState<{ secret: string; url: string } | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [pushRemote, setPushRemote] = useState('');
  const [pushConfigured, setPushConfigured] = useState(false);
  const [savingRemote, setSavingRemote] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadWebhookConfig = useCallback(async () => {
    if (!ws) return;
    try {
      const c = await apiFetch<{ enabled: boolean; secret: string | null; path: string | null }>(
        `/workspaces/${ws}/documents/source/webhook`,
      );
      setWebhookCfg(c.enabled && c.secret && c.path ? { secret: c.secret, url: `${apiBaseUrl}${c.path}` } : null);
    } catch {
      // non-owner / not configured — keep panel hidden
    }
  }, [ws]);

  useEffect(() => {
    if (!ws) return;
    apiFetch<Source | null>(`/workspaces/${ws}/documents/source`)
      .then((s) => {
        if (!s) return;
        setRepo(s.repo ?? '');
        setBranch(s.branch || 'main');
        setRoot(s.root || '');
        setWebhooks(s.realtimeWebhooks);
        setBidirectional(s.bidirectional);
        setTemplates(s.enforceTemplates);
        setLastIndexed(s.lastIndexedAt);
        setPushConfigured(s.pushConfigured);
        if (s.realtimeWebhooks) void loadWebhookConfig();
      })
      .catch(() => {});
  }, [ws, loadWebhookConfig]);

  async function savePushRemote() {
    if (!ws || !pushRemote.trim()) {
      toast('Enter a push remote URL', 'error');
      return;
    }
    setSavingRemote(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents/source`, {
        method: 'PUT',
        body: JSON.stringify({ pushRemote: pushRemote.trim() }),
      });
      toast('Push remote saved', 'success');
      setPushConfigured(true);
      setPushRemote('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save remote', 'error');
    } finally {
      setSavingRemote(false);
    }
  }

  async function publishNow() {
    if (!ws) return;
    setPublishing(true);
    try {
      const res = await apiFetch<{ pushed: boolean; files: number; message: string }>(
        `/workspaces/${ws}/documents/source/publish`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      toast(res.message, res.pushed ? 'success' : 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  }

  async function toggleBidirectional(v: boolean) {
    setBidirectional(v);
    if (!ws || !isOwner) return;
    try {
      await apiFetch(`/workspaces/${ws}/documents/source`, {
        method: 'PUT',
        body: JSON.stringify({ bidirectional: v }),
      });
      if (v && !pushConfigured) {
        toast('Set a push remote in step 4 to enable auto-sync', 'info');
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update sync', 'error');
    }
  }

  async function toggleWebhooks(v: boolean) {
    setWebhooks(v);
    if (!ws || !isOwner) return;
    try {
      await apiFetch(`/workspaces/${ws}/documents/source`, {
        method: 'PUT',
        body: JSON.stringify({ realtimeWebhooks: v }),
      });
      if (v) await loadWebhookConfig();
      else setWebhookCfg(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update webhooks', 'error');
    }
  }

  async function startIndexing() {
    if (!ws) return;
    if (!repo.trim()) {
      toast('Enter a GitHub repository (owner/repo)', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents/source`, {
        method: 'PUT',
        body: JSON.stringify({
          provider: 'github',
          repo: repo.trim(),
          branch: branch.trim() || 'main',
          root: root.trim(),
          realtimeWebhooks: webhooks,
          bidirectional,
          enforceTemplates: templates,
        }),
      });
      const res = await apiFetch<{ imported: number; total: number }>(
        `/workspaces/${ws}/documents/source/index`,
        { method: 'POST' },
      );
      toast(`Imported ${res.imported} document(s) from ${repo}`, 'success');
      setLastIndexed(new Date().toISOString());
      router.push('/documents');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Indexing failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center text-fg2">
        {error}
      </main>
    );
  }

  return (
    <AppShell>
      <h1 className="text-[28px] font-bold tracking-tight text-fg">
        Connect your documentation source
      </h1>
      <p className="mb-7 mt-1.5 max-w-2xl text-sm text-fg3">
        Select a Git provider to import and index your Markdown files into
        DocuGraph.
      </p>

      {!isOwner && (
        <p className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Only workspace owners can connect a source.
        </p>
      )}

      {/* 1 — provider */}
      <Section step="1" title="Choose a provider">
        <div className="grid grid-cols-3 gap-3">
          <ProviderCard active label="GitHub" sub="Public repositories" />
          <ProviderCard label="GitLab" sub="Coming soon" disabled />
          <ProviderCard label="External / API" sub="Coming soon" disabled />
        </div>
      </Section>

      {/* 2 — repo */}
      <Section step="2" title="Repository & branch">
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Repository (owner/repo)"
            value={repo}
            onChange={setRepo}
            placeholder="vercel/next.js"
          />
          <Input
            label="Branch"
            value={branch}
            onChange={setBranch}
            placeholder="main"
          />
          <Input
            label="Documentation root (optional)"
            value={root}
            onChange={setRoot}
            placeholder="docs"
          />
        </div>
      </Section>

      {/* 3 — automation */}
      <Section step="3" title="Sync & automation">
        <div className="grid gap-3">
          <ToggleRow
            label="Real-time webhooks"
            sub="Re-index automatically on every git push"
            on={webhooks}
            onChange={toggleWebhooks}
          />
          {webhooks && webhookCfg && (
            <div className="rounded-xl border border-acc/40 bg-accsoft/50 p-4">
              <div className="mb-1 text-[13px] font-semibold text-fg">GitHub webhook ready</div>
              <p className="mb-3 text-[12px] text-fg3">
                In your repository open <span className="font-medium text-fg2">Settings → Webhooks → Add webhook</span>,
                paste the values below, set the content type to <span className="font-mono">application/json</span>, and
                save. DocuGraph re-indexes on every push.
              </p>
              <CopyField label="Payload URL" value={webhookCfg.url} />
              <CopyField
                label="Secret"
                value={webhookCfg.secret}
                masked={!revealSecret}
                onToggleReveal={() => setRevealSecret((r) => !r)}
              />
              <div className="mt-2 text-[11.5px] text-fg3">
                Content type <span className="font-mono text-fg2">application/json</span> · Event{' '}
                <span className="font-mono text-fg2">push</span>
              </div>
            </div>
          )}
          <ToggleRow
            label="Bidirectional sync"
            sub="Auto-commit & push every document edit to the repo (uses the push remote in step 4)"
            on={bidirectional}
            onChange={toggleBidirectional}
          />
          <ToggleRow
            label="Enforce structural boilerplates"
            sub="Warn when new files don't follow repository templates"
            on={templates}
            onChange={setTemplates}
          />
        </div>
        <p className="mt-3 text-xs text-fg3">
          Importing, signed push webhooks and bidirectional sync are live (the
          latter needs a push remote in step 4). Template enforcement is saved as
          configuration.
        </p>
      </Section>

      {/* 4 — publish */}
      <Section step="4" title="Publish to Git">
        <p className="mb-3 text-[13px] text-fg3">
          Commit the current documents and push them to a repository. For GitHub,
          use an authenticated URL with a write-scoped token:{' '}
          <span className="font-mono text-fg2">
            https://x-access-token:TOKEN@github.com/owner/repo.git
          </span>
          . The token is encrypted at rest and never shown again.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label={pushConfigured ? 'Push remote (configured — enter to replace)' : 'Push remote URL'}
              type="password"
              value={pushRemote}
              onChange={setPushRemote}
              placeholder="https://x-access-token:TOKEN@github.com/owner/repo.git"
            />
          </div>
          <Button variant="secondary" onClick={savePushRemote} disabled={savingRemote || !isOwner}>
            {savingRemote ? 'Saving…' : 'Save remote'}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={publishNow} disabled={publishing || !pushConfigured || !isOwner}>
            {publishing ? 'Publishing…' : 'Publish to repository'}
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-fg3">
            <span className={cn('h-1.5 w-1.5 rounded-full', pushConfigured ? 'bg-emerald-400' : 'bg-capbd')} />
            {pushConfigured ? 'Remote configured' : 'No remote configured yet'}
          </span>
        </div>
      </Section>

      <div className="mt-7 flex items-center gap-3">
        <Button onClick={startIndexing} disabled={busy || !isOwner}>
          {busy ? 'Indexing…' : 'Start indexing repository'}
        </Button>
        {lastIndexed && (
          <span className="text-xs text-fg3">
            Last indexed {new Date(lastIndexed).toLocaleString()}
          </span>
        )}
      </div>
    </AppShell>
  );
}

function CopyField({
  label,
  value,
  masked,
  onToggleReveal,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onToggleReveal?: () => void;
}) {
  const { toast } = useToast();
  const display = masked ? '•'.repeat(Math.min(value.length, 32)) : value;
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line2 bg-bg px-3 py-2 font-mono text-[12px] text-fg2">
          {display}
        </code>
        {onToggleReveal && (
          <button
            onClick={onToggleReveal}
            className="rounded-lg border border-capbd bg-capbg px-2.5 py-2 text-[11.5px] font-medium text-fg2 transition hover:border-acc"
          >
            {masked ? 'Reveal' : 'Hide'}
          </button>
        )}
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast(`${label} copied`, 'success');
          }}
          className="rounded-lg border border-capbd bg-capbg px-2.5 py-2 text-[11.5px] font-medium text-fg2 transition hover:border-acc"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 rounded-[14px] border border-line bg-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accsoft text-[12px] font-bold text-accfg">
          {step}
        </span>
        <span className="text-[15px] font-semibold text-fg">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ProviderCard({
  label,
  sub,
  active,
  disabled,
}: {
  label: string;
  sub: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3.5',
        active ? 'border-acc bg-accsoft' : 'border-line bg-panel',
        disabled && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-fg">{label}</span>
        {active && (
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        )}
      </div>
      <div className="mt-0.5 text-[12px] text-fg3">{sub}</div>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line2 bg-panel px-4 py-3">
      <div>
        <div className="text-[14px] font-medium text-fg">{label}</div>
        <div className="text-[12.5px] text-fg3">{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
