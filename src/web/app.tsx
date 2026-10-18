import { useState } from "react";
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronDown,
  GitCompareArrows,
  GitPullRequest,
  History,
  Layers3,
  Play,
  Radar,
  Radio,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Revision, Report } from "../shared/schema.js";
import { useReleaseRadar } from "./use-release-radar.js";
import { ImpactGraph } from "./impact-graph.js";
import {
  Activity,
  Findings,
  SourceDrawer,
  Verification,
} from "./report-panels.js";
import { downloadReport } from "./api.js";
const verdictLabels: Record<Report["verdict"], string> = {
  investigating: "Investigating release",
  blocked: "Release blocked",
  "needs-verification": "Needs verification",
  "checks-passed": "Checks passed within scope",
};
export default function App() {
  const app = useReleaseRadar();
  const [revision, setRevision] = useState<Revision>("breaking");
  const [mode, setMode] = useState<"guided" | "model">("guided");
  const [autoVerify, setAutoVerify] = useState(true);
  const [question, setQuestion] = useState(
    "Can we ship this release? Investigate the customer ID change and verify checkout.",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"workspace" | "history" | "guide">(
    "workspace",
  );
  const running = app.busy || app.report?.status === "running";
  function start(candidate: Revision = revision) {
    setView("workspace");
    setSelected(null);
    void app.investigate(candidate, mode, autoVerify, question);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ReleaseRadar home">
          <span className="brand-mark">
            <Radar size={23} />
          </span>
          <span>
            Release<span className="brand-light">Radar</span>
            <small>CONTEXT BEFORE CONFIDENCE</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch">
          <span className="workspace-avatar">C</span>
          <div>
            <strong>Commerce demo</strong>
            <small>Synthetic public sample</small>
          </div>
          <ChevronDown size={13} />
        </div>
        <nav aria-label="Main navigation">
          <button
            className={
              view === "workspace" ? "nav-item nav-active" : "nav-item"
            }
            onClick={() => setView("workspace")}
          >
            <Layers3 size={17} />
            Release workspace<span className="nav-key">⌘ 1</span>
          </button>
          <button
            className={view === "history" ? "nav-item nav-active" : "nav-item"}
            onClick={() => {
              setView("history");
              void app.refresh();
            }}
          >
            <History size={17} />
            Investigations
            <span className="nav-count">{app.reports.length}</span>
          </button>
          <button
            className={view === "guide" ? "nav-item nav-active" : "nav-item"}
            onClick={() => setView("guide")}
          >
            <BookOpen size={17} />
            Demo guide
          </button>
        </nav>
        <div className="sidebar-section">
          <span className="workspace-label">RECENT INVESTIGATIONS</span>
          {app.reports.slice(0, 5).map((report) => (
            <button
              className="recent-item"
              key={report.id}
              onClick={() => {
                setView("workspace");
                setSelected(null);
                void app.select(report.id);
              }}
            >
              <span
                className={
                  report.verdict === "blocked"
                    ? "recent-dot red-dot"
                    : "recent-dot"
                }
              />
              <div>
                <strong>{report.candidate}</strong>
                <small>
                  {new Date(report.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {report.id.slice(0, 6)}
                </small>
              </div>
            </button>
          ))}
          {!app.reports.length && (
            <p className="sidebar-empty">
              Your investigations will appear here.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="powered">
            <span className="falkor-mark">F</span>
            <div>
              <strong>Powered by FalkorDB</strong>
              <small>Connected data. Traceable decisions.</small>
            </div>
          </div>
          <div className="local-note">
            <span className="recent-dot" />
            Local workspace · no external writes
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>
              {view === "workspace"
                ? "Release intelligence"
                : view === "history"
                  ? "Investigations"
                  : "Demo guide"}
            </strong>
          </div>
          <div className="topbar-right">
            <span
              className={app.health?.ok ? "connection connected" : "connection"}
            >
              <Radio size={12} />
              {app.health?.ok ? "FalkorDB connected" : "Database unavailable"}
            </span>
            <span className="sample-badge">LOCAL DEMO</span>
          </div>
        </header>
        <main>
          {app.error && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={16} />
              <span>{app.error}</span>
              <button
                aria-label="Dismiss error"
                onClick={() => app.setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {app.health && !app.health.ok && (
            <div className="error-banner">
              <TriangleAlert size={16} />
              <span>
                Start the database with <code>npm run db:up</code>. ReleaseRadar
                requires FalkorDB; impact results are never substituted.
              </span>
            </div>
          )}
          {view === "workspace" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    <span className="tiny-line" />
                    RELEASE INTELLIGENCE
                  </span>
                  <h1>
                    Evidence before release<span>.</span>
                  </h1>
                  <p>
                    Trace the change. Understand the impact. Verify what
                    matters.
                  </p>
                </div>
                {app.report && (
                  <button
                    className="button secondary"
                    onClick={() => downloadReport(app.report!)}
                  >
                    <ArrowDownToLine size={15} />
                    Export report
                  </button>
                )}
              </div>
              <section className="panel release-input">
                <div className="release-input-top">
                  <div className="release-icon">
                    <GitPullRequest size={20} />
                  </div>
                  <div>
                    <h2>Investigate a release</h2>
                    <p>Compare an immutable baseline with a proposed change.</p>
                  </div>
                  <span className="tag neutral">
                    <GitCompareArrows size={12} />
                    Contract analysis
                  </span>
                </div>
                <div className="release-controls">
                  <div className="revision-pair">
                    <div className="revision-box">
                      <label htmlFor="baseline">BASELINE</label>
                      <select id="baseline" disabled value="baseline">
                        <option value="baseline">baseline · stable</option>
                      </select>
                    </div>
                    <ArrowRight className="revision-arrow" size={17} />
                    <div className="revision-box candidate-box">
                      <label htmlFor="candidate">CANDIDATE</label>
                      <select
                        id="candidate"
                        value={revision}
                        onChange={(e) =>
                          setRevision(e.target.value as Revision)
                        }
                        disabled={running}
                      >
                        {app.options
                          .filter((o) => o.id !== "baseline")
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <button
                    className="button primary"
                    disabled={running || !app.health?.ok}
                    onClick={() => start()}
                  >
                    {running ? (
                      <span className="spinner" />
                    ) : (
                      <Sparkles size={16} />
                    )}{" "}
                    {running ? "Investigating…" : "Investigate release"}
                    {!running && <ArrowRight size={15} />}
                  </button>
                </div>
                <div className="question-row">
                  <label htmlFor="question" className="sr-only">
                    Investigation question
                  </label>
                  <input
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={2000}
                  />
                </div>
                <div className="release-input-bottom">
                  <span>
                    <i className="legend-dot cyan" />
                    {app.options.find((o) => o.id === revision)?.description ??
                      "Loading sample revisions…"}
                  </span>
                  <div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={autoVerify}
                        onChange={(e) => setAutoVerify(e.target.checked)}
                      />
                      Run verification
                    </label>
                    <label className="mode-select">
                      <span className="sr-only">Agent mode</span>
                      <select
                        value={mode}
                        onChange={(e) =>
                          setMode(e.target.value as "guided" | "model")
                        }
                      >
                        <option value="guided">Guided workflow</option>
                        <option
                          value="model"
                          disabled={!app.health?.modelConfigured}
                        >
                          Model agent
                          {app.health?.modelConfigured
                            ? ""
                            : " · configure provider"}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
              </section>
              {app.report ? (
                <>
                  <section
                    className={`verdict-banner verdict-${app.report.verdict}`}
                  >
                    <span className="verdict-symbol">
                      {app.report.verdict === "blocked" ? (
                        <X size={22} />
                      ) : app.report.verdict === "checks-passed" ? (
                        <ShieldCheck size={22} />
                      ) : (
                        <ActivityIcon size={22} />
                      )}
                    </span>
                    <div>
                      <span className="eyebrow">
                        {app.report.baseline} → {app.report.candidate} ·{" "}
                        {app.report.id.slice(0, 8)}
                      </span>
                      <h2>{verdictLabels[app.report.verdict]}</h2>
                      <p>{app.report.summary}</p>
                    </div>
                    {app.report.verdict === "blocked" && (
                      <button
                        className="button secondary"
                        disabled={running}
                        onClick={() => {
                          setRevision("fixed");
                          start("fixed");
                        }}
                      >
                        Verify compatible fix
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </section>
                  <div className="metric-row">
                    <Metric
                      label="Contract changes"
                      value={app.report.changes.length}
                      detail="Deterministic comparison"
                    />
                    <Metric
                      label="Potential service impacts"
                      value={
                        new Set(app.report.findings.map((f) => f.serviceId))
                          .size
                      }
                      detail="From declared graph paths"
                    />
                    <Metric
                      label="Checks passed"
                      value={`${app.report.tests.filter((t) => t.status === "passed").length} / ${app.report.tests.length}`}
                      detail="Executed against candidate"
                    />
                    <Metric
                      label="Evidence sources"
                      value={
                        new Set(app.report.findings.flatMap((f) => f.sourceIds))
                          .size
                      }
                      detail="Revision-specific references"
                    />
                  </div>
                </>
              ) : (
                <div className="intro-strip">
                  <div>
                    <span className="intro-number">01</span>
                    <span>
                      <strong>A small change. A hidden dependency.</strong>
                      <small>
                        The breaking snapshot renames a field used by Orders.
                        Discover whether Checkout is affected.
                      </small>
                    </span>
                  </div>
                  <span className="tag cyan">
                    3 services · real HTTP checks
                  </span>
                </div>
              )}
              <ImpactGraph
                graph={app.graph}
                findings={app.report?.findings ?? []}
                selected={selected}
                onSource={app.setSource}
              />
              {app.report && (
                <>
                  <Findings
                    report={app.report}
                    graph={app.graph}
                    selected={selected}
                    onSelect={setSelected}
                    onSource={app.setSource}
                  />
                  <div className="bottom-grid">
                    <Verification
                      report={app.report}
                      busy={app.busy}
                      onVerify={(id) => {
                        void app.verify(id);
                      }}
                    />
                    <Activity report={app.report} />
                  </div>
                  {app.report.warnings.length > 0 && (
                    <div className="scope-warning">
                      <TriangleAlert size={17} />
                      <div>
                        <strong>Scope requires attention</strong>
                        {app.report.warnings.map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {app.report.modelNote && (
                    <section className="panel model-note">
                      <h2>Agent explanation</h2>
                      <p>{app.report.modelNote}</p>
                    </section>
                  )}
                </>
              )}
              <footer className="workspace-footer">
                <span>
                  <ShieldCheck size={13} />
                  Recommendations are limited to declared dependencies and
                  executed checks.
                </span>
                <span>Built on connected evidence</span>
              </footer>
            </>
          )}
          {view === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PERSISTENT CONTEXT</span>
                  <h1>
                    Investigation history<span>.</span>
                  </h1>
                  <p>
                    Evidence and verification outcomes, preserved in FalkorDB.
                  </p>
                </div>
              </div>
              <div className="panel history-table">
                <div className="history-header">
                  <span>Candidate</span>
                  <span>Recommendation</span>
                  <span>Created</span>
                  <span>Checks</span>
                </div>
                {app.reports.map((report) => (
                  <button
                    className="history-row"
                    key={report.id}
                    onClick={() => {
                      setView("workspace");
                      void app.select(report.id);
                    }}
                  >
                    <strong>
                      {report.candidate}
                      <small>{report.id.slice(0, 8)}</small>
                    </strong>
                    <span
                      className={
                        report.verdict === "blocked"
                          ? "tag red"
                          : report.verdict === "checks-passed"
                            ? "tag green"
                            : "tag amber"
                      }
                    >
                      {verdictLabels[report.verdict]}
                    </span>
                    <span>{new Date(report.createdAt).toLocaleString()}</span>
                    <span>
                      {report.tests.filter((t) => t.status === "passed").length}
                      /{report.tests.length}
                      <ChevronDown size={12} />
                    </span>
                  </button>
                ))}
                {!app.reports.length && (
                  <div className="empty-small">
                    No investigations yet. Start from the release workspace.
                  </div>
                )}
              </div>
            </>
          )}
          {view === "guide" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE THREE-MINUTE STORY</span>
                  <h1>
                    From change to confidence<span>.</span>
                  </h1>
                  <p>A reproducible investigation with real outcomes.</p>
                </div>
              </div>
              <section className="panel guide">
                <div>
                  <span>01</span>
                  <h2>Investigate the breaking rename</h2>
                  <p>
                    Identity returns id instead of customerId. Orders still
                    reads customerId. The graph discovers the indirect Checkout
                    dependency.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <h2>Inspect evidence and execute checks</h2>
                  <p>
                    Click a finding, then a source. Open test output to inspect
                    the actual HTTP failure across the three running services.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <h2>Verify the compatible fix</h2>
                  <p>
                    Restore customerId alongside id. Reinvestigate and inspect
                    passing results. The original failed investigation remains
                    in history.
                  </p>
                </div>
                <div>
                  <span>04</span>
                  <h2>Understand the boundaries</h2>
                  <p>
                    These snapshots are synthetic. Dependencies are explicitly
                    declared. Guided mode is a deterministic workflow; model
                    mode requires your own provider configuration. Verification
                    executes only the trusted bundled sample.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setView("workspace")}
                >
                  <Play size={15} />
                  Open release workspace
                </button>
              </section>
            </>
          )}
        </main>
      </div>
      <SourceDrawer source={app.source} onClose={() => app.setSource(null)} />
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
