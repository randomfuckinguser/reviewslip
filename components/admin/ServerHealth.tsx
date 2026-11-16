import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

import PageHeader from "@/components/app-shell/PageHeader";
import { call, sessionToken } from "@/lib/customer";

import styles from "./ServerHealth.module.css";

/* ------------------------------------------------------------------ types */

interface Problem {
  key: string;
  severity: "warning" | "critical";
  summary: string;
  since?: number;
}

interface ConnectionGroup {
  app: string;
  label: string;
  user: string;
  client: string;
  state: string;
  count: number;
  oldestSeconds: number;
}

interface Connections {
  total: number;
  max: number;
  reserved: number;
  byApp: { app: string; label: string; count: number; active: number; idle: number; idleInTransaction: number }[];
  groups: ConnectionGroup[];
  background: { kind: string; count: number }[];
}

interface Sized {
  name: string;
  mb: number;
  rows?: number;
}

interface Readings {
  at: string;
  host: string;
  services: { name: string; state: string; memoryMb?: number | null; restarts?: number; upHours?: number | null }[];
  http: { name: string; ok: boolean; status: number; ms: number; error?: string }[];
  system: {
    diskUsedPct: number | null;
    diskFreeGb: number | null;
    memoryTotalMb: number;
    memoryAvailablePct: number | null;
    swapTotalMb: number | null;
    swapUsedPct: number | null;
    load1: number | null;
    cores: number;
    uptimeHours: number;
  };
  processes?: { name: string; memoryMb: number; cpuPct: number; count: number }[];
  disk?: { path: string; mb: number }[];
  postgres:
    | {
        ok: true;
        maxConnections: number;
        connections: number;
        longestQuerySeconds: number;
        idleInTransactionSeconds: number;
        sizeMb: number;
        cacheHitPct: number;
        breakdown?: Connections;
        databases?: Sized[];
        tables?: Sized[];
      }
    | { ok: false; error: string };
  certificates: { host: string; ok: boolean; daysLeft?: number; error?: string }[];
  backup: { installed: boolean; result?: string | null; hoursAgo?: number | null } | null;
}

interface Sample {
  t: number;
  disk: number | null;
  memory: number | null;
  swap: number | null;
  load: number | null;
  connections: number | null;
  dbMs: number | null;
  appMs: number | null;
  siteMs: number | null;
  failures: number | null;
}

interface Health {
  /** The review app's clock when it answered: every "ago" is measured from it. */
  now: number;
  live: {
    status: "ok" | "down";
    database: { ok: boolean; ms: number; error?: string };
    failures5m: number;
    uptimeSeconds: number;
    schema: number | null;
    pool: { total: number; idle: number; waiting: number };
    memoryMb: number;
    connections: Connections | null;
    databases: Sized[] | null;
    tables: Sized[] | null;
  };
  monitor: { lastRun: string | null; problems: Problem[]; readings: Readings | null; history: Sample[] } | null;
  limits: Record<string, number>;
}

type Tone = "good" | "warning" | "critical" | "neutral";
const TABS = ["overview", "database", "system", "services"] as const;
export type ServerTab = (typeof TABS)[number];

/* ---------------------------------------------------------------- helpers */

function ago(at: string | number | null | undefined, now: number): string {
  if (!at) return "—";
  const minutes = Math.round((now - (typeof at === "number" ? at : Date.parse(at))) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

function seconds(s: number): string {
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

function mb(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  if (n < 1) return `${Math.max(1, Math.round(n * 1024))} kB`;
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} MB`;
}

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

function toneFor(value: number | null | undefined, warn: number, critical: number, lowIsBad = false): Tone {
  if (value === null || value === undefined) return "neutral";
  if (lowIsBad) return value < critical ? "critical" : value < warn ? "warning" : "good";
  return value >= critical ? "critical" : value >= warn ? "warning" : "good";
}

/* ------------------------------------------------------------- the marks */

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "critical" ? XCircle : Circle;
  return (
    <span className={styles.pill} data-tone={tone}>
      <Icon size={14} aria-hidden="true" /> {children}
    </span>
  );
}

/**
 * A day's trend for one reading, drawn from the monitor's five-minute samples.
 *
 * One series in the accent, a 2px line over a faint fill, no axis — the tile
 * already says the current value and the unit. Hovering any step shows its
 * time and value (a native tooltip per step), and the summary is the label
 * for screen readers.
 */
function Sparkline({
  samples,
  pick,
  unit,
  tall = false,
  floor0 = true,
  percent = false,
}: {
  samples: Sample[];
  pick: (s: Sample) => number | null;
  unit: string;
  tall?: boolean;
  floor0?: boolean;
  /** A percentage: drawn on 0–100, so 43% disk does not read as full. */
  percent?: boolean;
}) {
  const points = samples.map((s) => ({ t: s.t, v: pick(s) })).filter((p): p is { t: number; v: number } => p.v !== null);
  if (points.length < 2) return <p className={styles.tileNote}>Trend appears after a few checks.</p>;

  const W = 240;
  const H = tall ? 72 : 34;
  const values = points.map((p) => p.v);
  const min = floor0 || percent ? 0 : Math.min(...values);
  const max = percent ? 100 : Math.max(...values, min + 1);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min)) * (H - 4);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(t1).toFixed(1)},${H}L0,${H}Z`;
  const step = W / points.length;

  return (
    <>
      <svg
        className={`${styles.spark} ${tall ? styles.sparkTall : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Last ${duration((t1 - t0) / 3_600_000)}: low ${Math.min(...values)}${unit}, high ${Math.max(...values)}${unit}, now ${values[values.length - 1]}${unit}`}
      >
        <path className={styles.area} d={area} />
        <path className={styles.line} d={line} />
        {points.map((p) => (
          <rect key={p.t} className={styles.hit} x={x(p.t) - step / 2} y={0} width={step} height={H}>
            <title>{`${clock.format(new Date(p.t))} — ${p.v}${unit}`}</title>
          </rect>
        ))}
      </svg>
      {tall && (
        <div className={styles.sparkAxis} aria-hidden="true">
          <span>{clock.format(new Date(t0))}</span>
          <span>now</span>
        </div>
      )}
    </>
  );
}

function Meter({ label, value, max, text, tone = "good" }: { label: string; value: number; max: number; text: string; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={styles.meter} data-tone={tone}>
      <div className={styles.meterTop}>
        <span>{label}</span>
        <strong>{text}</strong>
      </div>
      <div className={styles.meterTrack} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className={styles.meterFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BarCell({ value, max, text }: { value: number; max: number; text: string }) {
  return (
    <div className={styles.barCell}>
      <div className={styles.bar} aria-hidden="true">
        <span style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
      <span>{text}</span>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {note && <p className={styles.panelNote}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------- page */

/**
 * The box and both apps: what the monitor saw at its last check, what the
 * review app sees right now, and a day of trends.
 *
 * Four tabs, by what someone came to look at. Overview answers "is anything
 * wrong?"; Database answers "who is using Postgres?"; System, "where are the
 * memory and the disk going?"; Services, "is each part up, and how fast?".
 * Live readings are used wherever the review app can take them, so the page is
 * right now even when the monitor's copy is five minutes old.
 */
export default async function ServerHealth({ tab = "overview", base }: { tab?: string; base: string }) {
  const token = await sessionToken();
  const health = await call<Health>("/admin/health", { token });
  const { live, monitor, now } = health;
  const r = monitor?.readings ?? null;
  const history = monitor?.history ?? [];
  const problems = monitor?.problems ?? [];
  const stale = monitor?.lastRun ? now - Date.parse(monitor.lastRun) > 15 * 60_000 : true;
  const current: ServerTab = (TABS as readonly string[]).includes(tab) ? (tab as ServerTab) : "overview";

  const pg = r?.postgres.ok ? r.postgres : null;
  const connections = live.connections ?? pg?.breakdown ?? null;
  const databases = live.databases ?? pg?.databases ?? [];
  const tables = live.tables ?? pg?.tables ?? [];
  const http = (name: string) => r?.http.find((h) => h.name === name);

  const critical = live.status !== "ok" || problems.some((p) => p.severity === "critical");
  const bannerTone: Tone = critical ? "critical" : problems.length || stale ? "warning" : "good";
  const bannerTitle =
    live.status !== "ok"
      ? "The review app cannot reach the database"
      : problems.length
        ? `${problems.length} open problem${problems.length === 1 ? "" : "s"}`
        : stale
          ? "Live checks are fine, but the monitor has stopped"
          : "Everything checked is healthy";
  const BannerIcon = bannerTone === "good" ? CheckCircle2 : bannerTone === "warning" ? AlertTriangle : XCircle;

  const link = (t: ServerTab) => (t === "overview" ? base : `${base}?tab=${t}`);
  const tabName: Record<ServerTab, string> = { overview: "Overview", database: "Database", system: "System", services: "Services" };

  return (
    <>
      <PageHeader
        title="Server"
        sub={
          monitor?.lastRun
            ? `${r?.host ?? "server"} · checked ${ago(monitor.lastRun, now)} · problems email info@reviewslip.com`
            : "The monitor has not run yet — see docs/monitoring.md to install it"
        }
      />
      <div className="page-body">
        <nav className={styles.tabs} aria-label="Server sections">
          {TABS.map((t) => (
            <Link key={t} href={link(t)} className={styles.tab} aria-current={t === current ? "page" : undefined}>
              {tabName[t]}
              {t === "overview" && problems.length > 0 && <span className={styles.tabCount}>{problems.length}</span>}
            </Link>
          ))}
        </nav>

        <div className={styles.banner} data-tone={bannerTone} role="status">
          <BannerIcon className={styles.bannerIcon} size={22} aria-hidden="true" />
          <div>
            <p className={styles.bannerTitle}>{bannerTitle}</p>
            <p className={styles.bannerSub}>
              {stale
                ? monitor?.lastRun
                  ? `Last monitor check ${ago(monitor.lastRun, now)} — check systemctl status reviewslip-monitor.timer`
                  : "Install the monitor to see disk, memory, services and history"
                : `Monitor checked ${ago(monitor?.lastRun, now)} · database answering in ${live.database.ms} ms`}
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------ overview */}
        {current === "overview" && (
          <>
            <div className={styles.tiles}>
              <Link href={link("services")} className={styles.tile} data-tone={http("Review app")?.ok === false ? "critical" : undefined}>
                <span className={styles.tileLabel}>Review app response</span>
                <span className={styles.tileValue}>{http("Review app")?.ok ? `${http("Review app")!.ms} ms` : r ? "Down" : "—"}</span>
                <span className={styles.tileNote}>{live.failures5m} server errors in 5 min</span>
                <Sparkline samples={history} pick={(s) => s.appMs} unit=" ms" />
              </Link>
              <Link href={link("database")} className={styles.tile} data-tone={live.database.ok ? undefined : "critical"}>
                <span className={styles.tileLabel}>Database</span>
                <span className={styles.tileValue}>{live.database.ok ? `${live.database.ms} ms` : "Down"}</span>
                <span className={styles.tileNote}>
                  {connections ? `${connections.total} of ${connections.max} connections` : "connections unknown"}
                </span>
                <Sparkline samples={history} pick={(s) => s.connections} unit=" connections" />
              </Link>
              <Link href={link("system")} className={styles.tile} data-tone={toneFor(r?.system.memoryAvailablePct, 10, 5, true) === "good" ? undefined : toneFor(r?.system.memoryAvailablePct, 10, 5, true)}>
                <span className={styles.tileLabel}>Memory free</span>
                <span className={styles.tileValue}>{r?.system.memoryAvailablePct != null ? `${r.system.memoryAvailablePct}%` : "—"}</span>
                <span className={styles.tileNote}>
                  {r ? `of ${mb(r.system.memoryTotalMb)} · swap ${r.system.swapTotalMb == null ? "—" : r.system.swapTotalMb ? `${r.system.swapUsedPct}% used` : "none"}` : "from the monitor"}
                </span>
                <Sparkline samples={history} pick={(s) => s.memory} unit="%" percent />
              </Link>
              <Link href={link("system")} className={styles.tile} data-tone={toneFor(r?.system.diskUsedPct, 85, 95) === "good" ? undefined : toneFor(r?.system.diskUsedPct, 85, 95)}>
                <span className={styles.tileLabel}>Disk used</span>
                <span className={styles.tileValue}>{r?.system.diskUsedPct != null ? `${r.system.diskUsedPct}%` : "—"}</span>
                <span className={styles.tileNote}>{r?.system.diskFreeGb != null ? `${r.system.diskFreeGb} GB free` : "from the monitor"}</span>
                <Sparkline samples={history} pick={(s) => s.disk} unit="%" percent />
              </Link>
            </div>

            <Panel title="Open Problems" note={problems.length ? "Emailed when they start, every 6 h, and when they clear" : undefined}>
              {problems.length === 0 ? (
                <p className={styles.empty}>{monitor ? "Nothing wrong at the last check." : "No readings yet."}</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Severity</th><th>Problem</th><th className={styles.num}>Since</th></tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.key}>
                        <td><Pill tone={p.severity === "critical" ? "critical" : "warning"}>{p.severity === "critical" ? "Critical" : "Warning"}</Pill></td>
                        <td>{p.summary}</td>
                        <td className={styles.num}>{ago(p.since, now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <div className={styles.grid2}>
              <Panel title="Services" note={r ? `${r.services.filter((s) => s.state === "active").length} of ${r.services.length} running` : undefined}>
                {r ? (
                  <div className={styles.chips}>
                    {r.services.map((s) => (
                      <Pill key={s.name} tone={s.state === "active" ? "good" : "critical"}>{s.name}</Pill>
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>From the monitor.</p>
                )}
              </Panel>
              <Panel title="Backups and Certificates">
                {r ? (
                  <div className={styles.chips}>
                    {r.backup?.installed && (
                      <Pill tone={r.backup.result === "success" && (r.backup.hoursAgo ?? 99) <= 30 ? "good" : "warning"}>
                        Backup {r.backup.hoursAgo != null ? `${Math.round(r.backup.hoursAgo)} h ago` : "not run since boot"}
                      </Pill>
                    )}
                    {r.certificates.map((c) => (
                      <Pill key={c.host} tone={!c.ok ? "warning" : toneFor(c.daysLeft, 14, 3, true)}>
                        {c.host} {c.ok ? `${c.daysLeft} days` : c.error}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>From the monitor.</p>
                )}
              </Panel>
            </div>
          </>
        )}

        {/* ------------------------------------------------------ database */}
        {current === "database" && (
          <>
            <div className={styles.grid2}>
              <Panel title="Connections" note="Right now, through the review app">
                {connections ? (
                  <>
                    <Meter
                      label="In use"
                      value={connections.total}
                      max={connections.max - connections.reserved}
                      text={`${connections.total} of ${connections.max - connections.reserved}`}
                      tone={toneFor((connections.total / Math.max(1, connections.max - connections.reserved)) * 100, 80, 95)}
                    />
                    <p className={styles.panelNote}>
                      {connections.reserved} more kept back for an administrator. Postgres&apos;s own background processes
                      ({connections.background.reduce((n, b) => n + b.count, 0)}) are not counted.
                    </p>
                    <Sparkline samples={history} pick={(s) => s.connections} unit=" connections" tall />
                  </>
                ) : (
                  <p className={styles.empty}>The database is not answering.</p>
                )}
              </Panel>
              <Panel title="Health">
                <table className={styles.table}>
                  <tbody>
                    <tr><td>Answering the review app in</td><td className={styles.num}>{live.database.ok ? `${live.database.ms} ms` : "—"}</td></tr>
                    <tr><td>Review app pool</td><td className={styles.num}>{live.pool.total} open · {live.pool.idle} idle · {live.pool.waiting} waiting</td></tr>
                    {pg && (
                      <>
                        <tr><td>Cache hit rate</td><td className={styles.num}>{pg.cacheHitPct}%</td></tr>
                        <tr><td>Longest running query</td><td className={styles.num}>{seconds(pg.longestQuerySeconds)}</td></tr>
                        <tr><td>Oldest open transaction</td><td className={styles.num}>{seconds(pg.idleInTransactionSeconds)}</td></tr>
                      </>
                    )}
                    <tr><td>Schema version</td><td className={styles.num}>{live.schema ?? "—"}</td></tr>
                  </tbody>
                </table>
              </Panel>
            </div>

            <Panel title="Who Is Connected" note="Grouped by the application that opened them">
              {connections && connections.byApp.length ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Connections</th>
                      <th className={styles.num}>Running a query</th>
                      <th className={styles.num}>Idle</th>
                      <th className={styles.num}>Open transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.byApp.map((a) => (
                      <tr key={a.app || "unnamed"}>
                        <td>
                          {a.label}
                          {a.app && a.label !== a.app && <span className={styles.sub}>{a.app}</span>}
                        </td>
                        <td><BarCell value={a.count} max={connections.byApp[0].count} text={String(a.count)} /></td>
                        <td className={styles.num}>{a.active}</td>
                        <td className={styles.num}>{a.idle}</td>
                        <td className={styles.num}>{a.idleInTransaction ? <Pill tone="warning">{a.idleInTransaction}</Pill> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.empty}>No client connections besides this check.</p>
              )}
            </Panel>

            {connections && connections.groups.length > 0 && (
              <Panel title="Where Each Connection Comes From" note="Application, database user, address and what it is doing">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>User</th>
                      <th>From</th>
                      <th>State</th>
                      <th className={styles.num}>Count</th>
                      <th className={styles.num}>Longest in state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.groups.map((g, i) => (
                      <tr key={i}>
                        <td>{g.label}</td>
                        <td>{g.user || "—"}</td>
                        <td>{g.client}</td>
                        <td>
                          <Pill tone={g.state === "active" ? "good" : g.state.startsWith("idle in transaction") ? "warning" : "neutral"}>{g.state}</Pill>
                        </td>
                        <td className={styles.num}>{g.count}</td>
                        <td className={styles.num}>{seconds(g.oldestSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {connections.background.length > 0 && (
                  <div className={styles.chips} aria-label="Postgres background processes">
                    {connections.background.map((b) => (
                      <span key={b.kind} className={styles.chip}>{b.kind} · {b.count}</span>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            <div className={styles.grid2}>
              <Panel title="Databases">
                {databases.length ? (
                  <table className={styles.table}>
                    <tbody>
                      {databases.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td><BarCell value={d.mb} max={databases[0].mb} text={mb(d.mb)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.empty}>Not readable right now.</p>
                )}
              </Panel>
              <Panel title="Largest Tables">
                {tables.length ? (
                  <table className={styles.table}>
                    <thead><tr><th>Table</th><th>Size</th><th className={styles.num}>Rows</th></tr></thead>
                    <tbody>
                      {tables.map((t) => (
                        <tr key={t.name}>
                          <td>{t.name}</td>
                          <td><BarCell value={t.mb} max={tables[0].mb} text={mb(t.mb)} /></td>
                          <td className={styles.num}>{(t.rows ?? 0).toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.empty}>Not readable right now.</p>
                )}
              </Panel>
            </div>
          </>
        )}

        {/* -------------------------------------------------------- system */}
        {current === "system" && (
          <>
            {!r ? (
              <Panel title="System"><p className={styles.empty}>Disk, memory and processes come from the monitor, which has not run yet.</p></Panel>
            ) : (
              <>
                <div className={styles.grid2}>
                  <Panel title="Memory" note={`${mb(r.system.memoryTotalMb)} in total`}>
                    {r.system.memoryAvailablePct != null && (
                      <Meter
                        label="In use"
                        value={100 - r.system.memoryAvailablePct}
                        max={100}
                        text={`${100 - r.system.memoryAvailablePct}%`}
                        tone={toneFor(r.system.memoryAvailablePct, 10, 5, true)}
                      />
                    )}
                    {r.system.swapTotalMb != null && (
                      <Meter
                        label={`Swap (${mb(r.system.swapTotalMb)})`}
                        value={r.system.swapUsedPct ?? 0}
                        max={100}
                        text={r.system.swapTotalMb ? `${r.system.swapUsedPct}%` : "none"}
                        tone={r.system.swapTotalMb ? toneFor(r.system.swapUsedPct, 50, 80) : "warning"}
                      />
                    )}
                    <p className={styles.panelNote}>Memory free over the last day</p>
                    <Sparkline samples={history} pick={(s) => s.memory} unit="%" tall percent />
                  </Panel>
                  <Panel title="Disk" note={r.system.diskFreeGb != null ? `${r.system.diskFreeGb} GB free` : undefined}>
                    {r.system.diskUsedPct != null && (
                      <Meter label="Used" value={r.system.diskUsedPct} max={100} text={`${r.system.diskUsedPct}%`} tone={toneFor(r.system.diskUsedPct, 85, 95)} />
                    )}
                    {r.disk && r.disk.length > 0 && (
                      <table className={styles.table}>
                        <tbody>
                          {r.disk.map((d) => (
                            <tr key={d.path}>
                              <td>{d.path}</td>
                              <td><BarCell value={d.mb} max={r.disk![0].mb} text={mb(d.mb)} /></td>
                            </tr>
                          ))}
                          {pg && <tr><td>Postgres data (databases)</td><td><BarCell value={pg.sizeMb} max={r.disk[0].mb} text={mb(pg.sizeMb)} /></td></tr>}
                        </tbody>
                      </table>
                    )}
                  </Panel>
                </div>

                <Panel title="What Is Using the Memory" note="Processes grouped by what they are">
                  {r.processes && r.processes.length ? (
                    <table className={styles.table}>
                      <thead><tr><th>Process</th><th>Memory</th><th className={styles.num}>CPU</th><th className={styles.num}>Processes</th></tr></thead>
                      <tbody>
                        {r.processes.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td><BarCell value={p.memoryMb} max={r.processes![0].memoryMb} text={mb(p.memoryMb)} /></td>
                            <td className={styles.num}>{p.cpuPct}%</td>
                            <td className={styles.num}>{p.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className={styles.empty}>Not reported by this monitor version.</p>
                  )}
                </Panel>

                <div className={styles.grid2}>
                  <Panel title="Load" note={`${r.system.cores} core${r.system.cores === 1 ? "" : "s"} · up ${duration(r.system.uptimeHours)}`}>
                    <Sparkline samples={history} pick={(s) => s.load} unit="" tall />
                  </Panel>
                  <Panel title="Disk Used Over the Day">
                    <Sparkline samples={history} pick={(s) => s.disk} unit="%" tall percent />
                  </Panel>
                </div>
              </>
            )}
          </>
        )}

        {/* ------------------------------------------------------ services */}
        {current === "services" && (
          <>
            <Panel title="Services" note="systemd, at the last monitor check">
              {r ? (
                <table className={styles.table}>
                  <thead><tr><th>Service</th><th>State</th><th className={styles.num}>Up for</th><th className={styles.num}>Memory</th><th className={styles.num}>Restarts</th></tr></thead>
                  <tbody>
                    {r.services.map((s) => (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td><Pill tone={s.state === "active" ? "good" : "critical"}>{s.state}</Pill></td>
                        <td className={styles.num}>{duration(s.upHours)}</td>
                        <td className={styles.num}>{s.memoryMb != null ? mb(s.memoryMb) : "—"}</td>
                        <td className={styles.num}>{s.restarts ? <Pill tone="warning">{s.restarts}</Pill> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.empty}>From the monitor.</p>
              )}
            </Panel>

            <div className={styles.grid2}>
              {[
                { name: "Review app", pick: (s: Sample) => s.appMs },
                { name: "Website", pick: (s: Sample) => s.siteMs },
              ].map(({ name, pick }) => {
                const h = http(name);
                return (
                  <Panel key={name} title={name} note={h ? (h.ok ? `${h.ms} ms at the last check` : `down — ${h.error ?? `HTTP ${h.status}`}`) : undefined}>
                    <Sparkline samples={history} pick={pick} unit=" ms" tall />
                  </Panel>
                );
              })}
            </div>

            <div className={styles.grid2}>
              <Panel title="Public Pages" note="Through nginx and TLS, as guests arrive">
                {r && r.http.length > 2 ? (
                  <table className={styles.table}>
                    <tbody>
                      {r.http.slice(2).map((h) => (
                        <tr key={h.name}>
                          <td>{h.name}</td>
                          <td className={styles.num}>{h.ok ? <Pill tone="good">{h.ms} ms</Pill> : <Pill tone="critical">{h.error ?? `HTTP ${h.status}`}</Pill>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.empty}>Checked on the server only.</p>
                )}
              </Panel>
              <Panel title="Certificates and Backups">
                {r ? (
                  <table className={styles.table}>
                    <tbody>
                      {r.certificates.map((c) => (
                        <tr key={c.host}>
                          <td>{c.host}</td>
                          <td className={styles.num}>
                            {c.ok ? <Pill tone={toneFor(c.daysLeft, 14, 3, true)}>{c.daysLeft} days left</Pill> : <Pill tone="warning">{c.error}</Pill>}
                          </td>
                        </tr>
                      ))}
                      {r.backup?.installed && (
                        <tr>
                          <td>Nightly backup</td>
                          <td className={styles.num}>
                            <Pill tone={r.backup.result === "success" ? "good" : "critical"}>
                              {r.backup.result ?? "not run"}{r.backup.hoursAgo != null ? ` · ${Math.round(r.backup.hoursAgo)} h ago` : ""}
                            </Pill>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.empty}>From the monitor.</p>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  );
}
