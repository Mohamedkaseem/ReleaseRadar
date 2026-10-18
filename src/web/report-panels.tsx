import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock,
  FileCode2,
  Play,
  ShieldAlert,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Report, Source } from "../shared/schema.js";
import type { GraphData } from "./api.js";
export function Findings({
  report,
  graph,
  selected,
  onSelect,
  onSource,
}: {
  report: Report;
  graph: GraphData | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onSource: (source: Source) => void;
}) {
  return (
    <section className="panel findings-panel">
      <div className="panel-head">
        <div>
          <ShieldAlert size={16} />
          <h2>Impact findings</h2>
          <span className="count">{report.findings.length}</span>
        </div>
      </div>
      {report.findings.length === 0 ? (
        <div className="empty-small">
          {report.status === "running"
            ? "Tracing downstream relationships…"
            : "No downstream breaking impacts found within the declared scope."}
        </div>
      ) : (
        <div className="finding-list">
          {report.findings.map((f) => (
            <article
              key={f.id}
              className={
                selected === f.id ? "finding active-finding" : "finding"
              }
            >
              <button className="finding-main" onClick={() => onSelect(f.id)}>
                <span
                  className={
                    f.state === "confirmed"
                      ? "finding-icon danger"
                      : "finding-icon"
                  }
                >
                  {f.state === "confirmed" ? (
                    <X size={14} />
                  ) : (
                    <TriangleAlert size={14} />
                  )}
                </span>
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.paths[0]?.join(" → ")}</small>
                </span>
                <span
                  className={`tag ${f.state === "confirmed" ? "red" : f.state === "not-reproduced" ? "green" : "amber"}`}
                >
                  {f.state.replaceAll("-", " ")}
                </span>
                <ChevronRight size={14} />
              </button>
              {selected === f.id && (
                <div className="finding-detail">
                  <p>{f.explanation}</p>
                  <div className="source-links">
                    {f.sourceIds.map((id) => {
                      const source = graph?.sources.find((s) => s.id === id);
                      return source ? (
                        <button key={id} onClick={() => onSource(source)}>
                          <FileCode2 size={12} />
                          {source.path.split("/").at(-1)}:{source.line}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
export function Verification({
  report,
  busy,
  onVerify,
}: {
  report: Report;
  busy: boolean;
  onVerify: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const ids = [
    ...new Set([
      ...(report.plannedTests ?? []),
      ...report.findings.flatMap((f) => f.testIds),
      ...report.tests.map((t) => t.testId),
    ]),
  ];
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <Terminal size={16} />
          <h2>Executable verification</h2>
        </div>
        <span className="subtle">Real HTTP services</span>
      </div>
      {!ids.length ? (
        <div className="empty-small">
          Verification plan appears after dependency analysis.
        </div>
      ) : (
        ids.map((id) => {
          const run = report.tests.filter((t) => t.testId === id).at(-1);
          return (
            <div className="test-item" key={id}>
              <div className="test-row">
                <span
                  className={
                    run?.status === "passed"
                      ? "test-icon pass"
                      : run?.status === "failed"
                        ? "test-icon fail"
                        : "test-icon"
                  }
                >
                  {run?.status === "passed" ? (
                    <Check size={16} />
                  ) : run?.status === "failed" ? (
                    <X size={16} />
                  ) : (
                    <Clock size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {id === "checkout"
                      ? "Checkout integration"
                      : "Identity response contract"}
                  </strong>
                  <small>
                    {report.candidate}
                    {run?.durationMs !== undefined
                      ? ` · ${(run.durationMs / 1000).toFixed(2)}s`
                      : ""}
                  </small>
                </div>
                <span className="test-status">{run?.status ?? "not run"}</span>
                {run ? (
                  <button
                    className="text-button"
                    onClick={() => setExpanded(expanded === id ? null : id)}
                  >
                    {expanded === id ? "Hide" : "Output"}
                  </button>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy || report.status === "running"}
                    onClick={() => onVerify(id)}
                  >
                    <Play size={12} />
                    Run
                  </button>
                )}
              </div>
              {expanded === id && (
                <pre className="test-output">
                  {run?.output || "Verification is running…"}
                </pre>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
export function Activity({ report }: { report: Report }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-head">
        <div>
          <Clock size={16} />
          <h2>Investigation activity</h2>
        </div>
        <span className="tag neutral">
          {report.mode === "guided" ? "Guided workflow" : "Model agent"}
        </span>
      </div>
      <ol className="activity-list">
        {report.events.map((event) => (
          <li key={event.id}>
            <span
              className={
                event.status === "error"
                  ? "activity-dot error-dot"
                  : "activity-dot"
              }
            />
            <div>
              <p>{event.message}</p>
              <small>{event.tool.replaceAll("_", " ")}</small>
            </div>
            <time>
              {new Date(event.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function SourceDrawer({
  source,
  onClose,
}: {
  source: Source | null;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!source) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [source, onClose]);
  if (!source) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={drawerRef}
        className="source-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Source evidence"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div>
            <FileCode2 size={18} />
            <h2>Source evidence</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close source evidence"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="source-content">
          <span className="eyebrow">
            IMMUTABLE SNAPSHOT · {source.revision}
          </span>
          <h3>{source.path.split("/").at(-1)}</h3>
          <p className="source-path">
            {source.path}:{source.line}
          </p>
          <pre>
            {source.excerpt.split("\n").map((line, i) => (
              <span key={i}>
                <em>{source.line + i}</em>
                {line}
                {"\n"}
              </span>
            ))}
          </pre>
          <p className="muted">
            This source supports a declared relationship. A dependency path
            establishes potential impact; test execution provides behavioral
            verification.
          </p>
        </div>
      </aside>
    </div>
  );
}
