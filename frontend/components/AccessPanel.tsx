'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/api';
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
  name: string;
  role: string;
}

const LEVELS: AccessLevel[] = ['none', 'read', 'write'];

/** Does a rule's path apply to this file (same longest-prefix logic as backend)? */
function ruleApplies(rulePath: string, filePath: string): boolean {
  return rulePath.endsWith('/')
    ? filePath === rulePath.slice(0, -1) || filePath.startsWith(rulePath)
    : filePath === rulePath;
}

/**
 * Owner-only slide-over to set access for the file currently open in the reader.
 * Targets either the exact file or its parent folder, and lists the rules that
 * already affect this file so the owner sees what's inherited.
 */
export function AccessPanel({
  ws,
  filePath,
  onClose,
}: {
  ws: string;
  filePath: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const parentFolder = filePath.includes('/')
    ? filePath.slice(0, filePath.lastIndexOf('/') + 1)
    : '';

  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [target, setTarget] = useState<'file' | 'folder'>('file');
  const [subjectType, setSubjectType] = useState<SubjectType>('all');
  const [subjectId, setSubjectId] = useState('');
  const [level, setLevel] = useState<AccessLevel>('none');
  const [saving, setSaving] = useState(false);

  const fail = useCallback(
    (err: unknown) =>
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error'),
    [toast],
  );

  const load = useCallback(async () => {
    try {
      const [g, m, r] = await Promise.all([
        accessApi.listGroups(ws),
        apiFetch<Member[]>(`/workspaces/${ws}/members`),
        accessApi.listRules(ws),
      ]);
      setGroups(g);
      setMembers(m);
      setRules(r);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [ws, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  // If there's no parent folder, only the file target makes sense.
  useEffect(() => {
    if (!parentFolder) setTarget('file');
  }, [parentFolder]);

  const subjectOptions = useMemo(() => {
    if (subjectType === 'group')
      return groups.map((g) => ({ id: g.id, label: g.name }));
    if (subjectType === 'user')
      return members.map((m) => ({ id: m.userId, label: `${m.name} (${m.role})` }));
    return [];
  }, [subjectType, groups, members]);

  const affecting = useMemo(
    () => rules.filter((r) => ruleApplies(r.path, filePath)),
    [rules, filePath],
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (subjectType !== 'all' && !subjectId) {
      toast('Pick who this rule applies to', 'error');
      return;
    }
    setSaving(true);
    try {
      setRules(
        await accessApi.upsertRule(ws, {
          path: target === 'folder' ? parentFolder : filePath,
          subjectType,
          subjectId: subjectType === 'all' ? null : subjectId,
          level,
        }),
      );
      setSubjectId('');
      toast('Access rule saved', 'success');
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: AccessRule) {
    try {
      setRules(await accessApi.deleteRule(ws, r.id));
      toast('Rule removed', 'success');
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-[420px] max-w-full flex-col overflow-y-auto border-l border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-fg">Access</h2>
            <p className="mt-0.5 truncate font-mono text-[12px] text-fg3">
              {filePath}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-fg3 transition hover:bg-rowhover hover:text-fg2"
            aria-label="Close"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="p-5 text-[13px] text-fg3">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 p-5">
            {/* add rule */}
            <form onSubmit={save} className="grid gap-3">
              {parentFolder && (
                <div className="grid gap-1 text-[12.5px] text-fg3">
                  Apply to
                  <div className="flex gap-2">
                    {(
                      [
                        ['file', 'This file'],
                        ['folder', `Folder ${parentFolder}`],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTarget(val)}
                        className={`flex-1 truncate rounded-lg border px-3 py-2 text-[12.5px] font-medium transition ${
                          target === val
                            ? 'border-acc bg-accsoft text-accfg'
                            : 'border-capbd bg-capbg text-fg2 hover:border-acc'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="grid gap-1 text-[12.5px] text-fg3">
                Who
                <select
                  value={subjectType}
                  onChange={(e) => {
                    setSubjectType(e.target.value as SubjectType);
                    setSubjectId('');
                  }}
                  className="h-[40px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
                >
                  <option value="all">Everyone</option>
                  <option value="group">Group</option>
                  <option value="user">User</option>
                </select>
              </label>

              {subjectType !== 'all' && (
                <label className="grid gap-1 text-[12.5px] text-fg3">
                  {subjectType === 'group' ? 'Group' : 'User'}
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="h-[40px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
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
                  value={level}
                  onChange={(e) => setLevel(e.target.value as AccessLevel)}
                  className="h-[40px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {levelLabel(l)}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="submit" disabled={saving} className="h-[40px]">
                {saving ? 'Saving…' : 'Save rule'}
              </Button>
            </form>

            {/* rules already affecting this file */}
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                Rules affecting this file
              </div>
              {affecting.length === 0 ? (
                <p className="text-[13px] text-fg3">
                  None — visibility follows each member&apos;s workspace role.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {affecting.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-line2 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] text-fg2">
                          {r.path}
                        </div>
                        <div className="truncate text-[12px] text-fg3">
                          {r.subjectType === 'all'
                            ? 'Everyone'
                            : `${r.subjectType === 'group' ? 'Group' : 'User'} · ${r.subjectName}`}{' '}
                          → {levelLabel(r.level)}
                        </div>
                      </div>
                      <button
                        onClick={() => remove(r)}
                        className="flex-none text-[12px] text-fg3 transition hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/access"
              className="text-[12.5px] text-accfg underline transition hover:opacity-80"
            >
              Manage all groups &amp; rules →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
