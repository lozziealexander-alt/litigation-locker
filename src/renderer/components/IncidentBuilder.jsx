import React, { useState, useEffect, useMemo } from 'react';
import { colors, spacing, typography, radius, getEvidenceColor } from '../styles/tokens';

/**
 * IncidentBuilder — Two-column layout for building EEOC retaliation incidents
 * Left: Protected Activity events | Right: Adverse Action events
 * Select events from each side, review linked documents, then create an incident.
 */
export default function IncidentBuilder({ caseId, events, existingIncidents = [], onClose, onIncidentCreated, onSelectDocument }) {
  const styles = getStyles();

  const [selectedPA, setSelectedPA] = useState([]); // protected activity event IDs
  const [selectedAA, setSelectedAA] = useState([]); // adverse action event IDs
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null); // { filename, text }
  const [loadingDocId, setLoadingDocId] = useState(null);

  // Auto-suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);

  // Filter events by tag
  const protectedEvents = useMemo(() =>
    (events || []).filter(e => e.tags?.includes('protected_activity')).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [events]
  );

  const adverseEvents = useMemo(() =>
    (events || []).filter(e =>
      e.tags?.some(t => ['adverse_action', 'retaliation', 'exclusion', 'employment_end'].includes(t))
    ).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [events]
  );

  // Calculate temporal proximity
  const proximity = useMemo(() => {
    if (selectedPA.length === 0 || selectedAA.length === 0) return null;
    const paEvents = protectedEvents.filter(e => selectedPA.includes(e.id));
    const aaEvents = adverseEvents.filter(e => selectedAA.includes(e.id));

    const latestPA = paEvents.reduce((latest, e) => (!latest || (e.date > latest.date)) ? e : latest, null);
    const earliestAA = aaEvents.reduce((earliest, e) => (!earliest || (e.date < earliest.date)) ? e : earliest, null);

    if (!latestPA?.date || !earliestAA?.date) return null;
    const days = Math.round((new Date(earliestAA.date) - new Date(latestPA.date)) / (1000 * 60 * 60 * 24));
    return { days, withinWindow: days > 0 && days <= 180 };
  }, [selectedPA, selectedAA, protectedEvents, adverseEvents]);

  // Load auto-suggestions
  useEffect(() => {
    async function loadSuggestions() {
      setLoadingSuggestions(true);
      try {
        const result = await window.api.incidents.suggest();
        if (result.success) {
          setSuggestions(result.suggestions || []);
        }
      } catch (e) {
        console.error('[IncidentBuilder] suggest error:', e);
      }
      setLoadingSuggestions(false);
    }
    loadSuggestions();
  }, []);

  function togglePA(id) {
    setSelectedPA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAA(id) {
    setSelectedAA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function applySuggestion(suggestion) {
    const paIds = suggestion.eventRoles
      .filter(r => r.event_role === 'protected_activity')
      .map(r => r.event_id);
    const aaIds = suggestion.eventRoles
      .filter(r => r.event_role === 'adverse_action')
      .map(r => r.event_id);
    setSelectedPA(paIds);
    setSelectedAA(aaIds);
    setDescription(suggestion.description || '');
    setTitle(`Retaliation: ${suggestion.protectedActivity?.title || 'Protected Activity'}`);
    setExpandedSuggestion(null);
  }

  // Look up full event object by ID from the events array
  function findEvent(eventId) {
    return (events || []).find(e => e.id === eventId);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    setError('');
    try {
      const paEvents = protectedEvents.filter(e => selectedPA.includes(e.id));
      const earliestDate = paEvents.length > 0 ? paEvents[0].date : null;

      const result = await window.api.incidents.create({
        title: title.trim(),
        description: description.trim(),
        date: earliestDate,
        type: 'retaliation',
        severity: 'severe',
        involvesRetaliation: true,
        daysAfterProtectedActivity: proximity?.days || null
      });

      if (result.success) {
        const incidentId = result.incident?.id || result.id;
        if (!incidentId) {
          setError('Incident created but no ID returned');
          setCreating(false);
          return;
        }

        // Link events with proper roles
        for (const eventId of selectedPA) {
          await window.api.incidentEvents.link(incidentId, eventId, 'protected_activity');
        }
        for (const eventId of selectedAA) {
          await window.api.incidentEvents.link(incidentId, eventId, 'adverse_action');
        }

        onIncidentCreated?.();
        onClose?.();
      } else {
        setError(result.error || 'Failed to create incident');
      }
    } catch (e) {
      console.error('[IncidentBuilder] create error:', e);
      setError(e.message || 'An error occurred');
    }
    setCreating(false);
  }

  const canCreate = title.trim() && selectedPA.length > 0 && selectedAA.length > 0;

  async function handleViewDoc(doc) {
    if (viewingDoc?.id === doc.id) {
      setViewingDoc(null);
      return;
    }
    setLoadingDocId(doc.id);
    try {
      const result = await window.api.documents.get(doc.id);
      if (result.success && result.document) {
        const text = result.document.extracted_text || result.document.ocr_text || '(No text content extracted)';
        setViewingDoc({ id: doc.id, filename: result.document.filename || doc.filename, text });
      } else {
        setViewingDoc({ id: doc.id, filename: doc.filename, text: 'Could not load document.' });
      }
    } catch (e) {
      setViewingDoc({ id: doc.id, filename: doc.filename, text: 'Error: ' + e.message });
    }
    setLoadingDocId(null);
  }

  // Filter suggestions to exclude docs already captured in existing incidents
  const filteredSuggestions = useMemo(() => {
    if (!existingIncidents || existingIncidents.length === 0) return suggestions;
    const capturedEventIds = new Set();
    for (const inc of existingIncidents) {
      if (inc.events) {
        for (const ev of inc.events) {
          capturedEventIds.add(ev.event_id || ev.id);
        }
      }
    }
    if (capturedEventIds.size === 0) return suggestions;
    return suggestions.filter(s => {
      const paId = s.protectedActivity?.id;
      if (paId && capturedEventIds.has(paId)) return false;
      return true;
    });
  }, [suggestions, existingIncidents]);

  // Render document list for an event
  function renderDocs(docs) {
    if (!docs || docs.length === 0) return null;
    return (
      <div style={styles.docList}>
        {docs.map(doc => (
          <div key={doc.id} style={{
            ...styles.docItem,
            cursor: 'pointer',
            borderRadius: '3px',
            padding: '3px 4px',
            background: viewingDoc?.id === doc.id ? '#EDE9FE' : 'transparent'
          }}
            onClick={(e) => { e.stopPropagation(); if (onSelectDocument) { onSelectDocument(doc); } else { handleViewDoc(doc); } }}
            onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              ...styles.docDot,
              background: getEvidenceColor(doc.evidence_type)
            }} />
            <span style={{ ...styles.docName, textDecoration: 'underline', color: '#7C3AED' }}>
              {loadingDocId === doc.id ? 'Loading...' : doc.filename}
            </span>
            {doc.relevance && (
              <span style={styles.docRelevance}>{doc.relevance}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Render a single event card with optional doc expansion
  function renderEventCard(evt, selected, onToggle, accentColor) {
    return (
      <div key={evt.id}
        style={{ ...styles.eventCard, ...(selected ? styles.eventCardSelected : {}), borderLeftColor: accentColor }}
        onClick={() => onToggle(evt.id)}>
        <div style={styles.eventCheck}>{selected ? '\u2611' : '\u2610'}</div>
        <div style={{ flex: 1 }}>
          <div style={styles.eventCardTitle}>{evt.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            {evt.date && <span style={styles.eventCardDate}>{evt.date}</span>}
            {evt.documents?.length > 0 && (
              <span style={styles.docBadge}>{evt.documents.length} doc{evt.documents.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {/* Show documents when selected */}
          {selected && renderDocs(evt.documents)}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>Build EEOC Incident</h2>
          <button style={styles.closeBtn} onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Scrollable content area */}
        <div style={styles.scrollArea}>
          {/* Document viewer panel */}
          {viewingDoc && (
            <div style={styles.docViewer}>
              <div style={styles.docViewerHeader}>
                <span style={{ fontWeight: typography.fontWeight.semibold }}>{viewingDoc.filename}</span>
                <button style={styles.docViewerClose} onClick={() => setViewingDoc(null)}>{'\u2715'}</button>
              </div>
              <div style={styles.docViewerContent}>{viewingDoc.text}</div>
            </div>
          )}

          {/* Suggestions banner */}
          {filteredSuggestions.length > 0 && (
            <div style={styles.suggestBanner}>
              <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm }}>
                Auto-detected patterns ({filteredSuggestions.length})
              </div>
              {filteredSuggestions.map((s, i) => {
                const isExpanded = expandedSuggestion === i;
                return (
                  <div key={i} style={styles.suggestCard}>
                    <div style={styles.suggestHeader}
                      onClick={() => setExpandedSuggestion(isExpanded ? null : i)}>
                      <span style={{ flex: 1 }}>{s.description}</span>
                      {s.daysSpan && <span style={{ color: colors.textMuted, fontSize: '11px' }}>({s.daysSpan} days)</span>}
                      <span style={styles.suggestArrow}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                    </div>
                    {isExpanded && (
                      <div style={styles.suggestDetail}>
                        {/* Protected Activity event */}
                        {s.protectedActivity && (
                          <div style={styles.suggestSection}>
                            <div style={{ ...styles.suggestSectionLabel, color: '#8B5CF6' }}>Protected Activity</div>
                            <div style={styles.suggestEventName}>{s.protectedActivity.title} ({s.protectedActivity.date})</div>
                            {renderDocs(findEvent(s.protectedActivity.id)?.documents)}
                          </div>
                        )}
                        {/* Adverse Action events */}
                        {s.adverseActions?.length > 0 && (
                          <div style={styles.suggestSection}>
                            <div style={{ ...styles.suggestSectionLabel, color: '#7C3AED' }}>Adverse Actions ({s.adverseActions.length})</div>
                            {s.adverseActions.map(aa => (
                              <div key={aa.id}>
                                <div style={styles.suggestEventName}>{aa.title} ({aa.date})</div>
                                {renderDocs(findEvent(aa.id)?.documents)}
                              </div>
                            ))}
                          </div>
                        )}
                        <button style={styles.applyBtn} onClick={() => applySuggestion(s)}>
                          Apply This Pattern
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {loadingSuggestions && (
            <div style={{ padding: spacing.md, textAlign: 'center', fontSize: typography.fontSize.sm, color: colors.textMuted }}>
              Analyzing events for patterns...
            </div>
          )}

          {/* Title + Description */}
          <div style={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Incident Title</label>
              <input
                style={styles.input}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Retaliation after EEOC complaint"
              />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Description</label>
              <textarea
                style={{ ...styles.input, minHeight: '50px', resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the pattern..."
              />
            </div>
          </div>

          {/* Two-column event selection */}
          <div style={styles.columns}>
            {/* Left: Protected Activities */}
            <div style={styles.column}>
              <h3 style={{ ...styles.columnTitle, color: '#8B5CF6' }}>Protected Activity</h3>
              <div style={styles.columnDesc}>Events where you reported, complained, or filed</div>
              {protectedEvents.length === 0 ? (
                <div style={styles.emptyColumn}>
                  No events tagged as protected activity.
                  <div style={{ marginTop: '6px', fontSize: '10px' }}>Tag events on the Events page first.</div>
                </div>
              ) : (
                protectedEvents.map(evt => renderEventCard(evt, selectedPA.includes(evt.id), togglePA, '#8B5CF6'))
              )}
            </div>

            {/* Right: Adverse Actions */}
            <div style={styles.column}>
              <h3 style={{ ...styles.columnTitle, color: '#7C3AED' }}>Adverse Actions</h3>
              <div style={styles.columnDesc}>Termination, demotion, exclusion, retaliation</div>
              {adverseEvents.length === 0 ? (
                <div style={styles.emptyColumn}>
                  No events tagged as adverse action.
                  <div style={{ marginTop: '6px', fontSize: '10px' }}>Tag events on the Events page first.</div>
                </div>
              ) : (
                adverseEvents.map(evt => renderEventCard(evt, selectedAA.includes(evt.id), toggleAA, '#7C3AED'))
              )}
            </div>
          </div>

          {/* Proximity indicator */}
          {proximity && (
            <div style={{
              ...styles.proximityBar,
              background: proximity.withinWindow ? '#FEF2F2' : '#FFF7ED',
              borderColor: proximity.withinWindow ? '#DC2626' : '#F97316'
            }}>
              <strong>{proximity.days} days</strong> between protected activity and first adverse action
              {proximity.withinWindow && (
                <span style={{ color: '#DC2626', fontWeight: typography.fontWeight.semibold }}>
                  {' '}{'\u2014'} within 180-day EEOC filing window
                </span>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div style={styles.errorBar}>
              {'\u26A0\uFE0F'} {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.createBtn, opacity: canCreate ? 1 : 0.5 }}
            disabled={!canCreate || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating...' : 'Create Retaliation Incident'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      animation: 'fadeIn 0.15s ease'
    },
    modal: {
      width: '820px',
      maxHeight: '85vh',
      background: colors.surface,
      borderRadius: radius.lg,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slideIn 0.2s ease'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.md} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt,
      flexShrink: 0
    },
    headerTitle: {
      margin: 0,
      fontSize: typography.fontSize.lg,
      color: colors.text
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: '18px',
      cursor: 'pointer',
      color: colors.textMuted,
      padding: '4px 8px'
    },
    scrollArea: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden'
    },
    suggestBanner: {
      padding: spacing.md,
      background: '#F5F3FF',
      borderBottom: `1px solid ${colors.border}`
    },
    suggestCard: {
      marginBottom: '4px',
      border: '1px solid #DDD6FE',
      borderRadius: radius.sm,
      background: '#fff',
      overflow: 'hidden'
    },
    suggestHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      color: colors.text
    },
    suggestArrow: {
      fontSize: '10px',
      color: colors.textMuted
    },
    suggestDetail: {
      padding: `0 10px 10px`,
      borderTop: '1px solid #EDE9FE'
    },
    suggestSection: {
      marginTop: spacing.sm
    },
    suggestSectionLabel: {
      fontSize: '10px',
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '4px'
    },
    suggestEventName: {
      fontSize: typography.fontSize.sm,
      color: colors.text,
      marginBottom: '2px'
    },
    applyBtn: {
      marginTop: spacing.sm,
      padding: '4px 12px',
      background: '#7C3AED',
      color: '#fff',
      border: 'none',
      borderRadius: radius.sm,
      fontSize: '11px',
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    },
    formRow: {
      padding: `${spacing.sm} ${spacing.lg}`,
      display: 'flex',
      gap: spacing.md
    },
    label: {
      display: 'block',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textSecondary,
      marginBottom: '4px'
    },
    input: {
      width: '100%',
      padding: '6px 10px',
      fontSize: typography.fontSize.sm,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      background: colors.surface,
      color: colors.text,
      boxSizing: 'border-box',
      fontFamily: 'inherit'
    },
    columns: {
      display: 'flex',
      gap: spacing.md,
      padding: `${spacing.sm} ${spacing.lg}`,
      overflow: 'hidden'
    },
    column: {
      flex: 1,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      padding: spacing.sm,
      overflowY: 'auto',
      maxHeight: '350px'
    },
    columnTitle: {
      margin: `0 0 ${spacing.xs} 0`,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    columnDesc: {
      fontSize: '11px',
      color: colors.textMuted,
      marginBottom: spacing.sm
    },
    emptyColumn: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
      textAlign: 'center',
      padding: spacing.lg
    },
    eventCard: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: '6px 8px',
      marginBottom: '4px',
      borderRadius: radius.sm,
      borderLeft: '3px solid transparent',
      cursor: 'pointer',
      transition: 'background 0.1s'
    },
    eventCardSelected: {
      background: '#F5F3FF'
    },
    eventCheck: {
      fontSize: '16px',
      lineHeight: 1,
      marginTop: '1px'
    },
    eventCardTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.text
    },
    eventCardDate: {
      fontSize: '11px',
      color: colors.textMuted
    },
    docBadge: {
      fontSize: '10px',
      color: '#7C3AED',
      background: '#F5F3FF',
      padding: '1px 5px',
      borderRadius: '8px',
      border: '1px solid #DDD6FE'
    },
    docList: {
      marginTop: '4px',
      paddingLeft: '2px'
    },
    docItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 0',
      fontSize: '11px',
      color: colors.textSecondary
    },
    docDot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      flexShrink: 0
    },
    docName: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1
    },
    docRelevance: {
      fontSize: '9px',
      color: colors.textMuted,
      fontStyle: 'italic'
    },
    proximityBar: {
      margin: `0 ${spacing.lg} ${spacing.sm}`,
      padding: spacing.sm,
      borderRadius: radius.sm,
      border: '1px solid',
      fontSize: typography.fontSize.sm
    },
    errorBar: {
      margin: `0 ${spacing.lg} ${spacing.sm}`,
      padding: spacing.sm,
      borderRadius: radius.sm,
      background: '#FEF2F2',
      border: '1px solid #FECACA',
      color: '#DC2626',
      fontSize: typography.fontSize.sm
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      padding: `${spacing.md} ${spacing.lg}`,
      borderTop: `1px solid ${colors.border}`,
      background: colors.surfaceAlt,
      flexShrink: 0
    },
    cancelBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      padding: '6px 16px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      color: colors.textSecondary
    },
    createBtn: {
      background: '#7C3AED',
      color: '#fff',
      border: 'none',
      padding: '6px 20px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    },
    docViewer: {
      margin: `0 ${spacing.lg} ${spacing.sm}`,
      border: `1px solid #DDD6FE`,
      borderRadius: radius.sm,
      overflow: 'hidden',
      background: '#FAFAF9'
    },
    docViewerHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.xs} ${spacing.sm}`,
      background: '#F5F3FF',
      borderBottom: '1px solid #DDD6FE',
      fontSize: typography.fontSize.sm,
      color: '#5B21B6'
    },
    docViewerClose: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      color: '#5B21B6',
      padding: '2px 6px'
    },
    docViewerContent: {
      maxHeight: '180px',
      overflowY: 'auto',
      padding: spacing.sm,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      fontFamily: 'inherit'
    }
  };
}
