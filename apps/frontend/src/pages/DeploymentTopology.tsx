import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { TopologyGraph, TopologyNode, TopologyStatus } from '@platform/shared-types';
import { useTopology } from '../lib/topology';
import { useDeployment } from '../lib/deployments';

const STATUS_COLORS: Record<TopologyStatus, string> = {
  healthy: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  unknown: '#94a3b8',
};

const TYPE_ICONS: Record<TopologyNode['type'], string> = {
  repository: '\u{1F4E6}', // package
  cluster: '☁️', // cloud
  namespace: '\u{1F5C2}️', // card index dividers
  deployment: '⚙️', // gear
  pod: '\u{1F7E2}', // circle
  service: '\u{1F310}', // globe
  ingress: '\u{1F6AA}', // door
  configmap: '\u{1F4C4}', // page
  secret: '\u{1F511}', // key
};

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 90;

// A small hand-rolled layered layout (BFS depth from the repository root)
// instead of pulling in a full auto-layout library (e.g. dagre) — this
// graph is shallow and mostly tree-shaped, so a real layout engine would be
// a lot of dependency weight for what a simple column-by-depth pass already
// gets right.
function layout(graph: TopologyGraph): { nodes: Node[]; edges: Edge[] } {
  const childrenOf = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
  }

  const targets = new Set(graph.edges.map((e) => e.target));
  const roots = graph.nodes.filter((n) => !targets.has(n.id));

  const depth = new Map<string, number>();
  const queue: [string, number][] = roots.map((r) => [r.id, 0]);
  while (queue.length > 0) {
    const [id, d] = queue.shift()!;
    if (depth.has(id) && depth.get(id)! <= d) continue;
    depth.set(id, d);
    for (const child of childrenOf.get(id) ?? []) {
      queue.push([child, d + 1]);
    }
  }

  const columnCounts = new Map<number, number>();
  const nodes: Node[] = graph.nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const row = columnCounts.get(d) ?? 0;
    columnCounts.set(d, row + 1);
    return {
      id: n.id,
      type: 'topo',
      position: { x: d * COLUMN_WIDTH, y: row * ROW_HEIGHT },
      data: { node: n },
    };
  });

  // Center each column vertically once row counts are known.
  const maxRows = Math.max(...columnCounts.values());
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const rowsInColumn = columnCounts.get(d) ?? 1;
    const offset = ((maxRows - rowsInColumn) * ROW_HEIGHT) / 2;
    n.position = { ...n.position, y: n.position.y + offset };
  }

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: '#cbd5e1' },
  }));

  return { nodes, edges };
}

function TopoNode({ data }: NodeProps) {
  const node = (data as { node: TopologyNode }).node;
  return (
    <div
      className="rounded-lg border-2 bg-white px-3 py-2 text-center shadow-sm"
      style={{ borderColor: STATUS_COLORS[node.status], minWidth: 140 }}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <div className="text-lg">{TYPE_ICONS[node.type]}</div>
      <div className="text-xs font-medium text-slate-900" title={node.label}>
        {node.label.length > 20 ? `${node.label.slice(0, 18)}...` : node.label}
      </div>
      <div className="text-[10px] uppercase text-slate-400">{node.type}</div>
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  );
}

const nodeTypes = { topo: TopoNode };

export function DeploymentTopology() {
  const { id } = useParams<{ id: string }>();
  const { data: deployment } = useDeployment(id);
  const { data: graph, isPending } = useTopology(id, true);
  const [selected, setSelected] = useState<TopologyNode | null>(null);

  const { nodes, edges } = useMemo(() => (graph ? layout(graph) : { nodes: [], edges: [] }), [graph]);

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to={id ? `/deployments/${id}` : '/'} className="text-sm text-slate-500 hover:underline">
            &larr; Back to deployment
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Infrastructure Topology</h1>
          {deployment && (
            <p className="text-sm text-slate-500">
              {deployment.repositoryFullName} — {deployment.branch}
            </p>
          )}
        </div>
      </div>

      {isPending && <p className="text-sm text-slate-500">Loading topology...</p>}
      {!isPending && !graph && (
        <p className="text-sm text-slate-500">This deployment has no live infrastructure yet.</p>
      )}

      {graph && (
        <div className="flex gap-4">
          <div className="h-[600px] flex-1 rounded-lg border border-slate-200">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelected((n.data as { node: TopologyNode }).node)}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>

          {selected && (
            <div className="w-72 shrink-0 rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-700">{selected.label}</h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  close
                </button>
              </div>
              <p className="mb-3 text-xs uppercase text-slate-400">
                {selected.type} —{' '}
                <span style={{ color: STATUS_COLORS[selected.status] }}>{selected.status}</span>
              </p>
              <dl className="flex flex-col gap-2 text-sm">
                {Object.entries(selected.details).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-400">{k}</dt>
                    <dd className="text-slate-800">{v === null ? '—' : String(v)}</dd>
                  </div>
                ))}
                {Object.keys(selected.details).length === 0 && (
                  <p className="text-slate-400">No additional details.</p>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
