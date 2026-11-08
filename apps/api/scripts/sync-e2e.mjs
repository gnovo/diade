/**
 * End-to-end sync checks against a running API (wrangler dev or deployed Worker).
 *
 * Usage (both accounts must already exist and be in the same space, or the script
 * will join B with A's invite code):
 *   DIADE_API_URL=http://localhost:8787 \
 *   DIADE_E2E_A_EMAIL=... DIADE_E2E_A_PASSWORD=... \
 *   DIADE_E2E_B_EMAIL=... DIADE_E2E_B_PASSWORD=... \
 *   node scripts/sync-e2e.mjs
 *
 * It writes real rows to the database it is pointed at. Use a development database.
 */
// Uses node:http rather than fetch: undici adds browser Sec-Fetch headers, which Better Auth's
// origin check rejects for auth routes. Native clients (React Native) send neither header.
const signIn = (email, password) =>
  new Promise((resolve, reject) => {
    const url = new URL(
      '/api/auth/sign-in/email',
      process.env.DIADE_API_URL ?? 'http://localhost:8787',
    );
    const body = JSON.stringify({ email, password });
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200)
            return reject(new Error(`sign-in failed for ${email}: ${res.statusCode}`));
          resolve(JSON.parse(data).token);
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};

import { randomUUID } from 'node:crypto';
import http from 'node:http';

const B = process.env.DIADE_API_URL ?? 'http://localhost:8787';
const tokA = await signIn(env('DIADE_E2E_A_EMAIL'), env('DIADE_E2E_A_PASSWORD'));
const tokB = await signIn(env('DIADE_E2E_B_EMAIL'), env('DIADE_E2E_B_PASSWORD'));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};
const api = async (tok, path, body, method = body ? 'POST' : 'GET') => {
  const res = await fetch(B + path, {
    method,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};
const mut = (entity, operation, recordId, payload = {}) => ({
  id: randomUUID(),
  entity,
  operation,
  recordId,
  payload,
  clientTimestamp: Date.now(),
});

// Space: A already created it; B joins with the invite code.
const me = await api(tokA, '/api/spaces/current');
const code = me.json.data.space.inviteCode;
const join = await api(tokB, '/api/spaces/join', { inviteCode: code });
const bSpace = await api(tokB, '/api/spaces/current');
const alreadyMember = bSpace.json.data?.space?.id === me.json.data.space.id;
check(
  'partner joins with invite code (or already a member)',
  join.status === 200 || alreadyMember,
  `status ${join.status}`,
);

const sharedEv = randomUUID(),
  personalTask = randomUUID(),
  sharedList = randomUUID();
const start = new Date(Date.now() + 3600e3).toISOString();
const end = new Date(Date.now() + 7200e3).toISOString();

// A pushes: a shared event, a personal task, a shared list with one item.
const itemId = randomUUID();
const push1 = await api(tokA, '/api/sync/push', {
  mutations: [
    mut('events', 'INSERT', sharedEv, {
      title: 'Dinner',
      startAt: start,
      endAt: end,
      visibility: 'shared',
      category: 'general',
    }),
    mut('tasks', 'INSERT', personalTask, {
      title: 'Secret gift',
      visibility: 'personal',
      assigneeId: null,
    }),
    mut('lists', 'INSERT', sharedList, { name: 'Groceries', category: 'groceries' }),
  ],
});
check(
  'A push of valid inserts is applied',
  push1.status === 200 && push1.json.data.rejectedMutations.length === 0,
  JSON.stringify(push1.json.data?.rejectedMutations),
);

const push2 = await api(tokA, '/api/sync/push', {
  mutations: [mut('list_items', 'INSERT', itemId, { listId: sharedList, name: 'Oat milk' })],
});
check(
  'A push of list item into own list is applied',
  push2.json.data.rejectedMutations.length === 0,
);

// B pulls: sees shared records, never A's personal task.
const pullB = await api(tokB, '/api/sync/pull');
const bTitles = [...pullB.json.data.events, ...pullB.json.data.tasks].map((r) => r.title);
check(
  'partner sees shared event',
  pullB.json.data.events.some((e) => e.id === sharedEv),
);
check(
  'partner does NOT see personal task',
  !pullB.json.data.tasks.some((t) => t.id === personalTask),
  `titles: ${bTitles}`,
);
check(
  'partner sees shared list item',
  pullB.json.data.listItems.some((i) => i.id === itemId),
);

// B tries to edit and delete A's personal task: must be FORBIDDEN, and must not change it.
const forbid = await api(tokB, '/api/sync/push', {
  mutations: [
    mut('tasks', 'UPDATE', personalTask, { title: 'Hacked' }),
    mut('tasks', 'DELETE', personalTask),
  ],
});
const codes = forbid.json.data.rejectedMutations.map((r) => r.code);
check(
  'partner edit/delete of personal task is FORBIDDEN',
  codes.length === 2 && codes.every((c) => c === 'FORBIDDEN'),
  codes.join(','),
);
const pullA = await api(tokA, '/api/sync/pull');
check(
  'personal task untouched after forbidden attempts',
  pullA.json.data.tasks.some(
    (t) => t.id === personalTask && t.title === 'Secret gift' && !t.deletedAt,
  ),
);

// Invalid payload is rejected with INVALID_PAYLOAD and does not block the batch.
const badId = randomUUID();
const mixed = await api(tokB, '/api/sync/push', {
  mutations: [
    mut('events', 'INSERT', badId, { title: '', startAt: 'soon' }),
    mut('tasks', 'INSERT', randomUUID(), {
      title: 'Water plants',
      assigneeId: join.json.data?.space?.members?.[0]?.userId ?? null,
    }),
  ],
});
const mixCodes = mixed.json.data.rejectedMutations.map((r) => r.code);
check(
  'invalid payload rejected as INVALID_PAYLOAD',
  mixCodes.includes('INVALID_PAYLOAD'),
  mixCodes.join(','),
);
check(
  'valid mutation in same batch still applied',
  mixed.json.data.processedCount === 1,
  `processed ${mixed.json.data.processedCount}`,
);

// Idempotency: resending an applied mutation is a no-op and reports applied.
const dupeM = mut('tasks', 'INSERT', randomUUID(), { title: 'Once only' });
await api(tokA, '/api/sync/push', { mutations: [dupeM] });
const again = await api(tokA, '/api/sync/push', { mutations: [dupeM] });
check(
  'retry of applied mutation is idempotent',
  again.json.data.appliedMutationIds.includes(dupeM.id) &&
    again.json.data.rejectedMutations.length === 0,
);

// Delta pull: nothing changed since cursor should return no shared rows.
const cursor = pullA.json.data.cursor;
await new Promise((r) => setTimeout(r, 50));
const delta = await api(tokA, `/api/sync/pull?since=${encodeURIComponent(cursor)}`);
check(
  'delta pull after cursor returns only new changes',
  delta.json.data.events.length === 0 &&
    delta.json.data.tasks.every((t) => t.title === 'Once only' || t.updatedAt > cursor),
);

// Field-level merge: B checks an item while A edits the event title; both survive.
await api(tokB, '/api/sync/push', {
  mutations: [mut('list_items', 'UPDATE', itemId, { isChecked: true })],
});
await api(tokA, '/api/sync/push', {
  mutations: [mut('events', 'UPDATE', sharedEv, { title: 'Dinner (moved)' })],
});
const final = await api(tokB, '/api/sync/pull');
const ev = final.json.data.events.find((e) => e.id === sharedEv);
const it = final.json.data.listItems.find((i) => i.id === itemId);
check(
  'concurrent field edits both survive',
  ev?.title === 'Dinner (moved)' && it?.isChecked === true,
);

console.log(failures === 0 ? '\nALL SYNC CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
