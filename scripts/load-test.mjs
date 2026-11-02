#!/usr/bin/env node
// Load test (pilot readiness). Signs in demo principals, then has N virtual users each loop over the main read
// routes for D seconds, plus one Ask TIGERIS question per loop. Reports per-route count, errors, p50/p95/p99 ms.
// Usage: node scripts/load-test.mjs [baseUrl] [users] [seconds]   (needs DEMO_SIGN_IN on, so local/staging only)
const base = process.argv[2] ?? 'http://127.0.0.1:4000';
const users = Number(process.argv[3] ?? 25);
const seconds = Number(process.argv[4] ?? 60);

const principals = (await (await fetch(`${base}/api/auth/demo-principals`)).json()).principals;
const signIn = async (p) => {
  const res = await fetch(`${base}/api/auth/demo-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principalId: p.id }),
  });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
};
const cookies = await Promise.all(principals.map(signIn));
const caseKey = (await (await fetch(`${base}/api/cases`, { headers: { cookie: cookies[0] } })).json())[0]
  ?.key;

const routes = [
  ['overview', 'GET', '/api/command-centre'],
  ['cases', 'GET', '/api/cases'],
  ...(caseKey ? [['case', 'GET', `/api/cases/${caseKey}`]] : []),
  ['signals', 'GET', '/api/signals'],
  ['sectors', 'GET', '/api/sectors'],
  ['interventions', 'GET', '/api/interventions'],
  ['decisions', 'GET', '/api/decisions'],
  ['ask', 'POST', '/api/ask', { question: 'What is the Hormuz exposure of our energy holdings?' }],
];
const stats = Object.fromEntries(routes.map(([n]) => [n, { ms: [], errors: 0, codes: {} }]));

const end = Date.now() + seconds * 1000;
async function user(i) {
  const cookie = cookies[i % cookies.length];
  while (Date.now() < end) {
    for (const [name, method, path, body] of routes) {
      const t = performance.now();
      try {
        const res = await fetch(base + path, {
          method,
          headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        await res.arrayBuffer();
        const s = stats[name];
        s.codes[res.status] = (s.codes[res.status] ?? 0) + 1;
        if (res.status >= 500) s.errors++;
        s.ms.push(performance.now() - t);
      } catch {
        stats[name].errors++;
      }
    }
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: users }, (_, i) => user(i)));
const took = (Date.now() - started) / 1000;

const pct = (a, p) =>
  a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))].toFixed(0) : '-';
let total = 0;
console.log(`base ${base}, ${users} users, ${took.toFixed(0)} s, ${principals.length} principals`);
console.log(
  'route'.padEnd(14),
  'reqs'.padStart(6),
  '5xx'.padStart(5),
  'p50'.padStart(6),
  'p95'.padStart(6),
  'p99'.padStart(6),
  ' codes',
);
for (const [name, s] of Object.entries(stats)) {
  s.ms.sort((a, b) => a - b);
  total += s.ms.length;
  console.log(
    name.padEnd(14),
    String(s.ms.length).padStart(6),
    String(s.errors).padStart(5),
    pct(s.ms, 50).padStart(6),
    pct(s.ms, 95).padStart(6),
    pct(s.ms, 99).padStart(6),
    ' ' + JSON.stringify(s.codes),
  );
}
console.log(`total ${total} requests, ${(total / took).toFixed(1)} req/s`);
