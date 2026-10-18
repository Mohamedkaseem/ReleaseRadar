import { useCallback, useEffect, useRef, useState } from "react";
import type { Report, Revision, Source } from "../shared/schema.js";
import { request, type GraphData, type RevisionOption } from "./api.js";
export function useReleaseRadar() {
  const [health, setHealth] = useState<{
    ok: boolean;
    modelConfigured: boolean;
  } | null>(null);
  const [options, setOptions] = useState<RevisionOption[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const selected = useRef<string | null>(null);
  const graphLoaded = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const status = await request<{ ok: boolean; modelConfigured: boolean }>(
        "/api/health",
      );
      setHealth(status);
      const history = await request<{ reports: Report[] }>(
        "/api/investigations",
      );
      setReports(history.reports);
    } catch {
      setHealth({ ok: false, modelConfigured: false });
    }
  }, []);
  useEffect(() => {
    void refresh();
    void request<{ revisions: RevisionOption[] }>("/api/revisions")
      .then((r) => setOptions(r.revisions))
      .catch((e) => setError(String(e)));
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  const loadGraph = useCallback(async (id: string) => {
    const value = await request<GraphData>(`/api/investigations/${id}/graph`);
    if (selected.current === id) {
      setGraph(value);
      graphLoaded.current = id;
    }
  }, []);
  const select = useCallback(
    async (id: string) => {
      selected.current = id;
      setError("");
      setGraph(null);
      graphLoaded.current = null;
      try {
        const value = await request<Report>(`/api/investigations/${id}`);
        if (selected.current !== id) return;
        setReport(value);
        if (value.events.length) await loadGraph(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [loadGraph],
  );
  useEffect(() => {
    if (!report || report.status !== "running") return;
    const stream = new EventSource(`/api/investigations/${report.id}/events`);
    stream.onmessage = (event) => {
      const current = JSON.parse(event.data) as Report;
      if (selected.current !== current.id) return;
      setReport(current);
      if (current.events.length && graphLoaded.current !== current.id) {
        graphLoaded.current = current.id;
        void loadGraph(current.id).catch(() => {
          graphLoaded.current = null;
        });
      }
      if (current.status !== "running") {
        stream.close();
        void refresh();
      }
    };
    stream.onerror = () => {
      stream.close();
      setError(
        "Live connection interrupted. Reload this investigation from history.",
      );
    };
    return () => stream.close();
  }, [report?.id, report?.status, loadGraph, refresh]);
  const investigate = useCallback(
    async (
      candidate: Revision,
      mode: "guided" | "model",
      autoVerify: boolean,
      question: string,
    ) => {
      setBusy(true);
      setError("");
      setGraph(null);
      setSource(null);
      try {
        const value = await request<Report>("/api/investigations", {
          method: "POST",
          body: JSON.stringify({
            baseline: "baseline",
            candidate,
            mode,
            autoVerify,
            question,
          }),
        });
        selected.current = value.id;
        graphLoaded.current = null;
        setReport(value);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  const verify = useCallback(
    async (testId: string) => {
      if (!report) return;
      setBusy(true);
      setError("");
      try {
        const value = await request<Report>(
          `/api/investigations/${report.id}/test-runs`,
          { method: "POST", body: JSON.stringify({ testId }) },
        );
        setReport(value);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [report, refresh],
  );
  return {
    health,
    options,
    reports,
    report,
    graph,
    error,
    busy,
    source,
    setSource,
    setError,
    investigate,
    select,
    verify,
    refresh,
  };
}
