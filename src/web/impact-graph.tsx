import { useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import { GitBranch, Maximize2 } from "lucide-react";
import type { Finding, GraphNode, Source } from "../shared/schema.js";
import type { GraphData } from "./api.js";
import "@xyflow/react/dist/style.css";
function layout(nodes: GraphNode[]) {
  const positions: Record<string, { x: number; y: number }> = {
    identity: { x: 180, y: 95 },
    orders: { x: 360, y: 95 },
    checkout: { x: 540, y: 95 },
    purchase: { x: 720, y: 70 },
    "customer-profile": { x: 360, y: 270 },
    "test:checkout": { x: 900, y: 70 },
    "test:identity-contract": { x: 540, y: 270 },
    "identity.customer.customerId": { x: 0, y: 95 },
    "identity.customer.id": { x: 0, y: 95 },
  };
  const counts: Record<string, number> = {};
  return nodes.map((n) => {
    const i = counts[n.kind] ?? 0;
    counts[n.kind] = i + 1;
    return {
      ...n,
      position: positions[n.id] ?? {
        x:
          {
            Field: 20,
            Endpoint: 290,
            Service: 560,
            Workflow: 1090,
            Test: 1350,
            Team: 560,
          }[n.kind] ?? 20,
        y: 420 + i * 100,
      },
    };
  });
}
export function ImpactGraph({
  graph,
  findings,
  selected,
  onSource,
}: {
  graph: GraphData | null;
  findings: Finding[];
  selected: string | null;
  onSource: (source: Source) => void;
}) {
  const [scope, setScope] = useState<"impact" | "all">("impact");
  const finding = findings.find((f) => f.id === selected);
  const paths = finding?.paths ?? findings.flatMap((f) => f.paths);
  const active = new Set(paths.flat());
  const visible =
    graph?.nodes.filter(
      (n) =>
        scope === "all" ||
        n.kind === "Service" ||
        n.kind === "Workflow" ||
        n.kind === "Test" ||
        active.has(n.id),
    ) ?? [];
  const ids = new Set(visible.map((n) => n.id));
  const nodes: Node[] = layout(visible).map((n) => ({
    id: n.id,
    position: n.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: (
        <div className="node-inner">
          <span className="node-kind">{n.kind}</span>
          <strong>{n.name}</strong>
          {active.has(n.id) && (
            <span className="node-affected">On impact path</span>
          )}
        </div>
      ),
    },
    className: active.has(n.id) ? "graph-node affected" : "graph-node",
    style: { width: 158 },
    ariaLabel: `${n.kind}: ${n.name}`,
  }));
  const edges: Edge[] = (graph?.edges ?? [])
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.kind.toLowerCase().replaceAll("_", " "),
      type: "smoothstep",
      animated: active.has(e.source) && active.has(e.target),
      markerEnd: { type: MarkerType.ArrowClosed, color: "#536880" },
      style: {
        stroke:
          active.has(e.source) && active.has(e.target) ? "#e9ac65" : "#42556c",
        strokeWidth: 1.5,
      },
      labelStyle: { fill: "#91a3b8", fontSize: 10 },
      labelBgStyle: { fill: "#111923" },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 4,
    }));
  return (
    <section className="panel graph-panel">
      <div className="panel-head">
        <div>
          <GitBranch size={16} />
          <h2>Dependency explorer</h2>
          <span className="subtle">
            {graph
              ? `${visible.length} entities · baseline evidence`
              : "Connected context"}
          </span>
        </div>
        <div className="segmented">
          <button
            className={scope === "impact" ? "selected" : ""}
            onClick={() => setScope("impact")}
          >
            Impact
          </button>
          <button
            className={scope === "all" ? "selected" : ""}
            onClick={() => setScope("all")}
          >
            Full graph
          </button>
        </div>
      </div>
      <div className="graph-canvas">
        {graph ? (
          <ReactFlow
            key={`${graph.snapshot}-${scope}-${selected ?? "all"}`}
            nodes={nodes}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              const sourceId = graph.nodes.find(
                (n) => n.id === node.id,
              )?.sourceId;
              const source = graph.sources.find((s) => s.id === sourceId);
              if (source) onSource(source);
            }}
          >
            <Background color="#263649" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="graph-placeholder">
            <div className="placeholder-chain">
              <span>API contract</span>
              <span className="chain-line" />
              <span>Consumer</span>
              <span className="chain-line" />
              <span>Workflow</span>
            </div>
            <p>Run an investigation to explore the actual dependency graph.</p>
          </div>
        )}
      </div>
      <div className="graph-footer">
        <span>
          <i className="legend-dot amber" />
          Potential impact
        </span>
        <span>
          <i className="legend-dot cyan" />
          Declared dependency
        </span>
        <span className="graph-hint">
          <Maximize2 size={12} /> Scroll to zoom · click a node for evidence
        </span>
      </div>
    </section>
  );
}
