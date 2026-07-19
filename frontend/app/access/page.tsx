'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import {
  AccessGroup,
  AccessLevel,
  AccessRule,
  SubjectType,
  accessApi,
  levelLabel,
} from '@/lib/access';

interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
}

const LEVELS: AccessLevel[] = ['none', 'read', 'write'];

function levelBadge(level: AccessLevel) {
  const map: Record<AccessLevel, string> = {
    none: 'border-red-500/30 bg-red-500/10 text-red-400',
    read: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    write: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-[3px] text-[12px] font-medium ${map[level]}`}
    >
      {levelLabel(level)}
    </span>
  );
}

export default function AccessPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const ws = profile?.workspaces[0]?.id;
  const isOwner = profile?.workspaces[0]?.role === 'owner';

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // new-rule form
  const [rulePath, setRulePath] = useState('');
  const [ruleSubjectType, setRuleSubjectType] = useState<SubjectType>('all');
  const [ruleSubjectId, setRuleSubjectId] = useState('');
  const [ruleLevel, setRuleLevel] = useState<AccessLevel>('none');

  const fail = useCallback(
    (err: unknown) =>
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error'),
    [toast],
  );

  const load = useCallback(async () => {
    if (!ws || !isOwner) return;
    try {
      const [m, g, r] = await Promise.all([
        apiFetch<Member[]>(`/workspaces/${ws}/members`),
        accessApi.listGroups(ws),
        accessApi.listRules(ws),
      ]);
      setMembers(m);
      setGroups(g);
      setRules(r);
    } catch (err) {
      fail(err);
    } finally {
      setLoaded(true);
    }
  }, [ws, isOwner, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = groupName.trim();
    if (!name || !ws) return;
    try {
      setGroups(await accessApi.createGroup(ws, name));
      setGroupName('');
      toast(`Group "${name}" created`, 'success');
    } catch (err) {
      fail(err);
    }
  }

  async function deleteGroup(g: AccessGroup) {
    if (!ws) return;
    if (
      !window.confirm(
        `Delete group "${g.name}"? Rules targeting this group are removed too.`,
      )
    )
      return;
    try {
      setGroups(await accessApi.deleteGroup(ws, g.id));
      toast(`Group "${g.name}" deleted`, 'success');
      await load(); // rules may have changed
    } catch (err) {
      fail(err);
    }
  }

  async function toggleMember(g: AccessGroup, userId: string) {
    if (!ws) return;
    const has = g.members.some((m) => m.userId === userId);
    const next = has
      ? g.members.filter((m) => m.userId !== userId).map((m) => m.userId)
      : [...g.members.map((m) => m.userId), userId];
    try {
      setGroups(await accessApi.setGroupMembers(ws, g.id, next));
    } catch (err) {
      fail(err);
    }
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    const path = rulePath.trim();
    if (!path || !ws) return;
    if (ruleSubjectType !== 'all' && !ruleSubjectId) {
      toast('Pick who this rule applies to', 'error');
      return;
    }
    try {
      setRules(
        await accessApi.upsertRule(ws, {
          path,
          subjectType: ruleSubjectType,
          subjectId: ruleSubjectType === 'all' ? null : ruleSubjectId,
          level: ruleLevel,
        }),
      );
      setRulePath('');
      setRuleSubjectId('');
      toast('Rule saved', 'success');
    } catch (err) {
      fail(err);
    }
  }

  async function deleteRule(r: AccessRule) {
    if (!ws) return;
    try {
      setRules(await accessApi.deleteRule(ws, r.id));
      toast('Rule removed', 'success');
    } catch (err) {
      fail(err);
    }
  }

  const subjectOptions = useMemo(() => {
    if (ruleSubjectType === 'group')
      return groups.map((g) => ({ id: g.id, label: g.name }));
    if (ruleSubjectType === 'user')
      return members.map((m) => ({ id: m.userId, label: `${m.name} (${m.role})` }));
    return [];
  }, [ruleSubjectType, groups, members]);

  if (error) {
    return (
      <AppShell>
        <p className="text-fg2">{error}</p>
      </AppShell>
    );
  }

  if (loaded && !isOwner) {
    return (
      <AppShell>
        <h1 className="text-[28px] font-bold tracking-tight text-fg">
          Access control
        </h1>
        <p className="mt-2 text-sm text-fg3">
          Only workspace owners can manage groups and access rules.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">
            Access control
          </h1>
          <p className="mb-7 mt-1.5 max-w-[640px] text-sm text-fg3">
            Grant read or write on a whole folder or a single file. Rules layer
            on top of workspace roles — hide a folder from everyone, then reveal
            one file to a group. The most specific rule wins.
          </p>
        </div>
        <Link
          href="/team"
          className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M10 4l-4 4 4 4" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Team
        </Link>
      </div>

      {/* GROUPS */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-[15px] font-semibold text-fg">Groups</span>
        <span className="text-[13px] text-fg3">
          Named sets of members — e.g. <span className="font-mono">dev</span> and{' '}
          <span className="font-mono">client</span>.
        </span>
      </div>

      <div className="mb-9 grid gap-3 rounded-[14px] border border-line bg-card p-5">
        <form onSubmit={createGroup} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="New group name"
              value={groupName}
              onChange={setGroupName}
              placeholder="dev"
            />
          </div>
          <Button type="submit" className="h-[42px]">
            Create group
          </Button>
        </form>

        {groups.length === 0 && (
          <p className="text-[13px] text-fg3">No groups yet.</p>
        )}

        {groups.map((g) => {
          const open = openGroup === g.id;
          return (
            <div
              key={g.id}
              className="rounded-[10px] border border-line2 px-3.5 py-3"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpenGroup(open ? null : g.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={`flex-none transition ${open ? 'rotate-90' : ''}`}
                  >
                    <path d="M6 4l4 4-4 4" stroke="var(--fg3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[14px] font-semibold text-fg">
                    {g.name}
                  </span>
                  <span className="text-[12.5px] text-fg3">
                    {g.members.length}{' '}
                    {g.members.length === 1 ? 'member' : 'members'}
                  </span>
                </button>
                <button
                  onClick={() => deleteGroup(g)}
                  className="flex-none text-[12px] text-fg3 transition hover:text-red-400"
                >
                  Delete
                </button>
              </div>

              {open && (
                <div className="mt-3 grid gap-1.5 border-t border-line2 pt-3 sm:grid-cols-2">
                  {members.map((m) => {
                    const checked = g.members.some(
                      (x) => x.userId === m.userId,
                    );
                    return (
                      <label
                        key={m.userId}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-rowhover"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(g, m.userId)}
                          className="h-4 w-4 accent-[var(--acc)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] text-fg2">
                            {m.name}
                          </span>
                          <span className="block truncate text-[12px] text-fg3">
                            {m.email}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RULES */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-[15px] font-semibold text-fg">Access rules</span>
        <span className="text-[13px] text-fg3">
          A path ending in <span className="font-mono">/</span> covers a whole
          folder; otherwise it targets one file.
        </span>
      </div>

      <div className="mb-5 grid gap-3 rounded-[14px] border border-line bg-card p-5">
        <form onSubmit={addRule} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Path"
              value={rulePath}
              onChange={setRulePath}
              placeholder="secret/ or secret/pricing.md"
            />
          </div>
          <label className="grid gap-1 text-[12.5px] text-fg3">
            Applies to
            <select
              value={ruleSubjectType}
              onChange={(e) => {
                setRuleSubjectType(e.target.value as SubjectType);
                setRuleSubjectId('');
              }}
              className="h-[42px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
            >
              <option value="all">Everyone</option>
              <option value="group">Group</option>
              <option value="user">User</option>
            </select>
          </label>
          {ruleSubjectType !== 'all' && (
            <label className="grid gap-1 text-[12.5px] text-fg3">
              {ruleSubjectType === 'group' ? 'Group' : 'User'}
              <select
                value={ruleSubjectId}
                onChange={(e) => setRuleSubjectId(e.target.value)}
                className="h-[42px] min-w-[150px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
              >
                <option value="">Select…</option>
                {subjectOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-[12.5px] text-fg3">
            Level
            <select
              value={ruleLevel}
              onChange={(e) => setRuleLevel(e.target.value as AccessLevel)}
              className="h-[42px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="h-[42px]">
            Save rule
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="flex items-center border-b border-line bg-panel px-5 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="flex-1">Path</span>
          <span className="w-[200px]">Applies to</span>
          <span className="w-[110px]">Level</span>
          <span className="w-[60px]" />
        </div>
        {rules.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-fg3">
            No rules yet — every member sees the workspace per their role.
          </div>
        )}
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex items-center border-b border-line2 px-5 py-[13px] transition hover:bg-rowhover"
          >
            <span className="flex-1 truncate font-mono text-[13px] text-fg2">
              {r.path}
              {r.path.endsWith('/') && (
                <span className="ml-2 rounded bg-accsoft px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-accfg">
                  folder
                </span>
              )}
            </span>
            <span className="w-[200px] truncate text-[13px] text-fg2">
              {r.subjectType === 'all' ? (
                'Everyone'
              ) : (
                <>
                  <span className="text-fg3">
                    {r.subjectType === 'group' ? 'Group · ' : 'User · '}
                  </span>
                  {r.subjectName}
                </>
              )}
            </span>
            <span className="w-[110px]">{levelBadge(r.level)}</span>
            <div className="flex w-[60px] justify-end">
              <button
                onClick={() => deleteRule(r)}
                className="text-[12px] text-fg3 transition hover:text-red-400"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
