import { useEffect, useMemo, useRef, useState } from "react";
import { use$ } from "applesauce-react/hooks";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  RELAY,
  myPubkey,
  getName,
  setName as saveName,
  icsTimeline$,
  incidents,
  orgChart,
  verify,
  pendingForMe,
  objective,
  assignments,
  activityLog,
  nameOf,
  tag,
  startIncident,
  requestRole,
  accept,
  deny,
  publishObjective,
  publishAssignment,
  publishAssignmentUpdate,
  publishLog,
  republishMine,
  assignmentThread,
  ASSIGN_STATES,
  type Incident,
  type OrgNode,
  type Status,
  type AssignStatus,
} from "./ics";
import { logs$, clearLogs } from "./debug";

type Tab = "incidents" | "overview" | "chain" | "orders" | "log";

export function App() {
  const [name, setName] = useState(getName());
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("incidents");
  const [debugOpen, setDebugOpen] = useState(false);

  // The single reactive source: every ICS event this device has seen. Every view
  // below is a pure derivation of it (docs/design.md §8.4 — no server queries).
  const events = (use$(() => icsTimeline$(), []) ?? []) as NostrEvent[];
  const inc = useMemo(
    () => (incidentId ? incidents(events).find((i) => i.id === incidentId) : undefined),
    [events, incidentId],
  );

  const openIncident = (id: string) => {
    setIncidentId(id);
    setTab("overview");
  };

  const rename = () => {
    const next = window.prompt("Your name (as it appears in the chain)", name);
    if (next !== null) setName(saveName(next));
  };

  const needsIncident = tab !== "incidents" && !inc;
  const [resyncing, setResyncing] = useState(false);
  const [synced, setSynced] = useState(false); // flashes a green pulse on success

  // Re-flood all of my own events, so a peer who joined late picks up my whole
  // contribution (the mesh backfills history lazily). Dedup-safe by event id.
  const resync = async () => {
    if (resyncing) return;
    setResyncing(true);
    setSynced(false);
    try {
      await republishMine();
      setSynced(true);
      setTimeout(() => setSynced(false), 900); // one green pulse, then reset
    } catch (err) {
      reportErr(err);
    } finally {
      setResyncing(false);
    }
  };

  return (
    <div className="app">
      <header>
        <div className="titles">
          <span className="brand">INCIDENT COMMAND</span>
          {inc && <span className="subbrand">{inc.name}</span>}
        </div>
        <span className="header-right">
          <button className="who" onClick={rename} title={myPubkey}>
            <Avatar pubkey={myPubkey} size={20} />
            {name}
          </button>
          <button
            className={`dbg-toggle ${resyncing ? "spin" : ""} ${synced ? "pulse" : ""}`}
            onClick={resync}
            disabled={resyncing}
            aria-label="re-announce my events to the mesh"
            title="Re-announce all my events to the mesh"
          >
            ⟳
          </button>
          <button className="dbg-toggle" onClick={() => setDebugOpen((o) => !o)} aria-label="debug logs">
            ⚙
          </button>
        </span>
      </header>

      <main className="scroll">
        {tab === "incidents" && <IncidentsTab events={events} onOpen={openIncident} />}
        {needsIncident && <PickPrompt onGo={() => setTab("incidents")} />}
        {tab === "overview" && inc && <OverviewTab events={events} inc={inc} onTab={setTab} />}
        {tab === "chain" && inc && <ChainTab events={events} inc={inc} />}
        {tab === "orders" && inc && <OrdersTab events={events} inc={inc} />}
        {tab === "log" && inc && <LogTab events={events} inc={inc} />}
      </main>

      <nav className="tabbar">
        <TabButton tab="incidents" cur={tab} set={setTab} label="Incidents" icon={IcIncidents} />
        <TabButton tab="overview" cur={tab} set={setTab} label="Overview" icon={IcOverview} on={!!inc} />
        <TabButton tab="chain" cur={tab} set={setTab} label="Chain" icon={IcChain} on={!!inc} />
        <TabButton tab="orders" cur={tab} set={setTab} label="Orders" icon={IcDown} on={!!inc} />
        <TabButton tab="log" cur={tab} set={setTab} label="Log" icon={IcUp} on={!!inc} />
      </nav>

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}

// --- Incidents tab: overview list + start (§8.1–8.2) ------------------------
function IncidentsTab({ events, onOpen }: { events: NostrEvent[]; onOpen: (id: string) => void }) {
  const list = useMemo(() => incidents(events), [events]);
  const [draft, setDraft] = useState("");

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = draft.trim();
    if (!nm) return;
    setDraft("");
    try {
      const ev = await startIncident(nm);
      onOpen(ev.id);
    } catch (err) {
      reportErr(err);
    }
  };

  return (
    <>
      <form className="start" onSubmit={start}>
        <input
          placeholder="Name a new incident to command…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="danger" type="submit" disabled={!draft.trim()}>
          Start incident
        </button>
      </form>

      <h2>Active incidents</h2>
      {list.length === 0 && (
        <p className="empty">
          No active incidents. Declare one above, or wait for one to arrive over
          the mesh.
        </p>
      )}
      {list.map((i: Incident) => {
        const { nodes } = orgChart(events, i.id);
        const verified = nodes.filter((n) => n.status === "verified").length;
        const mine = i.ic === myPubkey;
        return (
          <button className="inc-card" key={i.id} onClick={() => onOpen(i.id)}>
            <div className="inc-card-top">
              <span className="inc-card-name">{i.name}</span>
              {mine && <span className="tag-you">YOU · IC</span>}
            </div>
            <div className="inc-card-meta">
              <Avatar pubkey={i.ic} size={16} /> IC {nameOf(events, i.ic)} · {verified} verified · {ago(i.created_at)}
            </div>
          </button>
        );
      })}
    </>
  );
}

// --- Overview tab: at-a-glance status + pending gate ------------------------
function OverviewTab({
  events,
  inc,
  onTab,
}: {
  events: NostrEvent[];
  inc: Incident;
  onTab: (t: Tab) => void;
}) {
  const me = useMemo(() => verify(events, inc.id, myPubkey), [events, inc.id]);
  const chart = useMemo(() => orgChart(events, inc.id), [events, inc.id]);
  const pending = useMemo(() => pendingForMe(events, inc.id, myPubkey), [events, inc.id]);
  const obj = useMemo(() => objective(events, inc.id), [events, inc.id]);
  const logs = useMemo(() => activityLog(events, inc.id), [events, inc.id]);

  const counts = {
    verified: chart.nodes.filter((n) => n.status === "verified").length,
    pending: chart.nodes.filter((n) => n.status === "pending").length,
  };

  return (
    <>
      <div className="status-strip">
        <div>
          <div className="label">Your status</div>
          <div className="status-line">
            <StatusBadge status={me.status} />
            {me.status === "verified" && <b>{me.path[0]?.role}</b>}
          </div>
        </div>
        <div>
          <div className="label">Incident commander</div>
          <div className="status-line">
            <Identity events={events} pubkey={inc.ic} you={inc.ic === myPubkey} />
          </div>
        </div>
      </div>

      <div className="metrics">
        <button className="metric" onClick={() => onTab("chain")}>
          <span className="metric-n">{counts.verified}</span>
          <span className="metric-l">verified</span>
        </button>
        <button className="metric" onClick={() => onTab("chain")}>
          <span className="metric-n metric-amber">{counts.pending}</span>
          <span className="metric-l">pending</span>
        </button>
        <button className="metric" onClick={() => onTab("log")}>
          <span className="metric-n">{logs.length}</span>
          <span className="metric-l">log entries</span>
        </button>
      </div>

      {/* Accept/deny gate — leaders alone decide who joins under them (§8.3). */}
      {pending.length > 0 && (
        <>
          <h2>Requests to you</h2>
          {pending.map((r) => (
            <div className="request" key={r.id}>
              <span className="request-who">
                <Identity events={events} pubkey={r.pubkey} size={22} />
                <span>requests <b>{tag(r, "role") ?? "Member"}</b></span>
              </span>
              <span className="req-actions">
                <button className="ok" onClick={() => accept(r).catch(reportErr)}>Accept</button>
                <button className="ghost" onClick={() => deny(r).catch(reportErr)}>Deny</button>
              </span>
            </div>
          ))}
        </>
      )}

      <h2>Current objective <span className="hint">ICS-202</span></h2>
      {obj ? (
        <div className="card">
          <div>{obj.content}</div>
          <div className="card-meta">{nameOf(events, obj.pubkey)} · {ago(obj.created_at)}</div>
        </div>
      ) : (
        <p className="empty">No objectives published yet.</p>
      )}
    </>
  );
}

// --- Chain tab: org chart, verification path, join (§8.2, §8.4, §6) ---------
function ChainTab({ events, inc }: { events: NostrEvent[]; inc: Incident }) {
  const chart = useMemo(() => orgChart(events, inc.id), [events, inc.id]);
  const me = useMemo(() => verify(events, inc.id, myPubkey), [events, inc.id]);
  const [selected, setSelected] = useState<string | null>(null);

  const iAmIn = me.status === "verified";

  return (
    <>
      <h2>Chain of command</h2>
      <OrgTree
        chart={chart}
        onSelect={(pk) => setSelected(pk === selected ? null : pk)}
        selected={selected}
      />
      {selected && <VerificationPath events={events} incidentId={inc.id} pubkey={selected} />}

      {!iAmIn && inc.ic !== myPubkey && (
        <JoinPanel events={events} incidentId={inc.id} chart={chart} status={me.status} />
      )}
    </>
  );
}

// --- Orders tab: objectives (202) + assignments (204), both DOWN (§8.5) -----
function OrdersTab({ events, inc }: { events: NostrEvent[]; inc: Incident }) {
  const chart = useMemo(() => orgChart(events, inc.id), [events, inc.id]);
  const me = useMemo(() => verify(events, inc.id, myPubkey), [events, inc.id]);
  const obj = useMemo(() => objective(events, inc.id), [events, inc.id]);
  const assigns = useMemo(() => assignments(events, inc.id), [events, inc.id]);
  const iAmIn = me.status === "verified";
  const isIC = inc.ic === myPubkey; // ICS-202 is the IC's to set (design §5)

  return (
    <>
      <h2>Objectives <span className="hint">ICS-202 · down</span></h2>
      {obj ? (
        <div className="card">
          <div>{obj.content}</div>
          <div className="card-meta">{nameOf(events, obj.pubkey)} · {ago(obj.created_at)}</div>
        </div>
      ) : (
        <p className="empty">No objectives published yet.</p>
      )}
      {isIC && (
        <Composer
          placeholder="Set the current objective…"
          button="Publish objective"
          onSend={(t) => publishObjective(inc.id, t)}
        />
      )}

      <h2>Assignments <span className="hint">ICS-204 · down, worked up</span></h2>
      {assigns.length === 0 && <p className="empty">No assignments yet.</p>}
      {assigns.map((a) => (
        <AssignmentCard key={a.id} events={events} incidentId={inc.id} assignment={a} canWork={iAmIn} />
      ))}
      {iAmIn && <AssignComposer incidentId={inc.id} chart={chart} />}
    </>
  );
}

// --- one assignment: order + live status + comment thread -------------------
function AssignmentCard({
  events,
  incidentId,
  assignment,
  canWork,
}: {
  events: NostrEvent[];
  incidentId: string;
  assignment: NostrEvent;
  canWork: boolean;
}) {
  const thread = useMemo(
    () => assignmentThread(events, assignment.id),
    [events, assignment.id],
  );
  const target = tag(assignment, "p") ?? "";
  const mine = target === myPubkey; // I'm the assignee
  const [comment, setComment] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Progress reports (comments) always stay; bare status changes fold into an
  // expandable history — the current status already shows as the pill on top.
  const comments = thread.updates.filter((u) => u.content.trim());
  const statusChanges = thread.updates.filter((u) => !u.content.trim() && tag(u, "status"));

  const setStatus = (s: AssignStatus) =>
    publishAssignmentUpdate(incidentId, assignment.id, s, "").catch(reportErr);

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = comment.trim();
    if (!t) return;
    setComment("");
    try {
      await publishAssignmentUpdate(incidentId, assignment.id, null, t);
    } catch (err) {
      setComment(t);
      reportErr(err);
    }
  };

  return (
    <div className="card assignment">
      <div className="assign-top">
        <div className="assign-order">{assignment.content}</div>
        <StatusPill status={thread.status} />
      </div>
      <div className="card-meta assign-meta">
        <Identity events={events} pubkey={assignment.pubkey} size={16} />
        <span className="arrow">→</span>
        <Identity events={events} pubkey={target} size={16} you={mine} />
        <span>· {ago(assignment.created_at)}</span>
      </div>

      {(comments.length > 0 || statusChanges.length > 0) && (
        <div className="thread">
          {statusChanges.length > 0 && (
            <button className="link thread-toggle" onClick={() => setShowHistory((o) => !o)}>
              {showHistory
                ? "hide status history"
                : `▸ ${statusChanges.length} status change${statusChanges.length > 1 ? "s" : ""}`}
            </button>
          )}
          {showHistory &&
            statusChanges.map((u) => <ThreadLine key={u.id} events={events} update={u} muted />)}
          {comments.map((u) => <ThreadLine key={u.id} events={events} update={u} />)}
        </div>
      )}

      {canWork && (
        <>
          <div className="status-set">
            {ASSIGN_STATES.map((s) => (
              <button
                key={s}
                className={`chip ${thread.status === s ? "on" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <form className="composer thread-composer" onSubmit={sendComment}>
            <input
              placeholder={mine ? "Report progress…" : "Comment…"}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button type="submit" disabled={!comment.trim()}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}

// --- Log tab: activity log (214), UP (§8.5) ---------------------------------
function LogTab({ events, inc }: { events: NostrEvent[]; inc: Incident }) {
  const me = useMemo(() => verify(events, inc.id, myPubkey), [events, inc.id]);
  const logs = useMemo(() => activityLog(events, inc.id), [events, inc.id]);
  const iAmIn = me.status === "verified";

  return (
    <>
      <h2>Activity log <span className="hint">ICS-214 · up</span></h2>
      {iAmIn && (
        <Composer
          placeholder="Log an action…"
          button="Log entry"
          onSend={(t) => publishLog(inc.id, t)}
        />
      )}
      {logs.length === 0 && <p className="empty">No log entries yet.</p>}
      {logs.map((l) => (
        <div className="log-line" key={l.id}>
          <span className="log-time">{time(l.created_at)}</span>
          <Identity events={events} pubkey={l.pubkey} size={16} />
          <span className="log-body">{l.content}</span>
        </div>
      ))}
    </>
  );
}

// --- bottom tab bar ---------------------------------------------------------
function TabButton({
  tab,
  cur,
  set,
  label,
  icon: Icon,
  on = true,
}: {
  tab: Tab;
  cur: Tab;
  set: (t: Tab) => void;
  label: string;
  icon: () => React.ReactNode;
  on?: boolean;
}) {
  return (
    <button
      className={`tab ${cur === tab ? "active" : ""} ${on ? "" : "dim"}`}
      onClick={() => set(tab)}
    >
      <span className="tab-icon"><Icon /></span>
      <span className="tab-label">{label}</span>
    </button>
  );
}

function PickPrompt({ onGo }: { onGo: () => void }) {
  return (
    <p className="empty">
      Select an incident first.{" "}
      <button className="link" onClick={onGo}>Go to incidents →</button>
    </p>
  );
}

// --- org tree ---------------------------------------------------------------
function OrgTree({
  chart,
  onSelect,
  selected,
}: {
  chart: { ic: string | null; nodes: OrgNode[] };
  onSelect: (pk: string) => void;
  selected: string | null;
}) {
  const { ic, nodes } = chart;
  if (!ic) return <p className="empty">…</p>;

  const byParent = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    if (n.pubkey === ic) continue;
    const key = n.parent ?? ic;
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(n);
  }

  const seen = new Set<string>();
  const render = (pk: string, depth: number): React.ReactNode => {
    seen.add(pk);
    const node = nodes.find((n) => n.pubkey === pk);
    const kids = (byParent.get(pk) ?? []).filter((k) => !seen.has(k.pubkey));
    return (
      <div key={pk}>
        <Row node={node} depth={depth} onSelect={onSelect} selected={selected} />
        {kids.map((k) => render(k.pubkey, depth + 1))}
      </div>
    );
  };

  // Nodes whose parent isn't reachable from the IC (a snapped chain) — shown
  // separately rather than silently dropped.
  const tree = render(ic, 0);
  const orphans = nodes.filter((n) => !seen.has(n.pubkey));

  return (
    <div className="tree">
      {tree}
      {orphans.length > 0 && (
        <>
          <div className="orphan-head">Unlinked / unverified</div>
          {orphans.map((n) => (
            <Row key={n.pubkey} node={n} depth={0} onSelect={onSelect} selected={selected} />
          ))}
        </>
      )}
    </div>
  );
}

function Row({
  node,
  depth,
  onSelect,
  selected,
}: {
  node?: OrgNode;
  depth: number;
  onSelect: (pk: string) => void;
  selected: string | null;
}) {
  if (!node) return null;
  return (
    <button
      className={`node status-${node.status} ${selected === node.pubkey ? "sel" : ""}`}
      style={{ marginLeft: `${depth * 1.1}rem` }}
      onClick={() => onSelect(node.pubkey)}
    >
      <span className="node-main">
        <Avatar pubkey={node.pubkey} size={26} />
        <span className="node-text">
          <span className="node-name">
            {node.name}
            {node.pubkey === myPubkey && <span className="tag-you"> YOU</span>}
          </span>
          <span className="node-role">{node.role}</span>
        </span>
      </span>
      <StatusBadge status={node.status} />
    </button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function StatusPill({ status, small }: { status: AssignStatus; small?: boolean }) {
  const cls = status.replace(/\s+/g, "-"); // "in progress" → "in-progress"
  return <span className={`pill pill-${cls} ${small ? "pill-sm" : ""}`}>{status}</span>;
}

/** A deterministic identicon derived from the participant pubkey: a hue picked
 *  from the first byte, and a left-mirrored 5×5 cell pattern from the next
 *  nibbles. Same key → same avatar on every device, no lookup. */
function Avatar({ pubkey, size = 20 }: { pubkey: string; size?: number }) {
  if (!pubkey) return <span className="avatar avatar-empty" style={{ width: size, height: size }} />;
  const hue = Math.round((parseInt(pubkey.slice(0, 2), 16) / 255) * 360);
  const fg = `hsl(${hue} 60% 62%)`;
  const bg = `hsl(${hue} 32% 22%)`;
  const cells: [number, number][] = [];
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 5; r++) {
      if (parseInt(pubkey[c * 5 + r] ?? "0", 16) < 8) continue; // ~half on
      cells.push([c, r]);
      if (c < 2) cells.push([4 - c, r]); // mirror to a symmetric badge
    }
  }
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 5 5" style={{ background: bg }} aria-hidden="true">
      {cells.map(([c, r], i) => (
        <rect key={i} x={c} y={r} width="1.02" height="1.02" fill={fg} />
      ))}
    </svg>
  );
}

/** Avatar + resolved display name, the standard way to render a person. */
function Identity({
  events,
  pubkey,
  size,
  you,
}: {
  events: NostrEvent[];
  pubkey: string;
  size?: number;
  you?: boolean;
}) {
  return (
    <span className="identity">
      <Avatar pubkey={pubkey} size={size} />
      <span className="identity-name">{nameOf(events, pubkey)}</span>
      {you && <span className="tag-you">YOU</span>}
    </span>
  );
}

function ThreadLine({
  events,
  update,
  muted,
}: {
  events: NostrEvent[];
  update: NostrEvent;
  muted?: boolean;
}) {
  const status = tag(update, "status") as AssignStatus | undefined;
  return (
    <div className={`thread-line ${muted ? "thread-old" : ""}`}>
      <Identity events={events} pubkey={update.pubkey} size={16} />
      {status && <StatusPill status={status} small />}
      {update.content && <span className="thread-body">{update.content}</span>}
      <span className="thread-time">{ago(update.created_at)}</span>
    </div>
  );
}

// Tapping a node shows its full signature-verified path to the IC (§6).
function VerificationPath({
  events,
  incidentId,
  pubkey,
}: {
  events: NostrEvent[];
  incidentId: string;
  pubkey: string;
}) {
  const { status, path } = verify(events, incidentId, pubkey);
  return (
    <div className="vpath">
      <div className="vpath-head">Verification path — each hop signature-checked</div>
      <div className="vpath-chain">
        {path.map((l, i) => (
          <span key={l.pubkey}>
            {i > 0 && <span className="arrow"> ← </span>}
            <b>{nameOf(events, l.pubkey)}</b>{" "}
            <span className="vpath-role">{l.role}</span>
          </span>
        ))}
        {status !== "verified" && <span className="badge broken"> {status}</span>}
      </div>
    </div>
  );
}

// --- join panel (§8.2) ------------------------------------------------------
function JoinPanel({
  events,
  incidentId,
  chart,
  status,
}: {
  events: NostrEvent[];
  incidentId: string;
  chart: { ic: string | null; nodes: OrgNode[] };
  status: Status;
}) {
  const superiors = chart.nodes.filter(
    (n) => n.status === "verified" && n.pubkey !== myPubkey,
  );
  const [superior, setSuperior] = useState("");
  const [role, setRole] = useState("");
  const chosen = superior || chart.ic || "";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !role.trim()) return;
    try {
      await requestRole(incidentId, chosen, role.trim());
      setRole("");
    } catch (err) {
      reportErr(err);
    }
  };

  return (
    <>
      <h2>Request a role</h2>
      {status === "pending" && (
        <p className="empty">Request sent — awaiting your superior's acceptance.</p>
      )}
      {status === "denied" && <p className="empty">A request was denied. You can ask again.</p>}
      <form className="join" onSubmit={send}>
        <input
          placeholder="Role (e.g. Operations Chief)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <select value={chosen} onChange={(e) => setSuperior(e.target.value)}>
          {chart.ic && <option value={chart.ic}>under {nameOf(events, chart.ic)} (IC)</option>}
          {superiors.map((s) => (
            <option key={s.pubkey} value={s.pubkey}>
              under {s.name} ({s.role})
            </option>
          ))}
        </select>
        <button type="submit" disabled={!role.trim()}>Request</button>
      </form>
    </>
  );
}

// --- composers --------------------------------------------------------------
function Composer({
  placeholder,
  button,
  onSend,
}: {
  placeholder: string;
  button: string;
  onSend: (text: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    try {
      await onSend(t);
    } catch (err) {
      setDraft(t);
      reportErr(err);
    }
  };
  return (
    <form className="composer" onSubmit={submit}>
      <input placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" disabled={!draft.trim()}>{button}</button>
    </form>
  );
}

function AssignComposer({
  incidentId,
  chart,
}: {
  incidentId: string;
  chart: { ic: string | null; nodes: OrgNode[] };
}) {
  const targets = chart.nodes.filter((n) => n.status === "verified");
  const [target, setTarget] = useState("");
  const [draft, setDraft] = useState("");
  const chosen = target || targets[0]?.pubkey || "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || !chosen) return;
    setDraft("");
    try {
      await publishAssignment(incidentId, chosen, t);
    } catch (err) {
      setDraft(t);
      reportErr(err);
    }
  };

  return (
    <form className="composer assign" onSubmit={submit}>
      <select value={chosen} onChange={(e) => setTarget(e.target.value)}>
        {targets.map((n) => (
          <option key={n.pubkey} value={n.pubkey}>
            to {n.name} ({n.role})
          </option>
        ))}
      </select>
      <input placeholder="Assignment…" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" disabled={!draft.trim() || !chosen}>Assign</button>
    </form>
  );
}

// --- debug panel (mirrors the WebView console; logcat can't see it) ---------
function DebugPanel({ onClose }: { onClose: () => void }) {
  const lines = use$(logs$) ?? [];
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);
  return (
    <div className="dbg">
      <div className="dbg-head">
        <span className="muted">{RELAY} · {lines.length}</span>
        <span>
          <button className="link" onClick={clearLogs}>clear</button>{"  "}
          <button className="link" onClick={onClose}>close</button>
        </span>
      </div>
      <div className="dbg-log">
        {lines.map((l, i) => (
          <div className="dbg-line" key={i}>{l}</div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// --- tab icons (inline SVG, stroke style) -----------------------------------
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IcIncidents = () => svg(<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>);
const IcOverview = () => svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>);
const IcChain = () => svg(<><rect x="9" y="3" width="6" height="5" /><rect x="3" y="16" width="6" height="5" /><rect x="15" y="16" width="6" height="5" /><path d="M12 8v4M6 16v-2h12v2" /></>);
const IcDown = () => svg(<><path d="M12 4v12" /><path d="m6 12 6 6 6-6" /><path d="M4 21h16" /></>);
const IcUp = () => svg(<><path d="M12 20V8" /><path d="m6 12 6-6 6 6" /><path d="M4 3h16" /></>);

// --- helpers ----------------------------------------------------------------
function reportErr(err: unknown) {
  alert(err instanceof Error ? err.message : "failed");
}

function ago(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function time(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
