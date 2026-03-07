import React, { useState, useEffect } from 'react';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';

export default function Dashboard({ onNavigateToTimeline, onNavigateToPeople, onSelectDocument, onSelectActor }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [precedentAnalysis, setPrecedentAnalysis] = useState(null);
  const [actors, setActors] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [connections, setConnections] = useState([]);
  const [escalation, setEscalation] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [showCaseStrength, setShowCaseStrength] = useState(false);

  function toggleSection(section) {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);

    const [docsResult, incidentsResult, actorsResult, precedentResult, connectionsResult] = await Promise.all([
      window.api.documents.list(),
      window.api.incidents.list(),
      window.api.actors.list(),
      window.api.precedents.analyze(),
      window.api.timeline.getConnections()
    ]);

    if (docsResult.success) setDocuments(docsResult.documents);
    if (incidentsResult.success) setIncidents(incidentsResult.incidents);
    if (actorsResult.success) setActors(actorsResult.actors);
    if (precedentResult.success) setPrecedentAnalysis(precedentResult.analysis);
    if (connectionsResult.success) {
      setConnections(connectionsResult.connections);
      setEscalation(connectionsResult.escalation);
    }

    // Compute stats
    const docs = docsResult.documents || [];
    const incs = incidentsResult.incidents || [];
    const acts = actorsResult.actors || [];

    const allDates = [
      ...docs.filter(d => d.document_date).map(d => new Date(d.document_date)),
      ...incs.filter(i => i.incident_date).map(i => new Date(i.incident_date))
    ];

    const computed = {
      documentCount: docs.length,
      incidentCount: incs.length,
      actorCount: acts.length,
      badActorCount: acts.filter(a => a.classification === 'bad_actor').length,
      witnessCount: acts.filter(a => a.classification?.startsWith('witness')).length,
      earliestDate: allDates.length > 0 ? new Date(Math.min(...allDates)) : null,
      latestDate: allDates.length > 0 ? new Date(Math.max(...allDates)) : null,
      timelineSpanDays: allDates.length > 1
        ? Math.ceil((Math.max(...allDates) - Math.min(...allDates)) / (1000 * 60 * 60 * 24))
        : 0
    };

    // Calculate filing deadlines
    if (computed.latestDate) {
      const now = new Date();
      const fchrDeadline = new Date(computed.latestDate);
      fchrDeadline.setDate(fchrDeadline.getDate() + 365);
      const eeocDeadline = new Date(computed.latestDate);
      eeocDeadline.setDate(eeocDeadline.getDate() + 300);

      computed.fchrDaysRemaining = Math.ceil((fchrDeadline - now) / (1000 * 60 * 60 * 24));
      computed.eeocDaysRemaining = Math.ceil((eeocDeadline - now) / (1000 * 60 * 60 * 24));
    }

    setStats(computed);
    setLoading(false);
  }

  // Generate natural language summary
  function generateSummary() {
    if (!stats || stats.documentCount === 0) {
      return "No evidence has been added yet. Drop documents onto the Timeline to begin building your case.";
    }

    const parts = [];

    // Timeline span
    if (stats.earliestDate && stats.latestDate) {
      parts.push(`This case spans ${stats.timelineSpanDays} days, from ${formatDate(stats.earliestDate)} to ${formatDate(stats.latestDate)}.`);
    }

    // Evidence count
    parts.push(`You have documented ${stats.documentCount} piece${stats.documentCount !== 1 ? 's' : ''} of evidence and ${stats.incidentCount} incident${stats.incidentCount !== 1 ? 's' : ''}.`);

    // Actors
    if (stats.badActorCount > 0) {
      parts.push(`${stats.badActorCount} person${stats.badActorCount !== 1 ? 's have' : ' has'} been identified as bad actor${stats.badActorCount !== 1 ? 's' : ''}.`);
    }
    if (stats.witnessCount > 0) {
      parts.push(`${stats.witnessCount} potential witness${stats.witnessCount !== 1 ? 'es' : ''} identified.`);
    }

    // Patterns
    if (escalation?.hasEscalation) {
      parts.push(`\u26A0\uFE0F An escalating pattern of severity has been detected.`);
    }

    const retaliationConnections = connections.filter(c => c.connectionType === 'retaliation_chain');
    if (retaliationConnections.length > 0) {
      const closestTiming = Math.min(...retaliationConnections.map(c => c.daysBetween));
      parts.push(`\u26A0\uFE0F Potential retaliation detected: adverse action occurred ${closestTiming} days after protected activity.`);
    }

    return parts.join(' ');
  }

  // Get pattern alerts
  function getAlerts() {
    const alerts = [];

    // Escalation
    if (escalation?.hasEscalation) {
      alerts.push({
        type: 'escalation',
        severity: 'warning',
        title: 'Escalating Pattern',
        description: `Severity trending ${escalation.trend}: ${escalation.escalations} escalations vs ${escalation.deescalations} de-escalations`,
        legal: 'Harris v. Forklift - pattern demonstrates hostile environment'
      });
    }

    // Retaliation timing
    const retaliationConns = connections.filter(c => c.connectionType === 'retaliation_chain');
    retaliationConns.forEach(conn => {
      if (conn.daysBetween <= 14) {
        alerts.push({
          type: 'retaliation',
          severity: 'critical',
          title: `${conn.daysBetween} Days After Protected Activity`,
          description: 'Very close temporal proximity strongly supports retaliation inference',
          legal: 'Burlington Northern v. White'
        });
      } else if (conn.daysBetween <= 30) {
        alerts.push({
          type: 'retaliation',
          severity: 'warning',
          title: `${conn.daysBetween} Days After Protected Activity`,
          description: 'Close temporal proximity supports retaliation claim',
          legal: 'Burlington Northern v. White'
        });
      }
    });

    // Temporal clusters
    const clusterConns = connections.filter(c => c.connectionType === 'temporal_cluster');
    clusterConns.forEach(conn => {
      alerts.push({
        type: 'cluster',
        severity: 'info',
        title: 'Event Cluster Detected',
        description: conn.description,
        legal: 'Morgan - continuing violation pattern'
      });
    });

    return alerts;
  }

  // Get pattern insights
  function getPatternInsights() {
    const insights = [];

    // Count requests for help
    const helpCount = documents.filter(d => d.evidence_type === 'REQUEST_FOR_HELP').length;
    if (helpCount > 0) {
      insights.push({
        icon: '\uD83D\uDE4B',
        count: helpCount,
        label: `time${helpCount !== 1 ? 's' : ''} you asked for help`,
        legal: 'Protected activity under Title VII and ADA — documented requests for help establish you engaged in protected conduct'
      });
    }

    // Count adverse actions
    const adverseCount = documents.filter(d => d.evidence_type === 'ADVERSE_ACTION').length;
    if (adverseCount > 0) {
      insights.push({
        icon: '\u26A0\uFE0F',
        count: adverseCount,
        label: `adverse action${adverseCount !== 1 ? 's' : ''} documented`,
        legal: 'Each adverse action may constitute a separate claim — Burlington Northern v. White'
      });
    }

    // Count incidents
    if (incidents.length > 0) {
      insights.push({
        icon: '\u26A1',
        count: incidents.length,
        label: `incident${incidents.length !== 1 ? 's' : ''} recorded`,
        legal: 'Pattern of incidents supports hostile work environment claim — Harris v. Forklift'
      });
    }

    // Count retaliation chains
    const retaliationCount = connections.filter(c => c.connectionType === 'retaliation_chain').length;
    if (retaliationCount > 0) {
      insights.push({
        icon: '\uD83D\uDD17',
        count: retaliationCount,
        label: `retaliation chain${retaliationCount !== 1 ? 's' : ''} detected`,
        legal: 'Temporal proximity between protected activity and adverse action supports retaliation inference'
      });
    }

    // Escalation trend
    if (escalation?.hasEscalation) {
      insights.push({
        icon: '\uD83D\uDCC8',
        count: escalation.escalations,
        label: `escalation${escalation.escalations !== 1 ? 's' : ''} vs ${escalation.deescalations} de-escalation${escalation.deescalations !== 1 ? 's' : ''}`,
        legal: 'Escalating pattern demonstrates worsening hostile environment — Faragher v. City of Boca Raton'
      });
    }

    // Count temporal clusters
    const clusterCount = connections.filter(c => c.connectionType === 'temporal_cluster').length;
    if (clusterCount > 0) {
      insights.push({
        icon: '\uD83D\uDCCD',
        count: clusterCount,
        label: `temporal cluster${clusterCount !== 1 ? 's' : ''} detected`,
        legal: 'Clustering of events supports continuing violation theory — Morgan v. Nat\'l R.R. Passenger Corp.'
      });
    }

    return insights;
  }

  // Get evidence gaps
  function getGaps() {
    if (!precedentAnalysis?.precedents) return [];

    const allGaps = [];

    Object.entries(precedentAnalysis.precedents).forEach(([key, prec]) => {
      if (prec.gaps && prec.gaps.length > 0) {
        prec.gaps.forEach(gap => {
          allGaps.push({
            precedent: prec.name,
            precedentKey: key,
            ...gap
          });
        });
      }
    });

    return allGaps;
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.loadingSpinner} />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  const alerts = getAlerts();
  const gaps = getGaps();
  const topActors = actors
    .filter(a => a.classification === 'bad_actor' || a.classification === 'enabler')
    .slice(0, 5);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>Fresh eyes view of your case</p>
      </div>

      <div style={styles.content}>
        {/* Summary Card */}
        <div style={styles.summaryCard}>
          <h2 style={styles.cardTitle}>Case Summary</h2>
          <p style={styles.summaryText}>{generateSummary()}</p>
        </div>

        {/* Pattern Insights */}
        {(() => {
          const insights = getPatternInsights();
          if (insights.length === 0) return null;
          return (
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('insights')}
              >
                <span style={styles.chevron}>{collapsedSections.insights ? '\u25B6' : '\u25BC'}</span>
                Pattern Insights
                <span style={styles.badge}>{insights.length}</span>
              </h3>
              {!collapsedSections.insights && (
                <div style={styles.insightsGrid}>
                  {insights.map((insight, i) => (
                    <div key={i} style={styles.insightItem}>
                      <div style={styles.insightTop}>
                        <span style={styles.insightIcon}>{insight.icon}</span>
                        <span style={styles.insightCount}>{insight.count}</span>
                        <span style={styles.insightLabel}>{insight.label}</span>
                      </div>
                      <div style={styles.insightLegal}>{insight.legal}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stats Row */}
        <div style={styles.statsRow}>
          <StatCard
            icon={'\uD83D\uDCC4'}
            value={stats?.documentCount || 0}
            label="Documents"
            onClick={onNavigateToTimeline}
          />
          <StatCard
            icon={'\u26A1'}
            value={stats?.incidentCount || 0}
            label="Incidents"
            onClick={onNavigateToTimeline}
          />
          <StatCard
            icon={'\uD83D\uDC65'}
            value={stats?.actorCount || 0}
            label="People"
            sublabel={stats?.badActorCount > 0 ? `${stats.badActorCount} bad actor${stats.badActorCount !== 1 ? 's' : ''}` : null}
            onClick={onNavigateToPeople}
          />
          <StatCard
            icon={'\uD83D\uDCC5'}
            value={stats?.timelineSpanDays || 0}
            label="Days Span"
          />
        </div>

        {/* Case Strength */}
        {precedentAnalysis && (
          <div style={styles.card}>
            <h3
              style={styles.collapsibleTitle}
              onClick={() => toggleSection('strength')}
            >
              <span style={styles.chevron}>{collapsedSections.strength ? '\u25B6' : '\u25BC'}</span>
              Case Strength
              <span style={{
                ...styles.strengthBadge,
                background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                             precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
              }}>{precedentAnalysis.caseStrength}%</span>
            </h3>
            {!collapsedSections.strength && (
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => setShowCaseStrength(true)}
                title="Click for detailed precedent analysis"
              >
                <div style={styles.strengthMeter}>
                  <div style={styles.strengthBarOuter}>
                    <div
                      style={{
                        ...styles.strengthBarInner,
                        width: `${precedentAnalysis.caseStrength}%`,
                        background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                                   precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
                      }}
                    />
                  </div>
                  <span style={styles.strengthValue}>{precedentAnalysis.caseStrength}%</span>
                </div>
                <div style={styles.precedentRow}>
                  {Object.entries(precedentAnalysis.precedents).slice(0, 3).map(([key, prec]) => (
                    <div key={key} style={styles.precedentMini}>
                      <span style={styles.precedentName}>{prec.name.split(' v.')[0]}</span>
                      <span style={{
                        ...styles.precedentScore,
                        color: prec.alignmentPercent >= 70 ? colors.success :
                               prec.alignmentPercent >= 40 ? colors.warning : colors.error
                      }}>
                        {prec.alignmentPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left: Alerts */}
          <div style={styles.column}>
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('alerts')}
              >
                <span style={styles.chevron}>{collapsedSections.alerts ? '\u25B6' : '\u25BC'}</span>
                Pattern Alerts
                {alerts.length > 0 && <span style={styles.badge}>{alerts.length}</span>}
              </h3>
              {!collapsedSections.alerts && (
                alerts.length === 0 ? (
                  <p style={styles.emptyText}>No patterns detected yet. Add more evidence to identify patterns.</p>
                ) : (
                  <div style={styles.alertList}>
                    {alerts.map((alert, i) => (
                      <div
                        key={i}
                        style={{
                          ...styles.alertItem,
                          ...styles.clickableItem,
                          borderLeftColor: alert.severity === 'critical' ? colors.error :
                                           alert.severity === 'warning' ? colors.warning : colors.primary
                        }}
                        onClick={onNavigateToTimeline}
                        title="View on timeline"
                      >
                        <div style={styles.alertTitle}>{alert.title}</div>
                        <div style={styles.alertDesc}>{alert.description}</div>
                        <div style={styles.alertLegal}>{alert.legal}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Filing Deadlines */}
            {stats?.fchrDaysRemaining && (
              <div style={styles.card}>
                <h3
                  style={styles.collapsibleTitle}
                  onClick={() => toggleSection('deadlines')}
                >
                  <span style={styles.chevron}>{collapsedSections.deadlines ? '\u25B6' : '\u25BC'}</span>
                  Filing Deadlines
                </h3>
                {!collapsedSections.deadlines && (
                  <>
                    <div style={styles.deadlineList}>
                      <DeadlineItem
                        agency="FCHR (Florida)"
                        days={stats.fchrDaysRemaining}
                        total={365}
                      />
                      <DeadlineItem
                        agency="EEOC (Federal)"
                        days={stats.eeocDaysRemaining}
                        total={300}
                      />
                    </div>
                    <p style={styles.deadlineNote}>
                      Based on most recent documented incident
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Gaps + Key Players */}
          <div style={styles.column}>
            {/* Evidence Gaps */}
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('gaps')}
              >
                <span style={styles.chevron}>{collapsedSections.gaps ? '\u25B6' : '\u25BC'}</span>
                Evidence Gaps
                {gaps.length > 0 && <span style={styles.badge}>{gaps.length}</span>}
              </h3>
              {!collapsedSections.gaps && (
                gaps.length === 0 ? (
                  <p style={styles.emptyText}>No critical gaps identified. Keep documenting!</p>
                ) : (
                  <div style={styles.gapList}>
                    {gaps.map((gap, i) => (
                      <div
                        key={i}
                        style={{...styles.gapItem, ...styles.clickableItem}}
                        onClick={() => onNavigateToTimeline?.()}
                        title={`${gap.recommendation}\n\nPrecedent: ${gap.precedent}`}
                      >
                        <div style={styles.gapElement}>{gap.element}</div>
                        <div style={styles.gapRec}>{gap.recommendation}</div>
                        <div style={styles.gapPrecedent}>{gap.precedent}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Key Players */}
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('players')}
              >
                <span style={styles.chevron}>{collapsedSections.players ? '\u25B6' : '\u25BC'}</span>
                Key Players
              </h3>
              {!collapsedSections.players && (
                topActors.length === 0 ? (
                  <p style={styles.emptyText}>No bad actors or enablers identified yet.</p>
                ) : (
                  <div style={styles.actorList}>
                    {topActors.map(actor => (
                      <div
                        key={actor.id}
                        style={{...styles.actorItem, ...styles.clickableItem}}
                        onClick={() => onSelectActor?.(actor)}
                        title="Click to view details"
                      >
                        <div style={{
                          ...styles.actorBadge,
                          background: actor.classification === 'bad_actor' ? '#DC262610' : '#F9731610',
                          color: actor.classification === 'bad_actor' ? '#DC2626' : '#F97316'
                        }}>
                          {actor.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                        </div>
                        <div style={styles.actorInfo}>
                          <div style={styles.actorName}>{actor.name}</div>
                          <div style={styles.actorRole}>
                            {actor.role || actor.relationship_to_self || actor.classification?.replace('_', ' ')}
                          </div>
                        </div>
                        {actor.appearance_count > 0 && (
                          <div style={styles.actorCount}>
                            {actor.appearance_count} doc{actor.appearance_count !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Case Strength Overlay */}
      {showCaseStrength && precedentAnalysis && (
        <div style={styles.overlay} onClick={() => setShowCaseStrength(false)}>
          <div style={styles.overlayPanel} onClick={e => e.stopPropagation()}>
            <div style={styles.overlayHeader}>
              <h2 style={styles.overlayTitle}>Case Strength Analysis</h2>
              <button style={styles.overlayClose} onClick={() => setShowCaseStrength(false)}>{'\u2715'}</button>
            </div>
            <div style={styles.overlayContent}>
              <div style={styles.strengthMeter}>
                <div style={styles.strengthBarOuter}>
                  <div style={{
                    ...styles.strengthBarInner,
                    width: `${precedentAnalysis.caseStrength}%`,
                    background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                               precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
                  }} />
                </div>
                <span style={styles.strengthValue}>{precedentAnalysis.caseStrength}%</span>
              </div>
              {Object.entries(precedentAnalysis.precedents).map(([key, prec]) => (
                <div key={key} style={styles.precedentDetail}>
                  <div style={styles.precedentDetailHeader}>
                    <span style={styles.precedentDetailName}>{prec.name}</span>
                    <span style={{
                      ...styles.precedentScore,
                      color: prec.alignmentPercent >= 70 ? colors.success :
                             prec.alignmentPercent >= 40 ? colors.warning : colors.error
                    }}>{prec.alignmentPercent}%</span>
                  </div>
                  <div style={styles.precedentElements}>
                    {prec.elements?.map((el, i) => (
                      <div key={i} style={styles.precedentElement}>
                        <span style={{
                          ...styles.elementStatus,
                          color: el.satisfied ? colors.success : colors.error
                        }}>{el.satisfied ? '\u2713' : '\u2717'}</span>
                        <span style={styles.elementName}>{el.element}</span>
                        {el.note && <span style={styles.elementNote}>{el.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ icon, value, label, sublabel, onClick }) {
  return (
    <div style={{...styles.statCard, cursor: onClick ? 'pointer' : 'default'}} onClick={onClick}>
      <span style={styles.statIcon}>{icon}</span>
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
      {sublabel && <span style={styles.statSublabel}>{sublabel}</span>}
    </div>
  );
}

function DeadlineItem({ agency, days, total }) {
  const percent = Math.max(0, Math.min(100, (days / total) * 100));
  const isUrgent = days <= 30;
  const isWarning = days <= 90;

  return (
    <div style={styles.deadlineItem}>
      <div style={styles.deadlineHeader}>
        <span style={styles.deadlineAgency}>{agency}</span>
        <span style={{
          ...styles.deadlineDays,
          color: isUrgent ? colors.error : isWarning ? colors.warning : colors.textPrimary
        }}>
          {days > 0 ? `${days} days` : 'EXPIRED'}
        </span>
      </div>
      <div style={styles.deadlineBar}>
        <div style={{
          ...styles.deadlineProgress,
          width: `${percent}%`,
          background: isUrgent ? colors.error : isWarning ? colors.warning : colors.success
        }} />
      </div>
    </div>
  );
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = {
  container: {
    height: '100%',
    overflow: 'auto',
    background: colors.bg
  },
  loading: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    color: colors.textMuted
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    padding: `${spacing.lg} ${spacing.xl}`,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surface
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: `${spacing.xs} 0 0 0`
  },
  content: {
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg
  },

  // Summary Card
  summaryCard: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    boxShadow: shadows.sm
  },
  summaryText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.relaxed,
    margin: 0
  },

  // Stats Row
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.md
  },
  statCard: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    boxShadow: shadows.sm,
    transition: 'box-shadow 0.15s ease'
  },
  statIcon: {
    fontSize: '24px'
  },
  statValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted
  },
  statSublabel: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    fontWeight: typography.fontWeight.medium
  },

  // Card
  card: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    boxShadow: shadows.sm
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm
  },
  badge: {
    background: colors.primary,
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: 0
  },

  // Strength Meter
  strengthMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md
  },
  strengthBarOuter: {
    flex: 1,
    height: '8px',
    background: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden'
  },
  strengthBarInner: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 0.5s ease'
  },
  strengthValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    minWidth: '50px',
    textAlign: 'right'
  },
  precedentRow: {
    display: 'flex',
    gap: spacing.md
  },
  precedentMini: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  precedentName: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary
  },
  precedentScore: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },

  // Two Column
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg
  },

  // Alerts
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  alertItem: {
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md,
    borderLeft: `4px solid ${colors.warning}`
  },
  alertTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  alertDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs
  },
  alertLegal: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic'
  },

  // Deadlines
  deadlineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md
  },
  deadlineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  deadlineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  deadlineAgency: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary
  },
  deadlineDays: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },
  deadlineBar: {
    height: '6px',
    background: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden'
  },
  deadlineProgress: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 0.3s ease'
  },
  deadlineNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic'
  },

  // Gaps
  gapList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  gapItem: {
    padding: spacing.sm,
    background: '#FEF3C7',
    borderRadius: radius.md
  },
  gapElement: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#92400E',
    marginBottom: '2px'
  },
  gapRec: {
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    marginBottom: '2px'
  },
  gapPrecedent: {
    fontSize: typography.fontSize.xs,
    color: '#D97706',
    fontStyle: 'italic'
  },
  moreText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.sm
  },

  // Actors
  actorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  actorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  actorBadge: {
    width: '36px',
    height: '36px',
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },
  actorInfo: {
    flex: 1
  },
  actorName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary
  },
  actorRole: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textTransform: 'capitalize'
  },
  actorCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    background: colors.surface,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full
  },

  // Collapsible + Clickable
  collapsibleTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    cursor: 'pointer',
    userSelect: 'none'
  },
  chevron: {
    fontSize: '10px',
    color: colors.textMuted,
    width: '14px',
    textAlign: 'center',
    flexShrink: 0
  },
  strengthBadge: {
    color: '#fff',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full,
    marginLeft: 'auto'
  },
  clickableItem: {
    cursor: 'pointer',
    transition: 'opacity 0.15s ease'
  },

  // Case Strength Overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  overlayPanel: {
    background: colors.surface,
    borderRadius: radius.xl,
    width: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: shadows.lg
  },
  overlayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottom: `1px solid ${colors.border}`
  },
  overlayTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  overlayClose: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: colors.textMuted,
    cursor: 'pointer',
    padding: spacing.sm
  },
  overlayContent: {
    padding: spacing.lg,
    overflowY: 'auto'
  },
  precedentDetail: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  precedentDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  precedentDetailName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary
  },
  precedentElements: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  precedentElement: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    fontSize: typography.fontSize.sm
  },
  elementStatus: {
    fontWeight: typography.fontWeight.bold,
    flexShrink: 0
  },
  elementName: {
    color: colors.textPrimary
  },
  elementNote: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginLeft: 'auto'
  },

  // Pattern Insights
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm
  },
  insightItem: {
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  insightTop: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  insightIcon: {
    fontSize: '16px'
  },
  insightCount: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary
  },
  insightLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary
  },
  insightLegal: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.relaxed
  }
};
