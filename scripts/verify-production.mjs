#!/usr/bin/env node
// Answers one question: is the commit I am looking at the commit Production is running?
//
// A push is not a deploy. This checks the four links of the chain that
// CLAUDE.md defines, and exits non-zero if any of them is broken:
//
//   1. Vercel has a deployment with target=production
//   2. it came from Git, at the expected commit SHA
//   3. the production alias points at it
//   4. the live routes answer the way this build should answer
//
// Auth: VERCEL_TOKEN, or the Vercel CLI's own login (`vercel login`).

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALIAS = process.env.PRODUCTION_ALIAS ?? 'https://athlytica-systems-engine.vercel.app';

// Expected HTTP status per route for a current build. A probe is only worth
// running if its OLD answer differs from its NEW one — see CLAUDE.md.
const PROBES = [
  ['/api/v1/public/nrhl', 200],
  ['/api/v1/public/packages', 200],
  ['/register', 200],
  ['/api/v1/onboarding/google-forms', 410], // 405 = pre-4cf7787 build still live
  ['/api/v1/biz/check-status', 400], // fail-closed: no input
  ['/api/v1/biz/cash-watcher', 403], // fail-closed: no authorization
  ['/api/v1/workspace/dashboard', 401], // fail-closed: no session
];

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  // The CLI stores its token per-platform; try the three it uses.
  const candidates = [
    join(homedir(), 'AppData/Roaming/xdg.data/com.vercel.cli/auth.json'),
    join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
    join(homedir(), '.local/share/com.vercel.cli/auth.json'),
  ];
  for (const p of candidates) {
    try {
      const t = JSON.parse(readFileSync(p, 'utf8')).token;
      if (t) return t;
    } catch {}
  }
  throw new Error('No Vercel credentials. Set VERCEL_TOKEN or run `vercel login`.');
}

const { projectId, orgId } = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
const res = await fetch(
  `https://api.vercel.com/v9/projects/${projectId}?teamId=${orgId}`,
  { headers: { Authorization: `Bearer ${token()}` } },
);
if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
const project = await res.json();

const expected = execSync('git rev-parse HEAD').toString().trim();
const prod = project.targets?.production;
const sha = prod?.meta?.githubCommitSha ?? null;
const branch = project.link?.productionBranch ?? null;

const checks = [
  ['production branch is main', branch === 'main', branch],
  ['a production deployment exists', !!prod, prod?.id ?? 'none'],
  ['it built successfully', prod?.readyState === 'READY', prod?.readyState],
  ['it came from Git, not a CLI upload', prod?.source === 'git', prod?.source],
  ['it is the commit checked out here', sha === expected, `${sha} vs HEAD ${expected}`],
  [
    'the production alias points at it',
    (prod?.alias ?? []).some((a) => ALIAS.endsWith(a)),
    (prod?.alias ?? []).join(', ') || 'none',
  ],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`);
}

console.log('');
for (const [path, want] of PROBES) {
  let got;
  try {
    got = (await fetch(ALIAS + path, { redirect: 'manual' })).status;
  } catch (e) {
    got = e.message;
  }
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path}  want ${want}, got ${got}`);
}

console.log('');
console.log(failed === 0 ? 'DEPLOYED: production is running this commit.' : `${failed} check(s) failed — this commit is NOT deployed.`);
process.exit(failed === 0 ? 0 : 1);
