import React, { useState, useEffect, useRef } from 'react';
import { colors, spacing, typography, radius } from '../styles/tokens';

const EVENT_TYPE_COLOR = {
  start: '#3B82F6',
  reported: '#8B5CF6',
  help: '#F97316',
  adverse_action: '#DC2626',
  harassment: '#E11D48',
  end: '#1F2937',
  protected_activity: '#8B5CF6',
  retaliation: '#DC2626'
};

const LINK_TYPE_COLOR = {
  retaliation_chain: '#DC2626',
  escalation: '#F97316',
  caused_by: '#DC2626',
  led_to: '#F97316',
  related: '#6B7280',
  temporal: '#9CA3AF'
};

function getEventColor(evt) {
  if (evt.is_context_event) return '#9CA3AF';
  return EVENT_TYPE_COLOR[evt.event_type] || '#6B7280';
}

function getLinkColor(link) {
  return LINK_TYPE_COLOR[link.link_type] || '#9CA3AF';
}

export default function Connections() {
  const [events, setEvents] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const result = await window.api.connections.list();
    if (result.success) {
      setEvents(result.events || []);
      setLinks(result.links || []);
    }
    setLoading(false);
  }

  // Build node layout: arrange events in columns by date order
  function buildLayout(events, links) {
    if (!events.length) return { nodes: [], edges: [] };

    // Sort events by date
    const sorted = [...events].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

    // Build adjacency for level assignment
    const outgoing = {};
    const incoming = {};
    for (const e of sorted) { outgoing[e.id] = []; incoming[e.id] = []; }
    for (const l of links) {
      if (outgoing[l.source_event_id]) outgoing[l.source_event_id].push(l.target_event_id);
      if (incoming[l.target_event_id]) incoming[l.target_event_id].push(l.source_event_id);
    }

    // Assign columns: events with no incoming links get col 0, others get max(source_col)+1
    const col = {};
    const queue = sorted.filter(e => !incoming[e.id] || incoming[e.id].length === 0);
    for (const e of queue) col[e.id] = 0;

    // BFS to assign columns
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of links) {
        const srcCol = col[l.source_event_id] ?? 0;
        const tgtCol = col[l.target_event_id] ?? 0;
        if (tgtCol <= srcCol) {
          col[l.target_event_id] = srcCol + 1;
          changed = true;
        }
      }
    }

    // Group nodes by column
    const cols = {};
    for (const e of sorted) {
      const c = col[e.id] ?? 0;
      if (!cols[c]) cols[c] = [];
      cols[c].push(e);
    }

    const NODE_W = 160;
    const NODE_H = 56;
    const COL_GAP = 80;
    const ROW_GAP = 20;
    const PAD = 30;

    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const nodes = [];

    for (const c of colKeys) {
      const colEvents = cols[c];
      const x = PAD + c * (NODE_W + COL_GAP);
      colEvents.forEach((e, i) => {
        const y = PAD + i * (NODE_H + ROW_GAP);
        nodes.push({ ...e, x, y, w: NODE_W, h: NODE_H, col: c, row: i });
      });
    }

    const totalCols = colKeys.length;
    const maxRows = Math.max(...colKeys.map(c => cols[c].length));
    const svgW = PAD * 2 + totalCols * (NODE_W + COL_GAP) - COL_GAP;
    const svgH = PAD * 2 + maxRows * (NODE_H + ROW_GAP) - ROW_GAP;

    const nodeById = {};
    for (const n of nodes) nodeById[n.id] = n;

    const edges = links
      .filter(l => nodeById[l.source_event_id] && nodeById[l.target_event_id])
      .map(l => ({
        ...l,
        src: nodeById[l.source_event_id],
        tgt: nodeById[l.target_event_id]
      }));

    return { nodes, edges, svgW, svgH };
  }

  const { nodes, edges, svgW, svgH } = buildLayout(events, links);

  // Connected node IDs for highlight
  const connectedToHovered = new Set();
  if (hoveredNode) {
    connectedToHovered.add(hoveredNode);
    for (const e of edges) {
      if (e.source_event_id === hoveredNode) connectedToHovered.add(e.target_event_id);
      if (e.target_event_id === hoveredNode) connectedToHovered.add(e.source_event_id);
    }
  }

  function renderEdge(edge, i) {
    const { src, tgt } = edge;
    const x1 = src.x + src.w;
    const y1 = src.y + src.h / 2;
    const x2 = tgt.x;
    const y2 = tgt.y + tgt.h / 2;
    const cx = (x1 + x2) / 2;
    const path = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
    const color = getLinkColor(edge);
    const isHighlighted = hoveredNode && (
      edge.source_event_id === hoveredNode || edge.target_event_id === hoveredNode
    );
    const dimmed = hoveredNode && !isHighlighted;

    return (
      <g key={`edge-${i}`}>
        <path
          d={path}
          stroke={color}
          strokeWidth={isHighlighted ? 2.5 : 1.5}
          fill="none"
          opacity={dimmed ? 0.15 : isHighlighted ? 1 : 0.5}
          markerEnd={`url(#arrow-${color.replace('#', '')})`}
        />
      </g>
    );
  }

  function renderNode(node) {
    const color = getEventColor(node);
    const isHovered = hoveredNode === node.id;
    const dimmed = hoveredNode && !connectedToHovered.has(node.id);

    return (
      <g
        key={`node-${node.id}`}
        transform={`translate(${node.x},${node.y})`}
        onMouseEnter={() => setHoveredNode(node.id)}
        onMouseLeave={() => setHoveredNode(null)}
        style={{ cursor: 'pointer' }}
        opacity={dimmed ? 0.2 : 1}
      >
        <rect
          width={node.w}
          height={node.h}
          rx={8}
          fill={color + '18'}
          stroke={isHovered ? color : color + '66'}
          strokeWidth={isHovered ? 2 : 1}
        />
        {/* Type badge strip */}
        <rect width={node.w} height={4} rx={4} fill={color} />
        <text
          x={8}
          y={22}
          fontSize={10}
          fontWeight={700}
          fill={color}
          textAnchor="start"
        >
          {(node.event_type || 'event').toUpperCase().replace(/_/g, ' ')}
          {node.is_context_event ? ' · CTX' : ''}
        </text>
        <foreignObject x={6} y={26} width={node.w - 12} height={node.h - 28}>
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              fontSize: '11px',
              color: '#1F2937',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}
          >
            {node.title}
          </div>
        </foreignObject>
      </g>
    );
  }

  const arrowColors = [...new Set(edges.map(e => getLinkColor(e)))];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Connections</h1>
          <p style={s.subtitle}>
            Cause & effect flow between events · {events.length} events · {links.length} links
          </p>
        </div>
        <button style={s.refreshBtn} onClick={loadData}>Refresh</button>
      </div>

      {loading && <div style={s.loading}>Loading connections...</div>}

      {!loading && events.length === 0 && (
        <div style={s.empty}>
          No events yet. Add moments in the Timeline and link them using the Cause & Effect section in the event panel.
        </div>
      )}

      {!loading && events.length > 0 && links.length === 0 && (
        <div style={s.empty}>
          No connections yet. Open an event in the Timeline and use the Cause & Effect section to link events.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={s.svgWrapper}>
          <svg
            ref={svgRef}
            width={Math.max(svgW || 0, 600)}
            height={Math.max(svgH || 0, 200)}
            style={{ display: 'block' }}
          >
            <defs>
              {arrowColors.map(color => (
                <marker
                  key={color}
                  id={`arrow-${color.replace('#', '')}`}
                  markerWidth={8}
                  markerHeight={8}
                  refX={8}
                  refY={3}
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill={color} />
                </marker>
              ))}
              {/* Default arrow */}
              <marker id="arrow-9CA3AF" markerWidth={8} markerHeight={8} refX={8} refY={3} orient="auto">
                <path d="M0,0 L0,6 L9,3 z" fill="#9CA3AF" />
              </marker>
            </defs>

            {edges.map((edge, i) => renderEdge(edge, i))}
            {nodes.map(node => renderNode(node))}
          </svg>
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div style={s.legend}>
          <span style={s.legendTitle}>Event types:</span>
          {[
            ['#DC2626', 'Adverse Action / Harassment'],
            ['#8B5CF6', 'Protected Activity / Reported'],
            ['#F97316', 'Help Request'],
            ['#3B82F6', 'Start'],
            ['#9CA3AF', 'Context (background)']
          ].map(([color, label]) => (
            <div key={color} style={s.legendItem}>
              <div style={{ ...s.legendDot, background: color }} />
              <span>{label}</span>
            </div>
          ))}
          <span style={{ ...s.legendTitle, marginLeft: spacing.lg }}>Links:</span>
          {[
            ['#DC2626', 'Retaliation / Caused by'],
            ['#F97316', 'Escalation / Led to'],
            ['#6B7280', 'Related']
          ].map(([color, label]) => (
            <div key={color} style={s.legendItem}>
              <div style={{ ...s.legendLine, background: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${spacing.lg} ${spacing.xl}`, borderBottom: `1px solid ${colors.border}`, flexShrink: 0
  },
  title: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, margin: 0 },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textMuted, margin: `${spacing.xs} 0 0 0` },
  refreshBtn: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
    borderRadius: radius.md, fontSize: typography.fontSize.sm, cursor: 'pointer', color: colors.textSecondary
  },
  loading: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted },
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: colors.textMuted, textAlign: 'center', padding: spacing.xxl,
    fontSize: typography.fontSize.base, maxWidth: '500px', margin: '0 auto'
  },
  svgWrapper: { flex: 1, overflow: 'auto', padding: spacing.lg, background: colors.bg },
  legend: {
    display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap',
    padding: `${spacing.sm} ${spacing.xl}`,
    borderTop: `1px solid ${colors.border}`, background: colors.surfaceAlt,
    fontSize: typography.fontSize.xs, color: colors.textMuted, flexShrink: 0
  },
  legendTitle: { fontWeight: typography.fontWeight.semibold, color: colors.textSecondary },
  legendItem: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: '10px', height: '10px', borderRadius: '50%' },
  legendLine: { width: '20px', height: '3px', borderRadius: '2px' }
};
