'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/api';
import { isEmail, required } from '@/lib/validation';
import { useProfile } from '@/lib/useProfile';

interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
}
interface Invitation {
  id: string;
  email: string;
  role: string;
}
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function TeamPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const ws = profile?.workspaces[0]?.id;
  const myRole = profile?.workspaces[0]?.role;
  const isOwner = myRole === 'owner';
  const canInvite = isOwner || myRole === 'editor';

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [filter, setFilter] = useState('');

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    const [m, i, k] = await Promise.all([
      apiFetch<Member[]>(`/workspaces/${ws}/members`),
      canInvite ? apiFetch<Invitation[]>(`/workspaces/${ws}/invitations`) : Promise.resolve([]),
      isOwner ? apiFetch<ApiKey[]>(`/workspaces/${ws}/api-keys`) : Promise.resolve([]),
    ]);
    setMembers(m);
    setInvites(i);
    setKeys(k);
  }, [ws, canInvite, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const shownMembers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, filter]);

  async function changeRole(userId: string, role: string) {
    try {
      await apiFetch(`/workspaces/${ws}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      toast('Role updated', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
    }
  }
  async function removeMember(userId: string) {
    try {
      await apiFetch(`/workspaces/${ws}/members/${userId}`, { method: 'DELETE' });
      toast('Member removed', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
    }
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const err = required(inviteEmail) ?? isEmail(inviteEmail);
    setInviteErr(err);
    if (err) return;
    try {
      await apiFetch(`/workspaces/${ws}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      toast(`Invitation sent to ${inviteEmail}`, 'success');
      setInviteEmail('');
      setShowInvite(false);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
    }
  }
  async function revokeInvite(id: string) {
    try {
      await apiFetch(`/workspaces/${ws}/invitations/${id}`, { method: 'DELETE' });
      toast('Invitation revoked', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
    }
  }
  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (required(keyName)) return;
    try {
      const res = await apiFetch<{ token: string }>(`/workspaces/${ws}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ name: keyName }),
      });
      setNewKey(res.token);
      setKeyName('');
      toast('Token created — copy it now', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
    }
  }
  async function revokeKey(id: string) {
    try {
      await apiFetch(`/workspaces/${ws}/api-keys/${id}`, { method: 'DELETE' });
      toast('Token revoked', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed', 'error');
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">
            Team management
          </h1>
          <p className="mb-7 mt-1.5 text-sm text-fg3">
            Invite your team and manage their workspace access roles.
          </p>
        </div>
        {myRole === 'owner' && (
          <div className="flex items-center gap-2">
            <Link
              href="/access"
              className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="7" rx="1.3" stroke="var(--accfg)" strokeWidth="1.2" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="var(--accfg)" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Access control
            </Link>
            <Link
              href="/audit"
              className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l5.5 2.2v3.6c0 3.3-2.3 5.4-5.5 6.7-3.2-1.3-5.5-3.4-5.5-6.7V3.7L8 1.5Z" stroke="var(--accfg)" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Audit log
            </Link>
          </div>
        )}
      </div>

      {/* toolbar */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex max-w-[320px] flex-1 items-center gap-2 rounded-[9px] border border-inputbd bg-card px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.2" stroke="var(--fg3)" strokeWidth="1.2" />
            <path d="M10.5 10.5L14 14" stroke="var(--fg3)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter members…"
            className="flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg3"
          />
        </div>
        {canInvite && (
          <Button className="ml-auto" onClick={() => setShowInvite((v) => !v)}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Invite member
          </Button>
        )}
      </div>

      {showInvite && (
        <form
          onSubmit={invite}
          noValidate
          className="mb-5 flex items-end gap-2 rounded-[14px] border border-line bg-card p-4"
        >
          <div className="flex-1">
            <Input
              label="Invite by email"
              type="email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="teammate@company.com"
              error={inviteErr}
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="h-[42px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
          >
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
            <option value="owner">owner</option>
          </select>
          <Button type="submit" className="h-[42px]">
            Send invite
          </Button>
        </form>
      )}

      {/* members table */}
      <div className="mb-9 overflow-x-auto rounded-[14px] border border-line bg-card">
        <div className="min-w-[640px]">
        <div className="flex items-center border-b border-line bg-panel px-5 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="flex-1">Member</span>
          <span className="w-[150px]">Role</span>
          <span className="w-[150px]">Access scope</span>
          <span className="w-[130px]">Status</span>
          <span className="w-[60px]" />
        </div>

        {shownMembers.map((m) => (
          <div
            key={m.userId}
            className="flex items-center border-b border-line2 px-5 py-[15px] transition hover:bg-rowhover"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 text-[13px] font-semibold text-white">
                {initials(m.name)}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-fg">{m.name}</div>
                <div className="text-[12.5px] text-fg3">{m.email}</div>
              </div>
            </div>
            <div className="w-[150px]">
              {isOwner ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value)}
                  className="rounded-[7px] border border-capbd bg-capbg px-2 py-1.5 text-[12.5px] text-fg2"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="text-[13px] capitalize text-fg2">{m.role}</span>
              )}
            </div>
            <span className="w-[150px] text-[13px] text-fg3">Entire workspace</span>
            <div className="w-[130px]">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-[3px] text-[12px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
            </div>
            <div className="flex w-[60px] justify-end">
              {isOwner && (
                <button
                  onClick={() => removeMember(m.userId)}
                  className="text-[12px] text-fg3 transition hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {/* pending invitations as rows */}
        {invites.map((i) => (
          <div
            key={i.id}
            className="flex items-center border-b border-line2 px-5 py-[15px]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-9 w-9 flex-none rounded-full border border-dashed border-capbd" />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-fg">{i.email}</div>
                <div className="text-[12.5px] text-fg3">Invitation sent</div>
              </div>
            </div>
            <span className="w-[150px] text-[13px] capitalize text-fg3">{i.role}</span>
            <span className="w-[150px] text-[13px] text-fg3">Entire workspace</span>
            <div className="w-[130px]">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-[3px] text-[12px] font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Pending invite
              </span>
            </div>
            <div className="flex w-[60px] justify-end">
              <button
                onClick={() => revokeInvite(i.id)}
                className="text-[12px] text-fg3 transition hover:text-red-400"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
        </div>
      </div>

      {/* CI/CD tokens */}
      {isOwner && (
        <>
          <div className="mb-3.5 flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="6.5" r="3" stroke="var(--fg3)" strokeWidth="1.3" />
              <path d="M7.7 8.4L13 13.7M11 11.7l1.2-1.2" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="text-[15px] font-semibold text-fg">
              CI/CD deployment tokens
            </span>
          </div>

          <div className="grid gap-3 rounded-[14px] border border-line bg-card p-5">
            <form onSubmit={createKey} noValidate className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Token name"
                  value={keyName}
                  onChange={setKeyName}
                  placeholder="Jenkins CI"
                />
              </div>
              <Button type="submit" className="h-[42px]">
                Create token
              </Button>
            </form>

            {newKey && (
              <p className="break-all rounded-lg border border-capbd bg-accsoft px-3 py-2 font-mono text-xs text-accfg">
                {newKey}
                <span className="mt-1 block text-fg3">
                  Copy now — it won&apos;t be shown again.
                </span>
              </p>
            )}

            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 rounded-[10px] border border-line2 px-3.5 py-3"
              >
                <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] border border-inputbd bg-capbg">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="5.5" cy="6.5" r="3" stroke="var(--accfg)" strokeWidth="1.3" />
                    <path d="M7.7 8.4L13 13.7M11 11.7l1.2-1.2" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[14px] text-fg2">{k.keyPrefix}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg3">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: k.revokedAt ? '#ef4444' : '#10b981' }}
                    />
                    {k.name}
                    {k.revokedAt ? ' · revoked' : ''}
                  </div>
                </div>
                {!k.revokedAt && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="flex-none rounded-lg border border-red-500/35 px-3.5 py-[7px] text-[13px] font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
