#!/usr/bin/env node
'use strict';

/**
 * The server monitor. Run every five minutes by reviewslip-monitor.timer.
 *
 * Gathers readings — the services, the two apps, the public site, Postgres,
 * disk, memory, swap, load, certificates, the last backup — hands them to
 * monitorrules.js, emails what it says to (MONITOR_EMAIL, default
 * info@reviewslip.com), and writes the readings where the staff Server page
 * reads them.
 *
 * A separate process on a timer rather than a loop inside the app, because the
 * app being down is one of the things it has to report.
 *
 *   node scripts/monitor.js               a normal run
 *   node scripts/monitor.js --print       print readings and problems, send nothing, save nothing
 *   node scripts/monitor.js --test-email  send one email now, to check delivery
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const tls = require('tls');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');
require(path.join(APP_DIR, 'node_modules', 'dotenv')).config({ path: path.join(APP_DIR, '.env') });

const rules = require(path.join(APP_DIR, 'monitorrules'));
const pgstats = require(path.join(APP_DIR, 'pgstats'));
const mailer = require(path.join(APP_DIR, 'mailer'));

const TO = String(process.env.MONITOR_EMAIL || 'info@reviewslip.com').trim();
const STATE_FILE = process.env.MONITOR_STATE || '/var/lib/reviewslip-monitor/state.json';
const DOMAIN = String(process.env.BASE_DOMAIN || 'reviewslip.com').trim();
const VENUE = String(process.env.MONITOR_VENUE || 'baanponglodge').trim();
const SERVICES = (process.env.MONITOR_SERVICES || 'reviewslip,reviewslip-site,nginx,postgresql')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const LOCAL = DOMAIN === 'localhost' || DOMAIN.endsWith('.localhost');

const args = new Set(process.argv.slice(2));

/* ---------------------------------------------------------------- helpers */

function run(cmd, list) {
  try {
    return { ok: true, out: execFileSync(cmd, list, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    // systemctl answers "inactive" with a non-zero exit and still prints it.
    return { ok: false, out: String(err.stdout || ''), error: err.code === 'ENOENT' ? 'not installed' : String(err.message).split('\n')[0] };
  }
}

async function timed(name, url, { json = false } = {}) {
  const at = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
    const body = json ? await res.json().catch(() => null) : null;
    await (json ? null : res.arrayBuffer().catch(() => null));
    // A redirect is an answer: the apex sends / to its default language.
    const ok = res.status < 400;
    return { name, ok, status: res.status, ms: Date.now() - at, body };
  } catch (err) {
    return { name, ok: false, status: 0, ms: Date.now() - at, error: err.name === 'TimeoutError' ? 'timed out' : String(err.cause?.code || err.message) };
  }
}

/* --------------------------------------------------------------- readings */

function services() {
  if (process.platform !== 'linux') return [];
  return SERVICES.map((name) => {
    const r = run('systemctl', ['is-active', name]);
    return { name, state: (r.out.trim() || r.error || 'unknown').split('\n')[0] };
  });
}

function meminfo() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (key) => Number((text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1]);
    return { total: kb('MemTotal'), available: kb('MemAvailable'), swapTotal: kb('SwapTotal'), swapFree: kb('SwapFree') };
  } catch {
    return null;
  }
}

function system() {
  const mem = meminfo();
  let disk = null;
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    disk = { usedPct: Math.round(((total - free) / total) * 100), freeGb: Math.round((free / 1024 ** 3) * 10) / 10 };
  } catch {
    // Not every platform has statfs; the rest still reads.
  }
  return {
    diskUsedPct: disk ? disk.usedPct : null,
    diskFreeGb: disk ? disk.freeGb : null,
    memoryTotalMb: mem ? Math.round(mem.total / 1024) : Math.round(os.totalmem() / 1024 ** 2),
    memoryAvailablePct: mem ? Math.round((mem.available / mem.total) * 100) : null,
    swapTotalMb: mem ? Math.round(mem.swapTotal / 1024) : null,
    swapUsedPct: mem && mem.swapTotal ? Math.round(((mem.swapTotal - mem.swapFree) / mem.swapTotal) * 100) : null,
    load1: process.platform === 'win32' ? null : os.loadavg()[0],
    cores: os.cpus().length,
    uptimeHours: Math.round(os.uptime() / 3600),
  };
}

async function http() {
  const checks = [
    timed('Review app', 'http://127.0.0.1:3000/healthz', { json: true }),
    timed('Website', 'http://127.0.0.1:3001/api/health', { json: true }),
  ];
  // Through nginx and TLS, the way guests arrive. Not on a laptop.
  if (!LOCAL) {
    checks.push(timed(`https://${DOMAIN}`, `https://${DOMAIN}/`));
    checks.push(timed(`https://${VENUE}.${DOMAIN}`, `https://${VENUE}.${DOMAIN}/healthz`));
  }
  return Promise.all(checks);
}

async function postgres() {
  const { Client } = require(path.join(APP_DIR, 'node_modules', 'pg'));
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    application_name: 'reviewslip-monitor',
  });
  try {
    await client.connect();
    // In turn on the one connection: pg queues concurrent queries on a client
    // and is deprecating it.
    const { rows } = await client.query(`
      SELECT current_setting('max_connections')::int AS max_connections,
             (SELECT coalesce(max(extract(epoch FROM now() - query_start)), 0)
                FROM pg_stat_activity
               WHERE state = 'active' AND pid <> pg_backend_pid()
                 AND backend_type = 'client backend') AS longest_query,
             (SELECT coalesce(max(extract(epoch FROM now() - state_change)), 0)
                FROM pg_stat_activity WHERE state LIKE 'idle in transaction%') AS idle_tx,
             pg_database_size(current_database()) AS size,
             (SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1)
                FROM pg_stat_database) AS cache_hit
    `);
    const breakdown = await pgstats.connections(client);
    const databases = await pgstats.databases(client);
    const tables = await pgstats.tables(client);
    const r = rows[0];
    return {
      ok: true,
      maxConnections: r.max_connections,
      // Client connections only, not counting this check's own: Postgres's
      // background workers are listed apart in the breakdown.
      connections: breakdown.total,
      breakdown,
      databases,
      tables,
      longestQuerySeconds: Math.round(Number(r.longest_query)),
      idleInTransactionSeconds: Math.round(Number(r.idle_tx)),
      sizeMb: Math.round(Number(r.size) / 1024 ** 2),
      cacheHitPct: Number(r.cache_hit ?? 100),
    };
  } catch (err) {
    return { ok: false, error: String(err.message).slice(0, 200) };
  } finally {
    await client.end().catch(() => {});
  }
}

function certificate(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return resolve({ host, ok: false, error: 'no certificate' });
      const daysLeft = Math.floor((Date.parse(cert.valid_to) - Date.now()) / 86_400_000);
      resolve({ host, ok: true, daysLeft, validTo: new Date(cert.valid_to).toISOString() });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ host, ok: false, error: 'timed out' });
    });
    socket.on('error', (err) => resolve({ host, ok: false, error: err.code || err.message }));
  });
}

/**
 * When the nightly backup last finished, and how.
 *
 * Read from systemd: the exit time is given as microseconds since boot, which
 * is turned into a clock time here because the human-readable form systemd
 * prints is not one Date can be trusted to parse.
 */
function backup() {
  if (process.platform !== 'linux') return null;
  const r = run('systemctl', ['show', 'reviewslip-backup.service', '--property=LoadState,Result,ExecMainExitTimestampMonotonic']);
  const props = Object.fromEntries(r.out.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (props.LoadState !== 'loaded') return { installed: false };
  const mono = Number(props.ExecMainExitTimestampMonotonic) || 0;
  const boot = Date.now() - os.uptime() * 1000;
  return {
    installed: true,
    result: mono ? props.Result : null,
    hoursAgo: mono ? (Date.now() - (boot + mono / 1000)) / 3_600_000 : null,
  };
}

/** Each service's memory, restarts and how long it has been up, from systemd. */
function serviceDetail(name) {
  const r = run('systemctl', ['show', name, '--property=MemoryCurrent,NRestarts,ActiveEnterTimestampMonotonic,MainPID']);
  const props = Object.fromEntries(r.out.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const mono = Number(props.ActiveEnterTimestampMonotonic) || 0;
  const memory = Number(props.MemoryCurrent);
  return {
    memoryMb: Number.isFinite(memory) && memory > 0 && memory < 2 ** 60 ? Math.round(memory / 1024 ** 2) : null,
    restarts: Number(props.NRestarts) || 0,
    upHours: mono ? Math.round(((os.uptime() * 1e6 - mono) / 3.6e9) * 10) / 10 : null,
  };
}

/**
 * The processes using the most memory, grouped by what they are: Postgres is
 * a dozen processes and the page should say "Postgres", not list each one.
 */
function processes() {
  if (process.platform !== 'linux') return [];
  const r = run('ps', ['-eo', 'pid=,rss=,pcpu=,comm=,args=']);
  const groups = new Map();
  for (const line of r.out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, rss, cpu, comm, args] = m;
    // This check itself: a second old, so ps's CPU figure (CPU time over its
    // age) reads as 100%+ from start-up alone. It is gone once it has written.
    if (Number(pid) === process.pid) continue;
    // By the command line, not the name: newer Node calls its main thread
    // "MainThread", which is what ps shows as the name.
    const label = /reviewslip-site|next-server/.test(args) ? 'Website (Next.js)'
      : /monitor\.js/.test(args) ? 'Server monitor'
      : /\bnode\b.*server\.js/.test(args) ? 'Review app'
      : comm.startsWith('postgres') ? 'Postgres'
      : comm.startsWith('nginx') ? 'nginx'
      : comm;
    const g = groups.get(label) || { name: label, memoryMb: 0, cpuPct: 0, count: 0 };
    g.memoryMb += Number(rss) / 1024;
    g.cpuPct += Number(cpu);
    g.count += 1;
    groups.set(label, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, memoryMb: Math.round(g.memoryMb), cpuPct: Math.round(g.cpuPct * 10) / 10 }))
    .sort((a, b) => b.memoryMb - a.memoryMb)
    .slice(0, 8);
}

/**
 * Where the disk goes, for the folders this server is about. du prints what it
 * can read and skips the rest (Postgres's own folder is not ours to read; its
 * size comes from the database breakdown instead).
 */
function diskBreakdown() {
  if (process.platform !== 'linux') return [];
  const paths = ['/opt/reviewslip', '/opt/reviewslip-site', '/var/log', '/swapfile', '/var/lib/postgresql'];
  const r = run('du', ['-sm', ...paths]);
  return r.out
    .trim()
    .split('\n')
    .map((l) => l.match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(([, mb, p]) => ({ path: p, mb: Number(mb) }))
    .sort((a, b) => b.mb - a.mb);
}

async function readings() {
  const [web, db, certs] = await Promise.all([
    http(),
    postgres(),
    LOCAL ? [] : Promise.all([certificate(DOMAIN), certificate(`${VENUE}.${DOMAIN}`)]),
  ]);
  const app = web.find((w) => w.name === 'Review app')?.body ?? null;
  return {
    at: new Date().toISOString(),
    host: os.hostname(),
    services: services().map((s) => ({ ...s, ...serviceDetail(s.name) })),
    processes: processes(),
    disk: diskBreakdown(),
    http: web.map(({ body: _body, ...rest }) => rest),
    app,
    system: system(),
    postgres: db,
    certificates: certs,
    backup: backup(),
  };
}

/* ------------------------------------------------------------------ state */

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

/* -------------------------------------------------------------------- run */

async function main() {
  if (args.has('--test-email')) {
    const sent = await mailer.send({
      to: TO,
      subject: `[Reviewslip ${os.hostname()}] Monitor test`,
      text: 'This is a test from reviewslip-monitor. If you are reading it, problem emails will reach this inbox.',
    });
    console.log(sent.sent ? `Sent a test email to ${TO}.` : `Not sent: ${sent.reason}`);
    process.exit(sent.sent ? 0 : 1);
  }

  const now = Date.now();
  const r = await readings();
  const problems = rules.evaluate(r);

  if (args.has('--print')) {
    console.log(JSON.stringify({ readings: r, problems }, null, 2));
    return;
  }

  const previous = readState();
  const step = rules.transition(previous, problems, now);
  const daily = rules.dailyDue(previous, now);
  const open = Object.values(step.state.open);
  const email = rules.composeEmail({ ...step, open, daily, readings: r, now, host: os.hostname() });

  let mailed = null;
  if (email) {
    mailed = await mailer.send({ to: TO, ...email });
    if (!mailed.sent) console.error(`monitor: could not email ${TO}: ${mailed.reason}`);
  }

  // Only marked as told when the email went: a problem whose email failed is
  // tried again next run rather than silently counted as reported.
  const state = mailed && !mailed.sent ? { ...previous, open: previous.open ?? {} } : step.state;
  if (daily && (!email || mailed?.sent)) state.dailySentFor = daily;

  // A day of readings at five-minute steps, for the Server page's trend lines.
  // Only the numbers a trend is drawn from: the full readings are kept once.
  const http = (name) => r.http.find((h) => h.name === name);
  const sample = {
    t: now,
    disk: r.system.diskUsedPct,
    memory: r.system.memoryAvailablePct,
    swap: r.system.swapUsedPct,
    load: r.system.load1 === null ? null : Math.round(r.system.load1 * 100) / 100,
    connections: r.postgres.ok ? r.postgres.connections : null,
    dbMs: r.app?.database?.ms ?? null,
    appMs: http('Review app')?.ok ? http('Review app').ms : null,
    siteMs: http('Website')?.ok ? http('Website').ms : null,
    failures: r.app?.failures5m ?? null,
  };
  const history = [...(previous.history ?? []), sample].slice(-288);

  writeState({ ...state, lastRun: new Date(now).toISOString(), readings: r, problems, history });

  const line = problems.length ? problems.map((p) => `${p.severity}: ${p.summary}`).join('; ') : 'all good';
  const told = !email ? '' : mailed?.sent ? ` — emailed "${email.subject}"` : ' — email NOT sent, will retry next run';
  console.log(`monitor: ${line}${told}`);
}

main().catch((err) => {
  console.error('monitor: failed:', err);
  process.exit(1);
});
