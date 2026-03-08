import React, { useState, useEffect, useCallback } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

const TAG_VOCABULARY = [
  { tag: 'sexual_harassment', label: 'Sexual Harassment', color: '#DC2626' },
  { tag: 'gender_harassment', label: 'Gender Harassment', color: '#F97316' },
  { tag: 'protected_activity', label: 'Protected Activity', color: '#8B5CF6' },
  { tag: 'adverse_action', label: 'Negative Action', color: '#7C3AED' },
  { tag: 'retaliation', label: 'Retaliation', color: '#991B1B' },
  { tag: 'exclusion', label: 'Exclusion', color: '#EAB308' },
  { tag: 'pay_discrimination', label: 'Pay Discrimination', color: '#16A34A' },
  { tag: 'hostile_environment', label: 'Hostile Environment', color: '#EC4899' },
  { tag: 'help_request', label: 'Help Request', color: '#14B8A6' },
  { tag: 'employment_start', label: 'Employment Start', color: '#3B82F6' },
  { tag: 'employment_end', label: 'Employment End', color: '#1F2937' }
];

const EMPLOYER_RESPONSE_OPTIONS = [
  { value: 'no_response', label: 'No Response', color: '#DC2626' },
  { value: 'investigated', label: 'Investigated', color: '#F97316' },
  { value: 'took_action', label: 'Took Action', color: '#16A34A' },
  { value: 'denied', label: 'Denied', color: '#991B1B' },
  { value: 'retaliated', label: 'Retaliated', color: '#7C3AED' },
  { value: 'partial', label: 'Partial Response', color: '#EAB308' }
];
const TAG_COLORS = Object.fromEntries(TAG_VOCABULARY.map(t => [t.tag, t.color]));

export default function EventPanel({ event, onClose, onEventUpdated, onSelectDocument, onNavigate }) {
  const styles = getStyles();

  // Loaded related data
  const [related, setRelated] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  // Tag suggestions
  const [suggestedTags, setSuggestedTags] = useState(null);

  // Document linking
  const [showLinkDocs, setShowLinkDocs] = useState(false);
  const [allDocuments, setAllDocuments] = useState([]);

  // Navigation - all events for prev/next
  const [allEvents, setAllEvents] = useState([]);

  const caseId = event.case_id;

  const loadRelated = useCallback(async () => {
    if (!event?.id) return;
    try {
      const result = await window.api.events.getRelatedEvidence(caseId, event.id);
      if (result.success) {
        setRelated(result);
      }
    } catch (e) {
      console.error('[EventPanel] loadRelated error:', e);
    }
    setLoading(false);
  }, [event?.id, caseId]);

  useEffect(() => {
    loadRelated();
  }, [loadRelated]);

  // Load all events for prev/next navigation
  useEffect(() => {
    if (!caseId || !onNavigate) return;
    (async () => {
      try {
        const result = await window.api.events.list(caseId);
        if (result.success) {
          const sorted = (result.events || []).sort((a, b) => {
            if (a.date && b.date) return a.date.localeCompare(b.date);
            if (a.date) return -1;
            if (b.date) return 1;
            return 0;
          });
          setAllEvents(sorted);
        }
      } catch (e) {}
    })();
  }, [caseId, onNavigate]);

  const currentIndex = allEvents.findIndex(e => e.id === event.id);
  const prevEvent = currentIndex > 0 ? allEvents[currentIndex - 1] : null;
  const nextEvent = currentIndex < allEvents.length - 1 ? allEvents[currentIndex + 1] : null;

  // Build edit data from event
  useEffect(() => {
    if (!related?.event) return;
    const e = related.event;
    setEditData({
      title: e.title || '',
      date: e.date || '',
      tags: e.tags || [],
      description: e.description || '',
      what_happened: e.what_happened || '',
      where_location: e.where_location || '',
      impact_summary: e.impact_summary || '',
      event_weight: e.event_weight || 'significant',
      severity: e.severity || '',
      why_no_report: e.why_no_report || '',
      employer_notified: e.employer_notified ? true : false,
      notice_date: e.notice_date || '',
      notice_method: e.notice_method || '',
      employer_response: e.employer_response || '',
      employer_response_type: e.employer_response_type || '',
      response_date: e.response_date || '',
      response_adequate: e.response_adequate ? true : false
    });
  }, [related?.event]);

  function toggleTag(tag) {
    setEditData(prev => {
      const tags = prev.tags || [];
      return {
        ...prev,
        tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
      };
    });
  }

  async function handleSave() {
    const updates = {
      title: editData.title,
      date: editData.date || null,
      description: editData.description || null,
      what_happened: editData.what_happened || null,
      where_location: editData.where_location || null,
      impact_summary: editData.impact_summary || null,
      event_weight: editData.event_weight || 'significant',
      severity: editData.severity || null,
      why_no_report: editData.why_no_report || null,
      employer_notified: editData.employer_notified ? 1 : 0,
      notice_date: editData.notice_date || null,
      notice_method: editData.notice_method || null,
      employer_response: editData.employer_response || null,
      employer_response_type: editData.employer_response_type || null,
      response_date: editData.response_date || null,
      response_adequate: editData.response_adequate ? 1 : 0,
      tags: editData.tags
    };
    const result = await window.api.events.update(caseId, event.id, updates);
    if (result.success) {
      setEditing(false);
      await loadRelated();
      onEventUpdated?.();
    }
  }

  async function handleSuggestTags() {
    try {
      const result = await window.api.eventTags.suggest(event.id);
      if (result.success) {
        setSuggestedTags(result.tags);
      }
    } catch (e) {
      console.error('[EventPanel] suggest tags error:', e);
    }
  }

  function applySuggestedTag(tag) {
    if (!editData.tags?.includes(tag)) {
      setEditData(prev => ({ ...prev, tags: [...(prev.tags || []), tag] }));
    }
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  }

  async function handleLinkDocument(docId) {
    const result = await window.api.events.linkEvidence(caseId, event.id, docId);
    if (result.success) {
      await loadRelated();
      onEventUpdated?.();
    }
  }

  async function handleUnlinkDocument(docId) {
    const result = await window.api.events.unlinkEvidence(caseId, event.id, docId);
    if (result.success) {
      await loadRelated();
      onEventUpdated?.();
    }
  }

  const RELEVANCE_CYCLE = ['supports', 'against', 'context'];

  async function handleCycleRelevance(docId, currentRelevance) {
    const currentIndex = RELEVANCE_CYCLE.indexOf(currentRelevance);
    const nextRelevance = RELEVANCE_CYCLE[(currentIndex + 1) % RELEVANCE_CYCLE.length];
    const result = await window.api.events.linkDocumentV2(caseId, event.id, docId, nextRelevance);
    if (result.success) {
      await loadRelated();
      onEventUpdated?.();
    }
  }

  async function handleSetWeight(docId, weight) {
    const result = await window.api.events.setDocumentWeight(caseId, event.id, docId, weight);
    if (result.success) {
      await loadRelated();
      onEventUpdated?.();
    }
  }

  async function loadAllDocuments() {
    try {
      const result = await window.api.documents.list();
      if (result.success) {
        setAllDocuments(result.documents || []);
      }
    } catch (e) {}
    setShowLinkDocs(true);
  }

  const evt = related?.event || event;
  const tags = evt.tags || [];
  const primaryTag = tags[0] || evt.event_type;
  const accentColor = TAG_COLORS[primaryTag] || '#6B7280';
  const linkedDocs = related?.linked?.documents || [];
  const linkedIncidents = related?.linked?.incidents || [];
  const linkedActors = related?.linked?.actors || [];
  const nearbyDocs = related?.nearby?.documents || [];
  const causalityLinks = related?.causalityLinks || [];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ ...styles.header, borderLeft: `4px solid ${accentColor}` }}>
          <div style={{ flex: 1, marginRight: spacing.md }}>
            {/* Tag pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: spacing.sm }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  display: 'inline-block',
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  padding: '2px 8px',
                  borderRadius: radius.full,
                  background: TAG_COLORS[tag] || '#6B7280',
                  color: '#fff'
                }}>
                  {(TAG_VOCABULARY.find(t => t.tag === tag)?.label || tag).replace(/_/g, ' ')}
                </span>
              ))}
              {tags.length === 0 && (
                <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>No tags</span>
              )}
            </div>
            <h3 style={{ margin: 0, fontSize: typography.fontSize.lg, color: colors.text }}>
              {evt.title || 'Untitled Event'}
            </h3>
            {evt.date && (
              <div style={{ marginTop: '4px', fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                {new Date(evt.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
          <button style={styles.closeBtn} onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Prev/Next navigation */}
        {onNavigate && allEvents.length > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 16px', background: colors.bgSecondary, borderBottom: `1px solid ${colors.border}`,
            fontSize: typography.fontSize.xs
          }}>
            <button
              disabled={!prevEvent}
              onClick={() => prevEvent && onNavigate(prevEvent)}
              style={{
                background: 'none', border: `1px solid ${prevEvent ? colors.border : 'transparent'}`,
                borderRadius: radius.sm, padding: '4px 10px', cursor: prevEvent ? 'pointer' : 'default',
                color: prevEvent ? colors.textPrimary : colors.textMuted, fontWeight: 600, fontSize: '12px',
                opacity: prevEvent ? 1 : 0.4
              }}
            >{'\u2190'} Prev</button>
            <span style={{ color: colors.textMuted }}>{currentIndex + 1} / {allEvents.length}</span>
            <button
              disabled={!nextEvent}
              onClick={() => nextEvent && onNavigate(nextEvent)}
              style={{
                background: 'none', border: `1px solid ${nextEvent ? colors.border : 'transparent'}`,
                borderRadius: radius.sm, padding: '4px 10px', cursor: nextEvent ? 'pointer' : 'default',
                color: nextEvent ? colors.textPrimary : colors.textMuted, fontWeight: 600, fontSize: '12px',
                opacity: nextEvent ? 1 : 0.4
              }}
            >Next {'\u2192'}</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: spacing.lg, color: colors.textMuted }}>Loading...</div>
        ) : (
          <div style={styles.body}>
            {/* Edit / View toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
              {editing ? (
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                  <button style={styles.saveBtn} onClick={handleSave}>Save</button>
                </div>
              ) : (
                <button style={styles.editBtn} onClick={() => setEditing(true)}>{'\u270F\uFE0F'} Edit</button>
              )}
            </div>

            {editing ? renderEditForm() : renderViewMode()}

            {/* Linked Documents */}
            <Section title={`Linked Documents (${linkedDocs.length})`}>
              {linkedDocs.length === 0 ? (
                <div style={styles.emptyText}>No documents linked</div>
              ) : (
                linkedDocs.map(doc => {
                  const w = doc.weight || 3;
                  const relColor = getRelevanceColor(doc.relevance || 'supports');
                  return (
                  <div key={doc.id} style={{ ...styles.linkedItem, flexWrap: 'wrap' }}>
                    <span
                      style={{ ...styles.linkedItemText, cursor: 'pointer', color: '#7C3AED', textDecoration: 'underline' }}
                      onClick={() => onSelectDocument?.(doc)}
                    >
                      {doc.filename}
                    </span>
                    <span
                      style={{
                        ...styles.relevanceBadge,
                        background: relColor,
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                      title="Click to change relevance"
                      onClick={() => handleCycleRelevance(doc.id, doc.relevance || 'supports')}
                    >
                      {doc.relevance || 'supports'}
                    </span>
                    <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }} title={`Weight: ${w}/5 — click dots to change`}>
                      {[1,2,3,4,5].map(n => (
                        <span key={n} onClick={() => handleSetWeight(doc.id, n)} style={{
                          cursor: 'pointer', fontSize: '10px',
                          color: n <= w ? relColor : colors.border,
                          lineHeight: 1
                        }}>{'\u25CF'}</span>
                      ))}
                    </span>
                    <button style={styles.unlinkBtn} onClick={() => handleUnlinkDocument(doc.id)}>{'\u2715'}</button>
                  </div>
                  );
                })
              )}
              <button style={styles.linkBtn} onClick={loadAllDocuments}>+ Link Document</button>
              {showLinkDocs && (
                <div style={styles.linkDropdown}>
                  {allDocuments
                    .filter(d => !linkedDocs.some(ld => ld.id === d.id))
                    .slice(0, 20)
                    .map(doc => (
                      <div key={doc.id} style={styles.linkDropdownItem} onClick={() => {
                        handleLinkDocument(doc.id);
                        setShowLinkDocs(false);
                      }}>
                        {doc.filename}
                      </div>
                    ))}
                  {allDocuments.filter(d => !linkedDocs.some(ld => ld.id === d.id)).length === 0 && (
                    <div style={styles.emptyText}>All documents already linked</div>
                  )}
                </div>
              )}
            </Section>

            {/* Nearby Documents */}
            {nearbyDocs.length > 0 && (
              <Section title={`Nearby Documents (${nearbyDocs.length})`}>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
                  Documents within 14 days of this event
                </div>
                {nearbyDocs.map(doc => (
                  <div key={doc.id} style={styles.linkedItem}>
                    <span
                      style={{ ...styles.linkedItemText, cursor: onSelectDocument ? 'pointer' : 'default' }}
                      onClick={() => onSelectDocument?.(doc)}
                    >
                      {doc.filename}
                    </span>
                    {editing && (
                      <button style={styles.linkBtn} onClick={() => handleLinkDocument(doc.id)}>Link</button>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Linked Incidents */}
            {linkedIncidents.length > 0 && (
              <Section title={`Incidents (${linkedIncidents.length})`}>
                {linkedIncidents.map(inc => (
                  <div key={inc.id} style={styles.linkedItem}>
                    <span style={styles.linkedItemText}>{inc.title || inc.description || 'Untitled Incident'}</span>
                    {inc.event_role && (
                      <span style={{
                        ...styles.relevanceBadge,
                        background: inc.event_role === 'protected_activity' ? '#8B5CF6' : '#7C3AED'
                      }}>
                        {inc.event_role.replace(/_/g, ' ')}
                      </span>
                    )}
                    <button
                      style={styles.unlinkBtn}
                      title="Unlink incident"
                      onClick={async () => {
                        const result = await window.api.events.unlinkIncident(caseId, event.id, inc.id);
                        if (result.success) { await loadRelated(); onEventUpdated?.(); }
                      }}
                    >{'\u2715'}</button>
                  </div>
                ))}
              </Section>
            )}

            {/* Linked Actors */}
            {linkedActors.length > 0 && (
              <Section title={`People (${linkedActors.length})`}>
                {linkedActors.map(actor => (
                  <div key={actor.id} style={styles.linkedItem}>
                    <span style={styles.linkedItemText}>{actor.name}</span>
                    {actor.role && (
                      <span style={{ ...styles.relevanceBadge, background: '#6B7280' }}>{actor.role}</span>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Causality Links */}
            {causalityLinks.length > 0 && (
              <Section title={`Causality Links (${causalityLinks.length})`}>
                {causalityLinks.map(link => (
                  <div key={link.id} style={styles.linkedItem}>
                    <span style={styles.linkedItemText}>
                      {link.link_type === 'caused' ? '\u{1F525}' : '\u{1F517}'}{' '}
                      {link.link_type}: {link.days_between} days
                    </span>
                    <span style={{
                      ...styles.relevanceBadge,
                      background: link.confidence >= 0.9 ? '#DC2626' : link.confidence >= 0.8 ? '#F97316' : '#EAB308'
                    }}>
                      {Math.round(link.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );

  function renderViewMode() {
    return (
      <>
        {evt.what_happened && (
          <Section title="What Happened">
            <div style={styles.textContent}>{evt.what_happened}</div>
          </Section>
        )}
        {evt.description && (
          <Section title="Description">
            <div style={styles.textContent}>{evt.description}</div>
          </Section>
        )}
        {evt.where_location && (
          <Section title="Where">
            <div style={styles.textContent}>{evt.where_location}</div>
          </Section>
        )}
        {evt.impact_summary && (
          <Section title="Impact">
            <div style={styles.textContent}>{evt.impact_summary}</div>
          </Section>
        )}
        {evt.event_weight && evt.event_weight !== 'significant' && (
          <div style={{ marginBottom: spacing.md }}>
            <span style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              padding: '2px 8px',
              borderRadius: radius.full,
              background: evt.event_weight === 'major' ? '#FEF2F2' : '#F0FDF4',
              color: evt.event_weight === 'major' ? '#DC2626' : '#16A34A'
            }}>
              Weight: {evt.event_weight}
            </span>
          </div>
        )}
        {evt.employer_notified ? (
          <Section title="Employer Notification">
            <div style={styles.textContent}>
              {evt.notice_method && <div>Method: {evt.notice_method}</div>}
              {evt.notice_date && <div>Date: {evt.notice_date}</div>}
              {evt.employer_response_type && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                  {evt.employer_response_type.split(',').filter(Boolean).map(rt => {
                    const opt = EMPLOYER_RESPONSE_OPTIONS.find(o => o.value === rt);
                    return (
                      <span key={rt} style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        borderRadius: '999px',
                        background: (opt?.color || '#6B7280') + '15',
                        color: opt?.color || '#6B7280',
                        border: `1px solid ${opt?.color || '#6B7280'}`
                      }}>
                        {opt?.label || rt}
                      </span>
                    );
                  })}
                </div>
              )}
              {evt.employer_response && <div>Response: {evt.employer_response}</div>}
              {evt.response_date && <div>Response Date: {evt.response_date}</div>}
              {evt.response_adequate !== undefined && (
                <div>Adequate: {evt.response_adequate ? 'Yes' : 'No'}</div>
              )}
            </div>
          </Section>
        ) : evt.why_no_report ? (
          <Section title="Why Not Reported">
            <div style={styles.textContent}>{evt.why_no_report}</div>
          </Section>
        ) : null}
      </>
    );
  }

  function renderEditForm() {
    return (
      <>
        {/* Title */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Title</label>
          <input
            style={styles.input}
            value={editData.title}
            onChange={e => setEditData(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>

        {/* Date */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Date</label>
          <input
            type="date"
            style={styles.input}
            value={editData.date}
            onChange={e => setEditData(prev => ({ ...prev, date: e.target.value }))}
          />
        </div>

        {/* Tags */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {TAG_VOCABULARY.map(tv => {
              const active = editData.tags?.includes(tv.tag);
              return (
                <button
                  key={tv.tag}
                  onClick={() => toggleTag(tv.tag)}
                  style={{
                    border: `1px solid ${tv.color}`,
                    background: active ? tv.color : 'transparent',
                    color: active ? '#fff' : tv.color,
                    fontSize: typography.fontSize.xs,
                    padding: '2px 8px',
                    borderRadius: radius.full,
                    cursor: 'pointer',
                    fontWeight: active ? typography.fontWeight.semibold : typography.fontWeight.normal,
                    transition: 'all 0.15s'
                  }}
                >
                  {tv.label}
                </button>
              );
            })}
          </div>
          <button style={{ ...styles.linkBtn, marginTop: spacing.sm }} onClick={handleSuggestTags}>
            Suggest Tags
          </button>
          {suggestedTags && suggestedTags.length > 0 && (
            <div style={{ marginTop: spacing.sm, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginRight: '4px' }}>Suggested:</span>
              {suggestedTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => applySuggestedTag(tag)}
                  style={{
                    fontSize: typography.fontSize.xs,
                    padding: '1px 6px',
                    borderRadius: radius.full,
                    border: `1px dashed ${TAG_COLORS[tag] || '#6B7280'}`,
                    background: 'transparent',
                    color: TAG_COLORS[tag] || '#6B7280',
                    cursor: 'pointer'
                  }}
                >
                  + {TAG_VOCABULARY.find(t => t.tag === tag)?.label || tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* What Happened */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>What Happened</label>
          <textarea
            style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
            value={editData.what_happened}
            onChange={e => setEditData(prev => ({ ...prev, what_happened: e.target.value }))}
          />
        </div>

        {/* Description */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Description</label>
          <textarea
            style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
            value={editData.description}
            onChange={e => setEditData(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>

        {/* Where */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Where</label>
          <input
            style={styles.input}
            value={editData.where_location}
            onChange={e => setEditData(prev => ({ ...prev, where_location: e.target.value }))}
          />
        </div>

        {/* Impact */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Impact</label>
          <textarea
            style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
            value={editData.impact_summary}
            onChange={e => setEditData(prev => ({ ...prev, impact_summary: e.target.value }))}
          />
        </div>

        {/* Event Weight */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Weight</label>
          <select
            style={styles.input}
            value={editData.event_weight}
            onChange={e => setEditData(prev => ({ ...prev, event_weight: e.target.value }))}
          >
            <option value="minor">Minor</option>
            <option value="significant">Significant</option>
            <option value="major">Major</option>
          </select>
        </div>

        {/* Employer Notification */}
        <div style={styles.field}>
          <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <input
              type="checkbox"
              checked={editData.employer_notified}
              onChange={e => setEditData(prev => ({ ...prev, employer_notified: e.target.checked }))}
            />
            Employer Notified
          </label>
        </div>

        {editData.employer_notified && (
          <>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Notice Date</label>
              <input type="date" style={styles.input} value={editData.notice_date}
                onChange={e => setEditData(prev => ({ ...prev, notice_date: e.target.value }))} />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Notice Method</label>
              <input style={styles.input} value={editData.notice_method}
                onChange={e => setEditData(prev => ({ ...prev, notice_method: e.target.value }))} />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Employer Response (select all that apply)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                {EMPLOYER_RESPONSE_OPTIONS.map(opt => {
                  const types = (editData.employer_response_type || '').split(',').filter(Boolean);
                  const selected = types.includes(opt.value);
                  return (
                    <button key={opt.value} type="button"
                      style={{
                        padding: '3px 9px', fontSize: '11px', fontWeight: 500,
                        border: `1.5px solid ${selected ? opt.color : colors.border}`,
                        borderRadius: '999px', cursor: 'pointer',
                        background: selected ? `${opt.color}15` : colors.surface,
                        color: selected ? opt.color : colors.textSecondary
                      }}
                      onClick={() => {
                        const next = selected ? types.filter(t => t !== opt.value) : [...types, opt.value];
                        setEditData(prev => ({ ...prev, employer_response_type: next.join(',') }));
                      }}
                    >{opt.label}</button>
                  );
                })}
              </div>
              <textarea style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
                value={editData.employer_response}
                onChange={e => setEditData(prev => ({ ...prev, employer_response: e.target.value }))}
                placeholder="Additional context about the employer's response..." />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Response Date</label>
              <input type="date" style={styles.input} value={editData.response_date}
                onChange={e => setEditData(prev => ({ ...prev, response_date: e.target.value }))} />
            </div>
            <div style={styles.field}>
              <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <input type="checkbox" checked={editData.response_adequate}
                  onChange={e => setEditData(prev => ({ ...prev, response_adequate: e.target.checked }))} />
                Response Adequate
              </label>
            </div>
          </>
        )}

        {!editData.employer_notified && (
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Why Not Reported</label>
            <textarea style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
              value={editData.why_no_report}
              onChange={e => setEditData(prev => ({ ...prev, why_no_report: e.target.value }))} />
          </div>
        )}
      </>
    );
  }
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: spacing.lg }}>
      <div style={{
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function getRelevanceColor(relevance) {
  switch (relevance) {
    case 'supports': return '#16A34A';
    case 'against': return '#DC2626';
    case 'context': return '#6B7280';
    case 'direct': return '#DC2626';
    case 'supporting': return '#2563EB';
    default: return '#9CA3AF';
  }
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.3)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 1000,
      animation: 'fadeIn 0.15s ease'
    },
    panel: {
      width: '440px',
      height: '100%',
      background: colors.surface,
      borderLeft: `1px solid ${colors.border}`,
      overflowY: 'auto',
      animation: 'slideIn 0.2s ease'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: '18px',
      cursor: 'pointer',
      color: colors.textMuted,
      padding: '4px 8px',
      borderRadius: radius.sm
    },
    body: {
      padding: spacing.lg
    },
    editBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      padding: '4px 12px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      color: colors.text
    },
    saveBtn: {
      background: colors.primary,
      color: '#fff',
      border: 'none',
      padding: '4px 16px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    },
    cancelBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      padding: '4px 12px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      color: colors.textSecondary
    },
    textContent: {
      fontSize: typography.fontSize.sm,
      color: colors.text,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap'
    },
    emptyText: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic'
    },
    field: {
      marginBottom: spacing.md
    },
    fieldLabel: {
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
    linkedItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: '4px 0',
      borderBottom: `1px solid ${colors.border}`
    },
    linkedItemText: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      color: colors.text,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    relevanceBadge: {
      fontSize: '10px',
      fontWeight: typography.fontWeight.semibold,
      padding: '1px 6px',
      borderRadius: radius.full,
      color: '#fff',
      textTransform: 'uppercase'
    },
    unlinkBtn: {
      background: 'none',
      border: 'none',
      color: '#DC2626',
      cursor: 'pointer',
      fontSize: '12px',
      padding: '2px 6px'
    },
    linkBtn: {
      background: 'none',
      border: `1px dashed ${colors.border}`,
      color: colors.primary,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      padding: '4px 12px',
      borderRadius: radius.sm,
      marginTop: spacing.sm
    },
    linkDropdown: {
      marginTop: spacing.sm,
      maxHeight: '200px',
      overflowY: 'auto',
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      background: colors.surface
    },
    linkDropdownItem: {
      padding: '6px 10px',
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.text
    }
  };
}
