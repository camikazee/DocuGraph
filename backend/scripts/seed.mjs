#!/usr/bin/env node
/**
 * Fixtura developerska — zasila działający backend kompletnym, realistycznym
 * stanem przez publiczne API (działa lokalnie i w Dockerze). Po seedzie masz:
 *   • 3 konta (owner/editor/viewer, hasło Demo1234!) w jednym workspace,
 *   • zestaw dokumentów w folderach z linkami (graf + struktura + wyszukiwarka),
 *   • celowo zepsuty link (raport „Broken links"),
 *   • 2 assety na domyślnym wolumenie lokalnym: osadzony (referenced) i unused.
 *
 * Użycie:
 *   docker compose up -d            # backend na :3000
 *   cd backend && npm run seed
 *   # albo: API_URL=http://localhost:3000/api/v1 node scripts/seed.mjs
 *
 * Skrypt jest idempotentny — można go puszczać wielokrotnie.
 */
const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const PASSWORD = 'Demo1234!';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, json };
}

async function registerOrLogin(email, name) {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { email, name, password: PASSWORD },
  });
  if (reg.status === 201) return reg.json.accessToken;
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  if (login.status === 201) return login.json.accessToken;
  throw new Error(`Auth failed for ${email}: ${login.status}`);
}

async function workspaceId(token) {
  const me = await api('/auth/me', { token });
  return me.json.workspaces[0].id;
}

async function isMember(token, wsId) {
  const me = await api('/auth/me', { token });
  return me.json.workspaces.some((w) => w.id === wsId);
}

async function ensureMember(ownerToken, wsId, email, memberToken, role) {
  if (await isMember(memberToken, wsId)) return;
  const inv = await api(`/workspaces/${wsId}/invitations`, {
    method: 'POST',
    token: ownerToken,
    body: { email, role },
  });
  await api('/invitations/accept', {
    method: 'POST',
    token: memberToken,
    body: { token: inv.json.token },
  });
}

async function upsertDoc(token, wsId, file_path, content_raw) {
  await api(`/workspaces/${wsId}/documents`, {
    method: 'POST',
    token,
    body: { file_path, content_raw },
  });
}

/** Wgrywa asset (multipart). Idempotentnie — zwraca id istniejącego, jeśli jest. */
async function ensureAsset(token, wsId, name, mime, buffer) {
  const existing = await api(`/workspaces/${wsId}/assets`, { token });
  const found = (existing.json ?? []).find((a) => a.name === name);
  if (found) return found.id;

  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime }), name);
  const res = await fetch(`${API}/workspaces/${wsId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Asset upload failed (${name}): ${res.status}`);
  return (await res.json()).id;
}

// --- tiny real binary assets (no external files needed) ---
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SVG_DIAGRAM = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <rect width="240" height="120" rx="10" fill="#0b0f19"/>
  <circle cx="60" cy="60" r="16" fill="#7c3aed"/>
  <circle cx="180" cy="40" r="12" fill="#a78bfa"/>
  <circle cx="170" cy="90" r="12" fill="#a78bfa"/>
  <g stroke="#cbd5e1" stroke-width="2">
    <line x1="60" y1="60" x2="180" y2="40"/>
    <line x1="60" y1="60" x2="170" y2="90"/>
  </g>
</svg>`,
  'utf8',
);

async function main() {
  console.log(`Seeding DocuGraph at ${API} ...`);

  const owner = await registerOrLogin('owner@demo.docugraph', 'Demo Owner');
  const editor = await registerOrLogin('editor@demo.docugraph', 'Demo Editor');
  const viewer = await registerOrLogin('viewer@demo.docugraph', 'Demo Viewer');

  const wsId = await workspaceId(owner);
  await ensureMember(owner, wsId, 'editor@demo.docugraph', editor, 'editor');
  await ensureMember(owner, wsId, 'viewer@demo.docugraph', viewer, 'viewer');

  // --- media: one embedded (referenced), one left unused ---
  const logoId = await ensureAsset(owner, wsId, 'logo.png', 'image/png', PNG_1PX);
  await ensureAsset(owner, wsId, 'diagram.svg', 'image/svg+xml', SVG_DIAGRAM);
  const logoUrl = `${API}/public/workspaces/${wsId}/assets/${logoId}`;

  // --- documents: folders + cross-links (graph/structure/search) ---
  const docs = [
    [
      'README.md',
      [
        '---',
        'title: Welcome to DocuGraph',
        'tags: [intro, demo]',
        '---',
        '',
        '# Welcome',
        '',
        'A seeded demo workspace. Start with the [guide](docs/guide.md)',
        'or jump to the [API overview](api/overview.md).',
      ].join('\n'),
    ],
    [
      'docs/guide.md',
      [
        '---',
        'title: User Guide',
        'tags: [guide]',
        '---',
        '',
        '# Guide',
        '',
        // linki są względne do folderu dokumentu (docs/)
        'New here? Read [getting started](getting-started.md), then the',
        '[README](../README.md).',
      ].join('\n'),
    ],
    [
      'docs/getting-started.md',
      '# Getting started\n\nInstall, connect a repo, and your Markdown is indexed.\n',
    ],
    [
      'api/overview.md',
      [
        '---',
        'title: API Overview',
        'tags: [api, reference]',
        '---',
        '',
        '# API Overview',
        '',
        `![architecture](${logoUrl})`,
        '',
        'See [authentication](auth.md) for tokens.',
      ].join('\n'),
    ],
    [
      'api/auth.md',
      [
        '# Authentication',
        '',
        'Back to the [API overview](overview.md).',
        '',
        // celowo zepsuty link → pojawi się w raporcie „Broken links"
        'TODO: document [rate limits](rate-limits.md).',
      ].join('\n'),
    ],
    [
      'CHANGELOG.md',
      '# Changelog\n\n- Initial demo content.\n',
    ],
  ];
  for (const [file_path, content] of docs) {
    await upsertDoc(owner, wsId, file_path, content);
  }

  console.log(`\n✅ Seed complete (${docs.length} docs, 2 assets).`);
  console.log(`   Workspace: ${wsId}`);
  console.log(`   Accounts (password: ${PASSWORD}):`);
  console.log('     • owner@demo.docugraph   (Owner)');
  console.log('     • editor@demo.docugraph  (Editor)');
  console.log('     • viewer@demo.docugraph  (Viewer)');
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
