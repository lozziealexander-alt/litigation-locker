import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme } from '../styles/ThemeContext';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';
import CaseStrength from '../components/CaseStrength';
import IncidentApproval from '../components/IncidentApproval';
import ActorApproval from '../components/ActorApproval';
import EditMomentModal from '../components/EditMomentModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

// Evidence type icons
const EVIDENCE_ICONS = {
  'ADVERSE_ACTION': '\u26D4',
  'INCIDENT': '\u26A0\uFE0F',
  'PROTECTED_ACTIVITY': '\uD83D\uDEE1\uFE0F',
  'REQUEST_FOR_HELP': '\u2709\uFE0F',
  'RESPONSE': '\uD83D\uDCE8',
  'CLAIM_AGAINST_YOU': '\u2694\uFE0F',
  'CLAIM_YOU_MADE': '\uD83D\uDCDD',
  'PAY_RECORD': '\uD83D\uDCB0',
  'CONTEXT': '\uD83D\uDCC4',
  'SUPPORTING': '\u2705',
  'email': '\u2709\uFE0F',
  'screenshot': '\uD83D\uDCF8',
  'photo': '\uD83D\uDDBC\uFE0F',
  'pdf': '\uD83D\uDCC4',
  'document': '\uD83D\uDCC3',
  'performance_review': '\uD83D\uDCCA',
  'text_message': '\uD83D\uDCAC',
  'recording': '\uD83C\uDFA4',
  'video': '\uD83C\uDFA5',
  'medical': '\uD83C\uDFE5',
  'legal': '\u2696\uFE0F',
  'financial': '\uD83D\uDCB3',
  'contract': '\uD83D\uDCDD',
  'policy': '\uD83D\uDCCB',
  'other': '\uD83D\uDCC1'
};

function getEvidenceIcon(type) {
  return EVIDENCE_ICONS[type] || '\uD83D\uDCC4';
}

const ZOOM_LEVELS = ['year', 'month', 'day', 'hour'];
const ZOOM_LABELS = { year: 'Year', month: 'Month', day: 'Day', hour: 'Hour' };

export default function Timeline({ onSelectDocument, onSelectEvent, highlightDocIds, onClearHighlights, onDataChanged }) {
  const { mode } = useTheme();
  const [dated, setDated] = useState([]);
  const [undated, setUndated] = useState([]);
  const [connections, setConnections] = useState([]);
  const [escalation, setEscalation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [precedentAnalysis, setPrecedentAnalysis] = useState(null);
  const [showCaseStrength, setShowCaseStrength] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState('');
  const [incidents, setIncidents] = useState([]);
  const [pendingIncidents, setPendingIncidents] = useState([]);
  const [showIncidentApproval, setShowIncidentApproval] = useState(false);
  const [actors, setActors] = useState([]);
  const [pendingActors, setPendingActors] = useState([]);
  const [showActorApproval, setShowActorApproval] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('both'); // 'federal' | 'state' | 'both'
  const [zoomLevel, setZoomLevel] = useState('day'); // 'year' | 'month' | 'day' | 'hour'
  const [linePositions, setLinePositions] = useState([]);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [hideRecaps, setHideRecaps] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [highlightedEventId, setHighlightedEventId] = useState(null);
  const [nearDuplicates, setNearDuplicates] = useState([]);
  const [showDuplicateReview, setShowDuplicateReview] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [eventPickerSearch, setEventPickerSearch] = useState('');
  // Events spine
  const [events, setEvents] = useState([]);
  const [showEventSpine, setShowEventSpine] = useState(true);
  const [expandedSpineEvent, setExpandedSpineEvent] = useState(null);
  const [eventLinks, setEventLinks] = useState([]);
  // Unified timeline (B4)
  const [timelineItems, setTimelineItems] = useState([]);
  const [editingMoment, setEditingMoment] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState(-1);
  const focusedItemRef = useRef(null);
  const caseIdRef = useRef(null);
  const timelineRef = useRef(null);
  const timelineInnerRef = useRef(null);
  const containerRef = useRef(null);
  const dragCounter = useRef(0);

  const styles = getStyles();

  // Convert highlightDocIds array to a Set for fast lookup
  const externalHighlightSet = useMemo(
    () => (highlightDocIds && highlightDocIds.length > 0 ? new Set(highlightDocIds) : null),
    [highlightDocIds]
  );

  // Scroll to first highlighted doc when navigating from Dashboard alert
  useEffect(() => {
    if (!externalHighlightSet || loading) return;
    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      const firstId = highlightDocIds[0];
      const el = document.querySelector(`[data-event-id="${firstId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [externalHighlightSet, loading]);

  // ---- Native DOM drag/drop handlers (bypass React delegation issues) ----
  // NOTE: depends on [loading] because on first mount `loading=true` renders a
  // different tree that does NOT have the containerRef div. Once loading flips
  // to false the real container appears and we can attach listeners.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let counter = 0;

    function onDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }

    function onDragEnter(e) {
      e.preventDefault();
      e.stopPropagation();
      counter++;
      if (counter === 1) setIsDraggingOver(true);
    }

    function onDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      counter--;
      if (counter === 0) setIsDraggingOver(false);
    }

    function onDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      counter = 0;
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer.files);
      console.log('[Timeline] native drop, files:', files.length);
      if (files.length === 0) return;

      // Electron 22+ removed File.path when contextIsolation is on —
      // use webUtils.getPathForFile() exposed via preload
      const filePaths = files.map(f => {
        try {
          return window.api.getPathForFile(f);
        } catch (err) {
          console.warn('[Timeline] getPathForFile fallback for:', f.name, err.message);
          return f.path || '';
        }
      }).filter(Boolean);
      console.log('[Timeline] file paths:', filePaths);

      if (filePaths.length === 0) {
        console.error('[Timeline] No valid file paths from drop');
        return;
      }

      setIsIngesting(true);
      setIngestProgress(`Processing ${filePaths.length} file${filePaths.length > 1 ? 's' : ''}...`);
      window.api.documents.ingest(filePaths).then(result => {
        console.log('[Timeline] ingest result:', JSON.stringify(result).slice(0, 300));
        setIsIngesting(false);
        setIngestProgress('');
        if (result.success) {
          // Check for detected incidents
          const hasIncidents = result.detectedIncidents && result.detectedIncidents.length > 0;
          if (hasIncidents) {
            setPendingIncidents(result.detectedIncidents);
            setShowIncidentApproval(true);
          }

          // Collect detected actors, filter out existing
          if (result.detectedActors && result.detectedActors.length > 0) {
            const existingNames = new Set(actors.map(a => a.name.toLowerCase()));
            const newActors = result.detectedActors.filter(a => !existingNames.has(a.name.toLowerCase()));
            if (newActors.length > 0) {
              setPendingActors(newActors);
              if (!hasIncidents) {
                setShowActorApproval(true);
              }
            }
          }

          // Check for near-duplicates
          if (result.nearDuplicates && result.nearDuplicates.length > 0) {
            setNearDuplicates(result.nearDuplicates);
            setShowDuplicateReview(true);
          }

          loadTimeline();
          onDataChanged?.();

          // Suggest event links for the first newly ingested document
          if (result.documents && result.documents.length > 0 && caseIdRef.current) {
            const firstDocId = result.documents[0].id;
            window.api.events.suggestLinks(caseIdRef.current, firstDocId)
              .then(linkResult => {
                if (linkResult.success && linkResult.suggestions.length > 0) {
                  setLinkSuggestions({ documentId: firstDocId, suggestions: linkResult.suggestions });
                  setShowLinkModal(true);
                }
              })
              .catch(() => {});
          }
        } else {
          console.error('[Timeline] ingest failed:', result.error);
          alert('Import failed: ' + (result.error || 'Unknown error'));
        }
      }).catch(err => {
        console.error('[Timeline] ingest error:', err);
        setIsIngesting(false);
        setIngestProgress('');
        alert('Import error: ' + err.message);
      });
    }

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);

    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [loading]);

  useEffect(() => {
    loadTimeline();

    // Re-load when case changes (SESSION-9B)
    const handleCaseChange = () => {
      console.log('[Timeline] Case changed, reloading timeline');
      loadTimeline();
    };
    window.api.on?.('case-changed', handleCaseChange);
    return () => {
      window.api.off?.('case-changed', handleCaseChange);
    };
  }, []);

  async function loadTimeline() {
    setLoading(true);
    try {
      const currentCase = await window.api.cases.current();
      const caseId = currentCase?.caseId;
      caseIdRef.current = caseId;
      const [timelineResult, connectionsResult, precedentResult, incidentsResult, jurisdictionResult, actorsResult, eventsResult, documentsResult] = await Promise.all([
        window.api.timeline.get(),
        window.api.timeline.getConnections(),
        window.api.precedents.analyze(),
        window.api.incidents.list(),
        window.api.jurisdiction.get(),
        window.api.actors.list(),
        window.api.events.list(caseId),
        window.api.documents.list()
      ]);

      if (timelineResult.success) {
        // Merge pinned date entries into dated docs as virtual entries
        const baseDated = timelineResult.dated || [];
        const entries = timelineResult.dateEntries || [];
        const virtualDocs = entries.map(entry => ({
          ...entry,
          document_date: entry.entry_date,
          isDateEntry: true,
          pinLabel: entry.label || 'Pinned',
          pinEntryId: entry.entry_id
        }));
        setDated([...baseDated, ...virtualDocs].sort((a, b) => {
          const da = new Date(a.document_date);
          const db = new Date(b.document_date);
          return da - db;
        }));
        setUndated(timelineResult.undated || []);
      }
      if (connectionsResult.success) {
        setConnections(connectionsResult.connections || []);
        setEscalation(connectionsResult.escalation);
      }
      if (precedentResult.success) {
        setPrecedentAnalysis(precedentResult.analysis);
      }
      if (incidentsResult.success) {
        setIncidents(incidentsResult.incidents || []);
      }
      if (jurisdictionResult.success) {
        setJurisdiction(jurisdictionResult.jurisdiction);
      }
      if (actorsResult.success) {
        setActors(actorsResult.actors || []);
      }
      if (eventsResult.success) {
        const sortedEvents = (eventsResult.events || []).sort((a, b) => {
          if (a.date && b.date) return a.date.localeCompare(b.date);
          if (a.date) return -1;
          if (b.date) return 1;
          return 0;
        });
        setEvents(sortedEvents);
        console.log('[Timeline] Loaded events:', sortedEvents.length);

        // Build unified timeline items (moments + documents merged)
        // Use documents.list() to get ALL docs (dated + undated), not just timeline.dated
        const allDocs = documentsResult?.success ? (documentsResult.documents || []) : (timelineResult.success ? (timelineResult.dated || []) : []);
        console.log('[Timeline] Loaded documents:', allDocs.length);
        const allItems = [
          ...allDocs.map(d => {
            const date = d.document_date || d.date_received || d.created_at || d.uploaded_at;
            return {
              type: 'document',
              id: d.id,
              date: date,
              dateConfidence: d.document_date_confidence || 'exact',
              data: d
            };
          }),
          ...sortedEvents.map(e => ({
            type: 'moment',
            id: e.id,
            date: e.date,
            dateConfidence: e.date_confidence || 'exact',
            data: e,
            documentCount: (e.documents || []).length,
            linkedDocuments: e.documents || []
          }))
        ].sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(a.date) - new Date(b.date);
        });
        console.log('[Timeline] Merged timeline items:', allItems.length);
        setTimelineItems(allItems);
      }
      // Load causality links
      try {
        const linksResult = await window.api.eventLinks.list();
        if (linksResult.success) setEventLinks(linksResult.links || []);
      } catch (e) { /* eventLinks table may not exist yet */ }
    } catch (err) {
      console.error('[Timeline] loadTimeline error:', err);
    }
    setLoading(false);
  }

  // ---- Unified timeline CRUD handlers (B7) ----

  function getThreadColor(tags) {
    if (!tags || tags.length === 0) return '#6B7280';
    const tagColorMap = {
      'protected_activity': '#8B5CF6',
      'adverse_action': '#DC2626',
      'sexual_harassment': '#DC2626',
      'gender_harassment': '#F97316',
      'retaliation': '#F59E0B',
      'exclusion': '#10B981',
      'pay_discrimination': '#3B82F6',
      'hostile_environment': '#6366F1',
      'help_request': '#A855F7'
    };
    for (const tag of tags) {
      if (tagColorMap[tag]) return tagColorMap[tag];
    }
    return '#6B7280';
  }

  function formatTimelineDate(dateStr) {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function handleEditMoment(momentId) {
    setEditingMoment(momentId);
  }

  async function handleDeleteMoment(momentId) {
    const moment = timelineItems.find(item => item.id === momentId && item.type === 'moment');
    if (!moment) return;

    const impact = [];
    if (moment.documentCount > 0) {
      impact.push(`${moment.documentCount} linked document${moment.documentCount !== 1 ? 's' : ''} will become standalone`);
    }
    impact.push('Thread strengths will recalculate');

    setDeletingItem({ id: momentId, type: 'moment', data: moment.data });
    setDeleteImpact(impact);
  }

  async function handleViewDocument(documentId) {
    const result = await window.api.documents.open(documentId);
    if (!result.success) {
      alert('Failed to open document: ' + (result.error || 'Unknown error'));
    }
  }

  async function handleDeleteDocument(documentId) {
    const doc = timelineItems.find(item => item.id === documentId && item.type === 'document');
    if (!doc) return;

    const impact = ['File will be permanently deleted'];
    const linkedMoments = timelineItems.filter(item =>
      item.type === 'moment' &&
      (item.linkedDocuments || []).some(d => d.id === documentId)
    );
    if (linkedMoments.length > 0) {
      impact.push(`Will be unlinked from ${linkedMoments.length} moment${linkedMoments.length !== 1 ? 's' : ''}`);
      impact.push('Thread strengths will recalculate');
    }

    setDeletingItem({ id: documentId, type: 'document', data: doc.data });
    setDeleteImpact(impact);
  }

  async function confirmDelete() {
    if (!deletingItem) return;
    try {
      let result;
      if (deletingItem.type === 'moment') {
        result = await window.api.events.delete(caseIdRef.current, deletingItem.id);
      } else if (deletingItem.type === 'document') {
        result = await window.api.documents.delete(deletingItem.id);
      }
      if (result?.success) {
        setDeletingItem(null);
        setDeleteImpact(null);
        await loadTimeline();
      } else {
        alert('Delete failed: ' + (result?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  }

  // ---- Filter dated/undated by hidden types and recap/subtype toggle ----
  const filteredDated = useMemo(() => {
    return dated.filter(doc => {
      if (hiddenTypes.size > 0 && hiddenTypes.has(doc.evidence_type)) return false;
      if (hideRecaps && (doc.is_recap || doc.document_subtype)) return false;
      return true;
    });
  }, [dated, hiddenTypes, hideRecaps]);

  const filteredUndated = useMemo(() => {
    return undated.filter(doc => {
      if (hiddenTypes.size > 0 && hiddenTypes.has(doc.evidence_type)) return false;
      if (hideRecaps && (doc.is_recap || doc.document_subtype)) return false;
      return true;
    });
  }, [undated, hiddenTypes, hideRecaps]);

  // Build flat list of navigable items (events + documents interleaved by date)
  const navigableItems = useMemo(() => {
    const allItems = [
      ...events.filter(e => e.date).map(e => ({ type: 'event', id: e.id, date: e.date, data: e })),
      ...filteredDated.map(d => ({ type: 'document', id: d.id, date: d.document_date, data: d }))
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return allItems;
  }, [events, filteredDated]);

  // Arrow key navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedItemIndex(prev => {
          const max = navigableItems.length - 1;
          if (max < 0) return -1;
          if (e.key === 'ArrowRight') return Math.min(prev + 1, max);
          if (e.key === 'ArrowLeft') return Math.max(prev - 1, 0);
          return prev;
        });
      }
      if (e.key === 'Escape') {
        setFocusedItemIndex(-1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigableItems.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedItemIndex >= 0 && focusedItemIndex < navigableItems.length) {
      const item = navigableItems[focusedItemIndex];
      const el = document.querySelector(`[data-nav-id="${item.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setHighlightedEventId(item.id);
    }
  }, [focusedItemIndex]);

  // ---- Semantic zoom groupings ----
  const timeline = useMemo(() => {
    if (filteredDated.length === 0) return [];

    if (zoomLevel === 'year') {
      const groups = {};
      for (const doc of filteredDated) {
        const d = new Date(doc.document_date);
        const key = `${d.getFullYear()}`;
        if (!groups[key]) groups[key] = { key, label: key, documents: [] };
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    if (zoomLevel === 'month') {
      const groups = {};
      for (const doc of filteredDated) {
        const d = new Date(doc.document_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { key, label, documents: [] };
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    if (zoomLevel === 'hour') {
      const groups = {};
      for (const doc of filteredDated) {
        const d = new Date(doc.document_date);
        const dateStr = doc.document_date?.split('T')[0] || doc.document_date;
        const hour = d.getHours();
        const key = `${dateStr}-${String(hour).padStart(2, '0')}`;
        if (!groups[key]) {
          const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
          groups[key] = {
            key,
            label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourLabel}`,
            dayNum: d.toLocaleDateString('en-US', { day: 'numeric' }),
            monthYear: `${d.toLocaleDateString('en-US', { month: 'short' })} ${hourLabel}`,
            documents: []
          };
        }
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    // day level (default)
    const groups = {};
    for (const doc of filteredDated) {
      const dateKey = doc.document_date?.split('T')[0] || doc.document_date;
      if (!groups[dateKey]) {
        const d = new Date(dateKey + 'T12:00:00');
        groups[dateKey] = {
          key: dateKey,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          dayNum: d.toLocaleDateString('en-US', { day: 'numeric' }),
          monthYear: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          documents: []
        };
      }
      groups[dateKey].documents.push(doc);
    }
    return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredDated, zoomLevel]);

  // Active evidence types for legend
  const activeTypes = useMemo(() => {
    const types = new Set();
    for (const doc of dated) {
      if (doc.evidence_type) types.add(doc.evidence_type);
    }
    for (const doc of undated) {
      if (doc.evidence_type) types.add(doc.evidence_type);
    }
    return Array.from(types).sort();
  }, [dated, undated]);

  // ---- Connection line positions (computed from DOM after render) ----
  useLayoutEffect(() => {
    if (!timelineInnerRef.current || connections.length === 0 || zoomLevel === 'year') {
      setLinePositions([]);
      return;
    }
    const timer = setTimeout(() => {
      const inner = timelineInnerRef.current;
      if (!inner) return;
      // Use the timeline div's own rect — SVG is position:absolute inside it
      const innerRect = inner.getBoundingClientRect();
      const lines = [];
      for (const conn of connections) {
        const sourceEl = inner.querySelector(`[data-event-id="${conn.sourceId}"]`);
        const targetEl = inner.querySelector(`[data-event-id="${conn.targetId}"]`);
        if (!sourceEl || !targetEl) continue;
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        // Coordinates relative to the timeline div (same parent as SVG)
        const x1 = sourceRect.left + sourceRect.width / 2 - innerRect.left;
        const y1 = sourceRect.bottom - innerRect.top;
        const x2 = targetRect.left + targetRect.width / 2 - innerRect.left;
        const y2 = targetRect.top - innerRect.top;
        let lineColor = colors.connectionCluster;
        let dashed = false;
        if (conn.connectionType === 'retaliation_chain') {
          lineColor = colors.connectionRetaliation;
        } else if (conn.connectionType === 'escalation') {
          lineColor = colors.connectionEscalation;
        } else if (conn.connectionType === 'temporal_cluster') {
          lineColor = colors.connectionCluster;
          dashed = true;
        }
        lines.push({ x1, y1, x2, y2, color: lineColor, dashed, key: `${conn.sourceId}-${conn.targetId}-${conn.connectionType}` });
      }
      setSvgDimensions({ width: inner.scrollWidth, height: inner.scrollHeight });
      setLinePositions(lines.length > 0 ? lines : []);
    }, 50);
    return () => clearTimeout(timer);
  }, [connections, timeline, zoomLevel]);

  // Zoom controls
  function zoomIn() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[idx + 1]);
  }
  function zoomOut() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_LEVELS[idx - 1]);
  }

  async function handleJurisdictionChange(newJurisdiction) {
    setJurisdiction(newJurisdiction);
    await window.api.jurisdiction.set(newJurisdiction);
    // Re-run precedent analysis with new jurisdiction
    const precedentResult = await window.api.precedents.analyze(newJurisdiction);
    if (precedentResult.success) {
      setPrecedentAnalysis(precedentResult.analysis);
    }
  }

  async function handleImportFiles() {
    try {
      console.log('[Timeline] handleImportFiles called');
      const result = await window.api.dialog.openFiles();
      console.log('[Timeline] dialog result:', JSON.stringify(result).slice(0, 300));
      if (result.canceled || result.filePaths.length === 0) return;

      const count = result.filePaths.length;
      setIsIngesting(true);
      setIngestProgress(`Processing ${count} file${count > 1 ? 's' : ''}...`);

      const ingestResult = await window.api.documents.ingest(result.filePaths);
      console.log('[Timeline] ingest result:', JSON.stringify(ingestResult).slice(0, 300));
      setIsIngesting(false);
      setIngestProgress('');

      if (ingestResult.success) {
        const imported = ingestResult.documents?.length || 0;
        const errCount = ingestResult.errors?.length || 0;
        if (errCount > 0) {
          const errMsgs = ingestResult.errors.map(e => `${e.file}: ${e.error}`).join('\n');
          console.warn('[Timeline] import partial errors:', errMsgs);
          alert(`Imported ${imported} file${imported !== 1 ? 's' : ''}. ${errCount} file${errCount !== 1 ? 's' : ''} had errors:\n${errMsgs}`);
        }
        // Check for detected incidents
        const hasIncidents = ingestResult.detectedIncidents && ingestResult.detectedIncidents.length > 0;
        if (hasIncidents) {
          setPendingIncidents(ingestResult.detectedIncidents);
          setShowIncidentApproval(true);
        }

        // Collect detected actors, filter out existing
        if (ingestResult.detectedActors && ingestResult.detectedActors.length > 0) {
          const existingNames = new Set(actors.map(a => a.name.toLowerCase()));
          const newActors = ingestResult.detectedActors.filter(a => !existingNames.has(a.name.toLowerCase()));
          if (newActors.length > 0) {
            setPendingActors(newActors);
            if (!hasIncidents) {
              setShowActorApproval(true);
            }
          }
        }

        // Check for near-duplicates
        if (ingestResult.nearDuplicates && ingestResult.nearDuplicates.length > 0) {
          setNearDuplicates(ingestResult.nearDuplicates);
          setShowDuplicateReview(true);
        }

        loadTimeline();
      } else {
        console.error('[Timeline] import failed:', ingestResult.error);
        alert('Import failed: ' + (ingestResult.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[Timeline] handleImportFiles error:', err);
      setIsIngesting(false);
      setIngestProgress('');
      alert('Import error: ' + err.message);
    }
  }

  async function handleReclassify() {
    try {
      setIsIngesting(true);
      setIngestProgress('Re-classifying all documents...');
      const docResult = await window.api.documents.reclassify();

      // Also reclassify incidents
      setIngestProgress('Re-classifying incidents...');
      const incResult = await window.api.incidents.reclassify();

      setIsIngesting(false);
      setIngestProgress('');
      if (docResult.success && incResult.success) {
        loadTimeline();
      } else {
        const errors = [];
        if (!docResult.success) errors.push('Documents: ' + (docResult.error || 'Unknown'));
        if (!incResult.success) errors.push('Incidents: ' + (incResult.error || 'Unknown'));
        alert('Re-classify issues:\n' + errors.join('\n'));
        loadTimeline(); // still reload what we can
      }
    } catch (err) {
      setIsIngesting(false);
      setIngestProgress('');
      alert('Re-classify error: ' + err.message);
    }
  }

  // ---- Incident approval handlers ----
  async function handleApproveIncident(incidentData) {
    const result = await window.api.incidents.create(incidentData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create incident');
    }
    setIncidents(prev => [...prev, result.incident]);
  }

  function handleDismissIncident(incident) {
    console.log('[Timeline] Dismissed incident:', incident.suggestedTitle);
  }

  async function handleApproveActor(actorData) {
    const result = await window.api.actors.create(actorData);
    if (result.success) {
      setActors(prev => [...prev, result.actor]);
    }
  }

  function handleDismissActor(actor) {
    console.log('[Timeline] Dismissed actor:', actor.name);
  }

  // Map events by date for timeline integration
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const evt of events) {
      if (evt.date) {
        const dateKey = evt.date.split('T')[0];
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(evt);
      }
    }
    return map;
  }, [events]);

  // Map events by month key (YYYY-MM) for month view
  const eventsByMonth = useMemo(() => {
    const map = {};
    for (const evt of events) {
      if (evt.date) {
        const d = new Date(evt.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(evt);
      }
    }
    return map;
  }, [events]);

  // Map events by year for year view
  const eventsByYear = useMemo(() => {
    const map = {};
    for (const evt of events) {
      if (evt.date) {
        const key = `${new Date(evt.date).getFullYear()}`;
        if (!map[key]) map[key] = [];
        map[key].push(evt);
      }
    }
    return map;
  }, [events]);

  // Build Set of document IDs linked to events — these should NOT render as standalone cards
  const eventLinkedDocIds = useMemo(() => {
    const ids = new Set();
    events.forEach(evt => (evt.documents || []).forEach(d => ids.add(d.id)));
    return ids;
  }, [events]);

  // Merge incidents into timeline groups for rendering
  const incidentsByDate = useMemo(() => {
    const map = {};
    for (const inc of incidents) {
      if (inc.incident_date) {
        const dateKey = inc.incident_date.split('T')[0];
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(inc);
      }
    }
    return map;
  }, [incidents]);

  function getEventConnections(eventId) {
    return connections.filter(c =>
      c.sourceId === eventId || c.targetId === eventId
    );
  }

  // Date range info
  const allDates = dated.map(d => new Date(d.document_date));
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date();
  const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date();
  const spanDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;

  const dateRangeText = allDates.length > 0
    ? `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2014 ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No documents yet';

  const totalDocs = dated.length + undated.length;
  const filteredTotal = filteredDated.length + filteredUndated.length;
  const hasRecaps = dated.some(d => d.is_recap || d.document_subtype) || undated.some(d => d.is_recap || d.document_subtype);
  const canZoomIn = ZOOM_LEVELS.indexOf(zoomLevel) < ZOOM_LEVELS.length - 1;
  const canZoomOut = ZOOM_LEVELS.indexOf(zoomLevel) > 0;

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <span style={styles.loadingText}>Loading timeline...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        ...(isDraggingOver ? styles.containerDragOver : {})
      }}
    >
      {/* Ingest progress overlay */}
      {isIngesting && (
        <div style={styles.ingestOverlay}>
          <div style={styles.ingestSpinner} />
          <span style={styles.ingestText}>{ingestProgress}</span>
        </div>
      )}

      {/* Header (SESSION-9B cleanup) */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Timeline</h1>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{
              ...styles.importButton,
              ...(isIngesting ? { opacity: 0.5, cursor: 'not-allowed' } : {})
            }}
            onClick={isIngesting ? undefined : handleImportFiles}
            disabled={isIngesting}
          >
            {isIngesting ? 'Importing...' : '+ Import Files'}
          </button>
        </div>
      </div>

      {/* Evidence type legend removed (SESSION-9B: unified timeline replaces filter bar) */}
      {false && (
        <div style={styles.legend}>
          <div style={styles.legendControls}>
            <button style={styles.legendControlBtn}>Show All</button>
            <button style={styles.legendControlBtn}>Hide All</button>
          </div>
          <div style={styles.legendPills}>
            {activeTypes.map(type => {
              const isHidden = hiddenTypes.has(type);
              return (
                <button
                  key={type}
                  style={{
                    ...styles.legendPill,
                    ...(isHidden ? styles.legendPillHidden : {}),
                    borderColor: getEvidenceColor(type)
                  }}
                  onClick={() => {
                    setHiddenTypes(prev => {
                      const next = new Set(prev);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    });
                  }}
                  title={`${formatEvidenceType(type)}: ${getEvidenceDescription(type)}${isHidden ? ' (hidden)' : ''}`}
                >
                  <span style={{
                    ...styles.legendDot,
                    background: isHidden ? 'transparent' : getEvidenceColor(type),
                    border: isHidden ? `2px solid ${getEvidenceColor(type)}` : 'none'
                  }} />
                  <span style={styles.legendIcon}>{getEvidenceIcon(type)}</span>
                  <span style={{
                    ...styles.legendLabel,
                    ...(isHidden ? { textDecoration: 'line-through', opacity: 0.5 } : {})
                  }}>{formatEvidenceType(type)}</span>
                </button>
              );
            })}
            {/* Recap filter */}
            {hasRecaps && (
              <button
                style={{
                  ...styles.legendPill,
                  ...(hideRecaps ? styles.legendPillHidden : {}),
                  borderColor: colors.primary
                }}
                onClick={() => setHideRecaps(prev => !prev)}
                title={hideRecaps ? 'Show recaps, feedback & forwarded emails' : 'Hide recaps, feedback & forwarded emails'}
              >
                <span style={{
                  ...styles.legendDot,
                  background: hideRecaps ? 'transparent' : colors.primary,
                  border: hideRecaps ? `2px solid ${colors.primary}` : 'none'
                }} />
                <span style={styles.legendIcon}>{'\uD83D\uDCDD'}</span>
                <span style={{
                  ...styles.legendLabel,
                  ...(hideRecaps ? { textDecoration: 'line-through', opacity: 0.5 } : {})
                }}>Subtypes</span>
              </button>
            )}
          </div>
          {/* Connection toggle */}
          {connections.length > 0 && (
            <div style={styles.connectionToggle}>
              <button
                style={{
                  ...styles.connectionToggleBtn,
                  ...(showConnections ? styles.connectionToggleBtnActive : {})
                }}
                onClick={() => {
                  setShowConnections(prev => !prev);
                  setHighlightedEventId(null);
                }}
              >
                {showConnections ? '\uD83D\uDD17 Hide Connections' : '\uD83D\uDD17 Show Connections'}
              </button>
              {showConnections && (
                <div style={styles.connectionLegend}>
                  <span style={styles.connectionLegendItem}>
                    <span style={{...styles.connectionLegendDot, background: colors.connectionRetaliation}} />
                    Retaliation
                  </span>
                  <span style={styles.connectionLegendItem}>
                    <span style={{...styles.connectionLegendDot, background: colors.connectionEscalation}} />
                    Escalation
                  </span>
                  <span style={styles.connectionLegendItem}>
                    <span style={{...styles.connectionLegendDot, background: colors.connectionCluster, border: `1px dashed ${colors.connectionCluster}`}} />
                    Cluster
                  </span>
                </div>
              )}
            </div>
          )}
          {hiddenTypes.size > 0 && (
            <span style={styles.filterInfo}>
              Showing {filteredTotal} of {totalDocs} documents
            </span>
          )}
        </div>
      )}

      {/* External highlight banner */}
      {externalHighlightSet && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.sm} ${spacing.lg}`,
          background: '#fbbf2420',
          borderBottom: '2px solid #fbbf24',
          fontSize: typography.fontSize.sm,
          color: '#fbbf24'
        }}>
          <span>
            {'\uD83D\uDD0D'} Highlighting {externalHighlightSet.size} linked document{externalHighlightSet.size !== 1 ? 's' : ''} from alert
          </span>
          <button
            onClick={onClearHighlights}
            style={{
              background: 'transparent',
              border: '1px solid #fbbf24',
              borderRadius: radius.sm,
              color: '#fbbf24',
              padding: `2px ${spacing.sm}`,
              fontSize: typography.fontSize.xs,
              cursor: 'pointer'
            }}
          >
            Clear Highlights
          </button>
        </div>
      )}

      {/* Events Spine removed (SESSION-9B cleanup) */}

      {/* Unified Timeline (B4) — chronological view of moments + documents with edit/delete */}
      {timelineItems.length > 0 && (
        <div style={styles9b.unifiedSection}>
          <div style={styles9b.unifiedHeader}>
            <span style={styles9b.unifiedTitle}>🗓 Unified Timeline ({timelineItems.length} items)</span>
            <span style={styles9b.unifiedHint}>Moments ⭕ and documents 📄 in chronological order</span>
          </div>
          <div style={styles9b.unifiedList}>
            {timelineItems.map(item => {
              if (item.type === 'moment') {
                const { data, documentCount, linkedDocuments } = item;
                const itemTags = data.tags || [];
                const threadColor = getThreadColor(itemTags);
                return (
                  <div key={`moment-${item.id}`} style={{
                    ...styles9b.unifiedItem,
                    borderLeft: `4px solid ${threadColor}`,
                    background: colors.surface
                  }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: threadColor + '22', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '20px', flexShrink: 0
                    }}>⭕</div>
                    <div style={styles9b.itemContent}>
                      <div style={styles9b.itemTitle}>{data.title}</div>
                      <div style={styles9b.itemDate}>
                        {formatTimelineDate(data.date)}
                        {data.date_confidence && data.date_confidence !== 'exact' && (
                          <span style={styles9b.dateConfidence}> ({data.date_confidence})</span>
                        )}
                      </div>
                      {itemTags.length > 0 && (
                        <div style={styles9b.tagRow}>
                          {itemTags.map(tag => (
                            <span key={tag} style={{ ...styles9b.tag, borderColor: getThreadColor([tag]), color: getThreadColor([tag]) }}>
                              {tag.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {documentCount > 0 ? (
                        <div style={styles9b.docCount}>
                          📎 {documentCount} document{documentCount !== 1 ? 's' : ''}
                          {(linkedDocuments || []).slice(0, 3).map(doc => (
                            <div key={doc.id} style={styles9b.linkedDoc}>• {doc.filename}</div>
                          ))}
                          {(linkedDocuments || []).length > 3 && (
                            <div style={styles9b.linkedDoc}>... and {linkedDocuments.length - 3} more</div>
                          )}
                        </div>
                      ) : (
                        <div style={styles9b.noDocsWarning}>⚠️ No documents yet</div>
                      )}
                      <div style={styles9b.actionRow}>
                        <button style={styles9b.actionBtn} onClick={() => handleEditMoment(item.id)}>✏️ Edit</button>
                        <button style={{ ...styles9b.actionBtn, ...styles9b.dangerBtn }} onClick={() => handleDeleteMoment(item.id)}>🗑️ Delete</button>
                      </div>
                    </div>
                  </div>
                );
              } else {
                const { data } = item;
                return (
                  <div key={`doc-${item.id}`} style={{
                    ...styles9b.unifiedItem,
                    borderLeft: '4px solid #3B82F6',
                    background: colors.bgSecondary
                  }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: '#3B82F620', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '20px', flexShrink: 0
                    }}>📄</div>
                    <div style={styles9b.itemContent}>
                      <div style={{ ...styles9b.itemTitle, fontSize: '14px', fontWeight: 500 }}>{data.filename}</div>
                      <div style={styles9b.itemDate}>
                        {formatTimelineDate(item.date || data.document_date)}
                        {data.document_date_confidence && data.document_date_confidence !== 'exact' && (
                          <span style={styles9b.dateConfidence}> ({data.document_date_confidence})</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                        {data.evidence_type && (
                          <span style={{ ...styles9b.tag, display: 'inline-block', borderColor: '#3B82F6', color: '#3B82F6' }}>
                            {data.evidence_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {data.file_size && (
                          <span style={{ fontSize: '11px', color: colors.textMuted }}>
                            {(data.file_size / 1024).toFixed(0)} KB
                          </span>
                        )}
                        {data.page_count && (
                          <span style={{ fontSize: '11px', color: colors.textMuted }}>
                            • {data.page_count} pages
                          </span>
                        )}
                      </div>
                      <div style={styles9b.actionRow}>
                        <button style={{ ...styles9b.actionBtn, background: '#3B82F6', color: '#fff', border: 'none' }}
                          onClick={() => handleViewDocument(item.id)}>👁 View</button>
                        <button style={{ ...styles9b.actionBtn, ...styles9b.dangerBtn }} onClick={() => handleDeleteDocument(item.id)}>🗑️ Delete</button>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {timeline.length === 0 && filteredUndated.length === 0 && totalDocs === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>{'\uD83D\uDCC4'}</div>
          <h2 style={styles.emptyTitle}>Add evidence to begin</h2>
          <p style={styles.emptyText}>
            Drag files here or use the import button
          </p>
          <button style={styles.importButtonLarge} onClick={handleImportFiles}>
            + Import Files
          </button>
          <div style={styles.emptyHints}>
            <span style={styles.emptyHint}>{'\u2709\uFE0F'} .eml emails</span>
            <span style={styles.emptyHint}>{'\uD83D\uDCC4'} PDFs</span>
            <span style={styles.emptyHint}>{'\uD83D\uDCF8'} Screenshots</span>
            <span style={styles.emptyHint}>{'\uD83D\uDDBC\uFE0F'} Photos</span>
          </div>
        </div>
      )}

      {/* Timeline visualization — removed (unified timeline above replaces this) */}
      {false && (
        <div style={styles.timelineWrapper} ref={timelineRef}>
          <div style={styles.timeline} ref={timelineInnerRef}>
            {/* Connection lines SVG overlay — inside scrollable content */}
            {showConnections && linePositions.length > 0 && (
              <svg style={styles.connectionsLayer} width={svgDimensions.width || '100%'} height={svgDimensions.height || '100%'}>
                <defs>
                  <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionRetaliation} opacity="0.6" />
                  </marker>
                  <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionEscalation} opacity="0.6" />
                  </marker>
                  <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionCluster} opacity="0.6" />
                  </marker>
                </defs>
                {linePositions.map(line => {
                  const markerId = line.color === colors.connectionRetaliation ? 'arrowRed'
                    : line.color === colors.connectionEscalation ? 'arrowOrange'
                    : 'arrowBlue';
                  // Determine if this line should be highlighted or dimmed
                  const isHighlighted = !highlightedEventId ||
                    line.key.startsWith(highlightedEventId + '-') ||
                    line.key.includes('-' + highlightedEventId + '-');
                  // Quadratic bezier curve for smoother arcs
                  const midX = (line.x1 + line.x2) / 2;
                  const midY = (line.y1 + line.y2) / 2;
                  const dx = line.x2 - line.x1;
                  const offsetX = Math.abs(dx) < 50 ? (dx >= 0 ? 60 : -60) : dx * 0.3;
                  const cx = midX + offsetX;
                  const cy = midY;
                  return (
                    <path
                      key={line.key}
                      d={`M ${line.x1} ${line.y1} Q ${cx} ${cy} ${line.x2} ${line.y2}`}
                      stroke={line.color}
                      strokeWidth="2.5"
                      strokeDasharray={line.dashed ? '6,4' : undefined}
                      opacity={isHighlighted ? 0.7 : 0.15}
                      fill="none"
                      markerEnd={`url(#${markerId})`}
                      style={{ transition: 'opacity 0.2s ease' }}
                    />
                  );
                })}
              </svg>
            )}
            {timeline.map(group => (
              <div key={group.key} style={{
                ...styles.dateColumn,
                ...(zoomLevel === 'year' ? styles.dateColumnWide : {}),
                ...(zoomLevel === 'month' ? styles.dateColumnMedium : {})
              }}>
                {/* Column header */}
                <div style={{
                  ...styles.dateHeader,
                  ...(zoomLevel !== 'day' && zoomLevel !== 'hour' ? styles.dateHeaderCompact : {})
                }}>
                  {zoomLevel === 'day' || zoomLevel === 'hour' ? (
                    <>
                      <span style={styles.dateDay}>{group.dayNum}</span>
                      <span style={styles.dateMonth}>{group.monthYear}</span>
                    </>
                  ) : (
                    <>
                      <span style={styles.groupLabel}>{group.label}</span>
                      <span style={styles.groupCount}>
                        {group.documents.length} doc{group.documents.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Events */}
                <div style={styles.eventsColumn}>
                  {/* Event markers for this date group */}
                  {(() => {
                    const groupEvents = zoomLevel === 'year' ? (eventsByYear[group.key] || [])
                      : zoomLevel === 'month' ? (eventsByMonth[group.key] || [])
                      : (eventsByDate[group.key] || []);
                    return groupEvents.map(evt => {
                      const isCtx = !!evt.is_context_event;
                      const evtColor = isCtx ? '#9CA3AF' : ({
                        'START': '#3B82F6', 'REPORTED': '#8B5CF6', 'HELP': '#F97316',
                        'ADVERSE_ACTION': '#DC2626', 'HARASSMENT': '#E11D48',
                        'END': '#1F2937'
                      }[evt.event_type] || '#6B7280');
                      const linkedDocs = evt.documents || [];
                      const isExpanded = expandedSpineEvent === evt.id;
                      return (
                        <div key={`evt-${evt.id}`} data-nav-id={evt.id} style={{
                          marginBottom: '10px',
                          borderRadius: radius.md,
                          overflow: 'hidden',
                          boxShadow: `0 2px 8px ${evtColor}35`,
                          opacity: isCtx ? 0.75 : 1
                        }}>
                          {/* Event header */}
                          <div style={{
                            padding: '10px 14px',
                            background: isCtx ? '#F3F4F6' : evtColor + '22',
                            borderLeft: `5px solid ${evtColor}`,
                            borderRadius: `0 ${radius.md} ${radius.md} 0`,
                            cursor: 'pointer'
                          }} onClick={() => setExpandedSpineEvent(isExpanded ? null : evt.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {isCtx && (
                                <span style={{
                                  fontSize: '10px', fontWeight: 700, color: '#6B7280',
                                  textTransform: 'uppercase', letterSpacing: '0.5px',
                                  background: '#E5E7EB', padding: '2px 8px', borderRadius: radius.full
                                }}>CONTEXT</span>
                              )}
                              <span style={{
                                fontSize: '10px', fontWeight: 800, color: isCtx ? '#6B7280' : '#fff',
                                textTransform: 'uppercase', letterSpacing: '0.5px',
                                background: isCtx ? '#D1D5DB' : evtColor, padding: '2px 8px', borderRadius: radius.full
                              }}>{evt.event_type?.replace('_', ' ')}</span>
                              <span style={{ fontWeight: 700, color: colors.textPrimary, fontSize: '13px' }}>{evt.title}</span>
                              {evt.event_weight === 'major' && <span style={{
                                color: '#fff', fontSize: '9px', background: '#DC2626',
                                padding: '1px 6px', borderRadius: radius.full, fontWeight: 700
                              }}>MAJOR</span>}
                              {linkedDocs.length > 0 && (
                                <span style={{
                                  fontSize: '10px', color: evtColor, fontWeight: 600,
                                  background: evtColor + '15', padding: '1px 6px', borderRadius: radius.full
                                }}>
                                  {linkedDocs.length} doc{linkedDocs.length !== 1 ? 's' : ''}
                                </span>
                              )}
                              {onSelectEvent && (
                                <button
                                  style={{
                                    background: evtColor + '18', border: `1px solid ${evtColor}40`,
                                    cursor: 'pointer', fontSize: '11px', padding: '2px 8px',
                                    color: evtColor, borderRadius: radius.sm, fontWeight: 600
                                  }}
                                  onClick={e => { e.stopPropagation(); onSelectEvent(evt); }}
                                  title="Open event panel"
                                >Open</button>
                              )}
                              <span style={{ fontSize: '11px', color: colors.textMuted, marginLeft: 'auto' }}>
                                {isExpanded ? '\u25B2' : '\u25BC'}
                              </span>
                            </div>
                            {isExpanded && evt.description && (
                              <div style={{ color: colors.textSecondary, marginTop: '6px', fontSize: '12px', lineHeight: 1.4 }}>
                                {evt.description}
                              </div>
                            )}
                          </div>
                          {/* Linked documents nested under event (only when expanded) */}
                          {isExpanded && linkedDocs.length > 0 && (
                            <div style={{ paddingLeft: '12px', borderLeft: `2px solid ${evtColor}40`, marginLeft: '1px' }}>
                              {linkedDocs.map(linkedDoc => {
                                const relColor = {
                                  'supports': '#22C55E', 'supports_me': '#22C55E',
                                  'against': '#EF4444', 'against_me': '#EF4444',
                                  'timing': '#3B82F6', 'context': '#9CA3AF', 'source': '#8B5CF6'
                                }[linkedDoc.relevance] || '#9CA3AF';
                                return (
                                  <div key={`evtdoc-${linkedDoc.id}`}
                                    data-nav-id={linkedDoc.id}
                                    style={{
                                      padding: '4px 8px',
                                      marginTop: '2px',
                                      borderLeft: `3px solid ${relColor}`,
                                      borderRadius: `0 ${radius.xs} ${radius.xs} 0`,
                                      fontSize: '11px',
                                      cursor: 'pointer',
                                      background: colors.bgSecondary,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                    onClick={(e) => { e.stopPropagation(); onSelectDocument && onSelectDocument(linkedDoc); }}
                                  >
                                    <span style={{ color: relColor, fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>
                                      {(linkedDoc.relevance || 'linked').replace('_', ' ')}
                                    </span>
                                    <span style={{ color: colors.textPrimary, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {linkedDoc.filename}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                  {zoomLevel === 'year' ? (
                    // Year view: compact summary cards grouped by type (skip docs linked to events)
                    <YearSummary
                      documents={group.documents.filter(doc => !eventLinkedDocIds.has(doc.id))}
                      onSelectDocument={onSelectDocument}
                      styles={styles}
                    />
                  ) : zoomLevel === 'month' ? (
                    // Month view: condensed cards (skip docs linked to events — they render under event markers)
                    group.documents.filter(doc => !eventLinkedDocIds.has(doc.id)).map(doc => (
                      <div
                        key={doc.isDateEntry ? `entry-${doc.pinEntryId}` : doc.id}
                        style={{
                          ...styles.eventCardCompact,
                          borderLeftColor: getEvidenceColor(doc.evidence_type),
                          ...(doc.isDateEntry ? { borderStyle: 'dashed' } : {}),
                          ...(externalHighlightSet?.has(doc.id) ? {
                            background: '#fbbf2430',
                            borderColor: '#fbbf24',
                            boxShadow: '0 0 0 2px #fbbf24, 0 0 8px #fbbf2466',
                            position: 'relative'
                          } : {})
                        }}
                        onClick={() => onSelectDocument && onSelectDocument(doc)}
                        title={`${formatEvidenceType(doc.evidence_type)}: ${getEvidenceDescription(doc.evidence_type)}`}
                      >
                        {externalHighlightSet?.has(doc.id) && (
                          <span style={{
                            position: 'absolute', top: -8, right: -4,
                            background: '#fbbf24', color: '#000',
                            fontSize: '9px', fontWeight: 700,
                            padding: '1px 5px', borderRadius: '4px',
                            letterSpacing: '0.5px', zIndex: 2
                          }}>LINKED</span>
                        )}
                        <span style={styles.eventIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                        <span style={styles.compactTitle}>
                          {doc.isDateEntry ? '\uD83D\uDCCC ' : ''}{doc.group_id ? '\uD83D\uDCCE ' : ''}{doc.filename}
                        </span>
                        <span style={styles.compactDate}>
                          {new Date(doc.document_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    // Day/Hour view: full cards (skip docs linked to events — they render under event markers)
                    group.documents.filter(doc => !eventLinkedDocIds.has(doc.id)).map(doc => {
                      const eventConnections = getEventConnections(doc.id);
                      const retaliationConn = eventConnections.find(c => c.connectionType === 'retaliation_chain');

                      return (
                        <div
                          key={doc.isDateEntry ? `entry-${doc.pinEntryId}` : doc.id}
                          data-event-id={doc.id}
                          data-nav-id={doc.id}
                          style={{
                            ...styles.eventCard,
                            borderLeftColor: getEvidenceColor(doc.evidence_type),
                            ...(doc.isDateEntry ? styles.eventCardPinned : {}),
                            ...(hoveredEvent === doc.id ? styles.eventCardHover : {}),
                            ...(highlightedEventId === doc.id ? { boxShadow: `0 0 0 2px ${getEvidenceColor(doc.evidence_type)}` } : {}),
                            ...(externalHighlightSet?.has(doc.id) ? {
                              background: '#fbbf2430',
                              borderColor: '#fbbf24',
                              boxShadow: '0 0 0 2px #fbbf24, 0 0 8px #fbbf2466',
                              position: 'relative'
                            } : {})
                          }}
                          onClick={() => {
                            if (showConnections && eventConnections.length > 0) {
                              setHighlightedEventId(prev => prev === doc.id ? null : doc.id);
                            }
                            onSelectDocument && onSelectDocument(doc);
                          }}
                          onMouseEnter={() => setHoveredEvent(doc.id)}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          {externalHighlightSet?.has(doc.id) && (
                            <span style={{
                              position: 'absolute', top: -8, right: -4,
                              background: '#fbbf24', color: '#000',
                              fontSize: '10px', fontWeight: 700,
                              padding: '2px 6px', borderRadius: '4px',
                              letterSpacing: '0.5px', zIndex: 2
                            }}>LINKED</span>
                          )}
                          {retaliationConn && (
                            <div style={styles.retaliationBadge}>
                              {'\u26A1'} {retaliationConn.daysBetween} days after protected activity
                            </div>
                          )}

                          <div style={{
                            ...styles.eventType,
                            color: getEvidenceColor(doc.evidence_type),
                            opacity: doc.evidence_confidence != null ? Math.max(0.5, doc.evidence_confidence) : 1
                          }} title={getEvidenceDescription(doc.evidence_type)}>
                            <span style={styles.eventIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                            {formatEvidenceType(doc.evidence_type)}
                            {doc.evidence_confidence != null && doc.evidence_confidence < 0.6 && (
                              <span style={styles.lowConfidence} title={`Confidence: ${Math.round(doc.evidence_confidence * 100)}%`}>?</span>
                            )}
                            {doc.evidence_secondary && doc.evidence_secondary !== doc.evidence_type && doc.evidence_confidence != null && doc.evidence_confidence < 0.6 && (
                              <span style={styles.secondaryType} title={`Also: ${formatEvidenceType(doc.evidence_secondary)}`}>
                                /{formatEvidenceType(doc.evidence_secondary)}
                              </span>
                            )}
                          </div>

                          <div style={styles.eventTitle}>
                            {doc.isDateEntry && <span title="Pinned date entry">{'\uD83D\uDCCC'} </span>}
                            {doc.group_id && <span title="Linked document group">{'\uD83D\uDCCE'} </span>}
                            {doc.filename}
                          </div>

                          {doc.isDateEntry && doc.pinLabel && (
                            <div style={styles.pinLabelBadge}>
                              {doc.pinLabel}
                            </div>
                          )}

                          <div style={styles.eventMeta}>
                            {doc.file_type && (
                              <span style={styles.fileTypeBadge}>
                                {doc.file_type.replace('application/', '').replace('image/', '')}
                              </span>
                            )}
                            <span style={styles.confidenceBadge}>
                              {doc.document_date_confidence}
                            </span>
                          </div>

                          {/* Precedent badge */}
                          {(doc.evidence_type === 'PROTECTED_ACTIVITY' ||
                            doc.evidence_type === 'ADVERSE_ACTION') &&
                            precedentAnalysis?.precedents?.burlington_northern && (
                            <div style={{
                              ...styles.precedentBadge,
                              background: getPrecedentColor(precedentAnalysis.precedents.burlington_northern.alignmentPercent),
                              cursor: 'pointer'
                            }} onClick={e => { e.stopPropagation(); setShowCaseStrength(true); }}>
                              BN: {precedentAnalysis.precedents.burlington_northern.alignmentPercent}%
                            </div>
                          )}
                          {doc.evidence_type === 'INCIDENT' &&
                            precedentAnalysis?.precedents?.harris && (
                            <div style={{
                              ...styles.precedentBadge,
                              background: getPrecedentColor(precedentAnalysis.precedents.harris.alignmentPercent),
                              cursor: 'pointer'
                            }} onClick={e => { e.stopPropagation(); setShowCaseStrength(true); }}>
                              Harris: {precedentAnalysis.precedents.harris.alignmentPercent}%
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Incident cards for this date group */}
                  {(zoomLevel === 'day' || zoomLevel === 'hour') && (incidentsByDate[group.key] || []).map(incident => {
                    const incExpanded = expandedSpineEvent === `inc-${incident.id}`;
                    const sevColor = getSeverityColor(incident.computed_severity || incident.base_severity);
                    return (
                      <div
                        key={`incident-${incident.id}`}
                        style={{
                          ...styles.incidentCard,
                          borderLeftColor: sevColor,
                          cursor: 'pointer'
                        }}
                        onClick={() => setExpandedSpineEvent(incExpanded ? null : `inc-${incident.id}`)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={styles.incidentTypeLabel}>
                            {incident.incident_type?.replace(/_/g, ' ')}
                          </div>
                          <div style={{ ...styles.severityBadge, background: sevColor + '20', color: sevColor }}>
                            {incident.computed_severity || incident.base_severity}
                          </div>
                          {incident.documents?.length > 0 && (
                            <span style={{ fontSize: '10px', color: colors.textMuted }}>
                              {incident.documents.length} doc{incident.documents.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: 'auto' }}>
                            {incExpanded ? '\u25B2' : '\u25BC'}
                          </span>
                        </div>
                        <div style={styles.incidentTitle}>
                          {incident.title}
                        </div>
                        {incExpanded && incident.description && (
                          <div style={styles.incidentDesc}>
                            {incident.description}
                          </div>
                        )}
                        {incExpanded && incident.documents?.length > 0 && (
                          <div style={{ marginTop: '4px', paddingLeft: '4px', borderLeft: `2px solid ${sevColor}40` }}>
                            {incident.documents.map(doc => (
                              <div key={doc.id}
                                style={{
                                  padding: '3px 6px', fontSize: '11px', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  borderRadius: radius.xs, marginBottom: '2px',
                                  background: colors.bgSecondary
                                }}
                                onClick={(e) => { e.stopPropagation(); onSelectDocument && onSelectDocument(doc); }}
                              >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getEvidenceColor(doc.evidence_type), flexShrink: 0 }} />
                                <span style={{ fontWeight: 500, color: colors.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {doc.filename}
                                </span>
                                {doc.relationship && (
                                  <span style={{ fontSize: '9px', color: colors.textMuted, fontStyle: 'italic' }}>{doc.relationship}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Undated documents tray */}
      {filteredUndated.length > 0 && (
        <div style={styles.undatedTray}>
          <div style={styles.undatedHeader}>
            <span style={styles.undatedTitle}>Undated Documents</span>
            <span style={styles.undatedCount}>{filteredUndated.length}</span>
          </div>
          <div style={styles.undatedList}>
            {filteredUndated.map(doc => (
              <button
                key={doc.id}
                onClick={() => onSelectDocument && onSelectDocument(doc)}
                style={styles.undatedItem}
              >
                <span style={styles.undatedIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                <span style={{
                  ...styles.undatedDot,
                  background: getEvidenceColor(doc.evidence_type)
                }} />
                <span style={styles.undatedName}>{doc.filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDraggingOver && (
        <div style={styles.dragOverlay}>
          <div style={styles.dragContent}>
            <span style={styles.dragIcon}>{'\uD83D\uDCE5'}</span>
            <span style={styles.dragText}>Drop to add evidence</span>
          </div>
        </div>
      )}

      {/* Case Strength modal */}
      {showCaseStrength && (
        <CaseStrength
          analysis={precedentAnalysis}
          jurisdiction={jurisdiction}
          onClose={() => setShowCaseStrength(false)}
        />
      )}

      {/* Incident approval modal */}
      {showIncidentApproval && pendingIncidents.length > 0 && (
        <IncidentApproval
          incidents={pendingIncidents}
          jurisdiction={jurisdiction}
          onApprove={handleApproveIncident}
          onDismiss={handleDismissIncident}
          onClose={() => {
            setShowIncidentApproval(false);
            setPendingIncidents([]);
            // Chain to actor approval if we have pending actors
            if (pendingActors.length > 0) {
              setShowActorApproval(true);
            }
          }}
        />
      )}

      {/* Actor approval modal */}
      {showActorApproval && pendingActors.length > 0 && (
        <ActorApproval
          actors={pendingActors}
          onApprove={handleApproveActor}
          onDismiss={handleDismissActor}
          onClose={() => {
            setShowActorApproval(false);
            setPendingActors([]);
          }}
        />
      )}

      {/* Near-duplicate review overlay */}
      {/* Document-Event Link Suggestion Modal */}
      {showLinkModal && linkSuggestions && (
        <div style={styles.linkOverlay} onClick={() => { setShowLinkModal(false); setLinkSuggestions(null); setShowEventPicker(false); setEventPickerSearch(''); }}>
          <div style={styles.linkModal} onClick={e => e.stopPropagation()}>
            {!showEventPicker ? (
              <>
                <h3 style={styles.linkModalTitle}>Link Document to Events?</h3>
                <p style={styles.linkModalHint}>
                  This document might support {linkSuggestions.suggestions.length} existing event{linkSuggestions.suggestions.length !== 1 ? 's' : ''}:
                </p>
                {linkSuggestions.suggestions.map(s => (
                  <div key={s.event.id} style={styles.suggestionCard}>
                    <div style={styles.suggestionScore}>{s.score}%</div>
                    <div style={styles.suggestionInfo}>
                      <strong style={styles.suggestionTitle}>{s.event.title}</strong>
                      <div style={styles.suggestionDate}>
                        {s.event.date ? new Date(s.event.date).toLocaleDateString() : 'No date'}
                      </div>
                      <div style={styles.suggestionReason}>{s.reason}</div>
                    </div>
                    <button
                      style={styles.linkBtn}
                      onClick={async () => {
                        await window.api.events.linkDocumentV2(
                          caseIdRef.current,
                          s.event.id,
                          linkSuggestions.documentId,
                          'supports'
                        );
                        const remaining = linkSuggestions.suggestions.filter(x => x.event.id !== s.event.id);
                        if (remaining.length === 0) {
                          setShowLinkModal(false);
                          setLinkSuggestions(null);
                          loadTimeline();
                        } else {
                          setLinkSuggestions({ ...linkSuggestions, suggestions: remaining });
                          loadTimeline();
                        }
                      }}
                    >
                      Link
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    style={styles.skipBtn}
                    onClick={() => { setShowLinkModal(false); setLinkSuggestions(null); }}
                  >
                    Skip for now
                  </button>
                  <button
                    style={styles.linkOtherBtn}
                    onClick={async () => {
                      const result = await window.api.events.list(caseIdRef.current);
                      if (result.success) setAllEvents(result.events || []);
                      setShowEventPicker(true);
                      setEventPickerSearch('');
                    }}
                  >
                    Link to a different event...
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={styles.linkModalTitle}>Choose an Event</h3>
                <input
                  style={styles.eventPickerSearch}
                  placeholder="Search events..."
                  value={eventPickerSearch}
                  onChange={e => setEventPickerSearch(e.target.value)}
                  autoFocus
                />
                <div style={styles.eventPickerList}>
                  {allEvents
                    .filter(e => !eventPickerSearch || e.title?.toLowerCase().includes(eventPickerSearch.toLowerCase()))
                    .map(e => (
                      <div key={e.id} style={styles.eventPickerRow}>
                        <div style={styles.eventPickerInfo}>
                          <div style={styles.eventPickerTitle}>{e.title}</div>
                          {e.date && <div style={styles.eventPickerDate}>{new Date(e.date).toLocaleDateString()}</div>}
                        </div>
                        <button
                          style={styles.linkBtn}
                          onClick={async () => {
                            await window.api.events.linkDocumentV2(
                              caseIdRef.current,
                              e.id,
                              linkSuggestions.documentId,
                              'supports'
                            );
                            setShowEventPicker(false);
                            setEventPickerSearch('');
                            loadTimeline();
                          }}
                        >
                          Link
                        </button>
                      </div>
                    ))
                  }
                </div>
                <button style={styles.skipBtn} onClick={() => { setShowEventPicker(false); setEventPickerSearch(''); }}>
                  ← Back
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showDuplicateReview && nearDuplicates.length > 0 && (
        <div style={styles.dupOverlay}>
          <div style={styles.dupPanel}>
            <div style={styles.dupHeader}>
              <h3 style={styles.dupTitle}>{'\u26A0\uFE0F'} Potential Duplicates Detected</h3>
              <button style={styles.dupCloseBtn} onClick={() => {
                setShowDuplicateReview(false);
                setNearDuplicates([]);
              }}>{'\u2715'}</button>
            </div>
            <p style={styles.dupDesc}>
              The following newly imported files appear very similar to existing documents.
              You can remove the duplicate or keep both copies.
            </p>
            <div style={styles.dupList}>
              {nearDuplicates.map((dup, i) => (
                <div key={i} style={styles.dupItem}>
                  <div style={styles.dupInfo}>
                    <div style={styles.dupFileRow}>
                      <span style={styles.dupLabel}>New:</span>
                      <span style={styles.dupFileName}>{dup.newFile}</span>
                    </div>
                    <div style={styles.dupFileRow}>
                      <span style={styles.dupLabel}>Matches:</span>
                      <span style={styles.dupFileName}>{dup.existingFile}</span>
                    </div>
                    <div style={styles.dupSimilarity}>
                      {dup.similarity}% similar
                    </div>
                  </div>
                  <div style={styles.dupActions}>
                    <button
                      style={styles.dupRemoveBtn}
                      onClick={async () => {
                        await window.api.documents.delete(dup.newDocId);
                        const remaining = nearDuplicates.filter((_, j) => j !== i);
                        setNearDuplicates(remaining);
                        if (remaining.length === 0) setShowDuplicateReview(false);
                        loadTimeline();
                      }}
                    >
                      Remove New
                    </button>
                    <button
                      style={styles.dupKeepBtn}
                      onClick={() => {
                        const remaining = nearDuplicates.filter((_, j) => j !== i);
                        setNearDuplicates(remaining);
                        if (remaining.length === 0) setShowDuplicateReview(false);
                      }}
                    >
                      Keep Both
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Moment Modal (B5/B7) */}
      {editingMoment !== null && (
        <EditMomentModal
          caseId={caseIdRef.current}
          momentId={editingMoment}
          onClose={() => setEditingMoment(null)}
          onSave={() => { loadTimeline(); setEditingMoment(null); }}
        />
      )}

      {/* Delete Confirm Modal (B6/B7) */}
      {deletingItem && (
        <DeleteConfirmModal
          item={deletingItem.data}
          itemType={deletingItem.type}
          impact={deleteImpact}
          onConfirm={confirmDelete}
          onCancel={() => { setDeletingItem(null); setDeleteImpact(null); }}
        />
      )}
    </div>
  );
}

// Year view: group documents by evidence type and show summary
function YearSummary({ documents, onSelectDocument, styles }) {
  const byType = {};
  for (const doc of documents) {
    const t = doc.evidence_type || 'CONTEXT';
    if (!byType[t]) byType[t] = [];
    byType[t].push(doc);
  }

  return Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, docs]) => (
    <div key={type} style={styles.yearTypeGroup}>
      <div style={{
        ...styles.yearTypeHeader,
        color: getEvidenceColor(type)
      }}>
        <span>{getEvidenceIcon(type)}</span>
        <span>{formatEvidenceType(type)}</span>
        <span style={styles.yearTypeCount}>{docs.length}</span>
      </div>
      {docs.map(doc => (
        <div
          key={doc.id}
          style={styles.yearDocRow}
          onClick={() => onSelectDocument && onSelectDocument(doc)}
        >
          <span style={styles.yearDocName}>{doc.filename}</span>
          <span style={styles.yearDocDate}>
            {new Date(doc.document_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      ))}
    </div>
  ));
}

function getPrecedentColor(percent) {
  if (percent >= 70) return '#DCFCE7';
  if (percent >= 40) return '#FEF9C3';
  return '#FEE2E2';
}

const EVIDENCE_TYPE_GLOSSARY = {
  ADVERSE_ACTION: 'Negative employment action taken against you (demotion, warning, termination)',
  PROTECTED_ACTIVITY: 'Your formal complaints, EEOC filings, or whistleblower reports',
  REQUEST_FOR_HELP: 'Emails or messages where you asked for help or escalated concerns',
  INCIDENT: 'Records of discriminatory incidents, harassment, or hostile behavior',
  RESPONSE: 'Company responses to your complaints or reports',
  CLAIM_AGAINST_YOU: 'Performance complaints, PIPs, or allegations made about you',
  CLAIM_YOU_MADE: 'Formal claims, charges, or legal filings you initiated',
  PAY_RECORD: 'Pay stubs, bonus records, compensation documentation',
  SUPPORTING: 'Witness statements, corroborating evidence, character references',
  CONTEXT: 'Background documents, org charts, policies, general context'
};

function formatEvidenceType(type) {
  const labels = {
    'ADVERSE_ACTION': 'Adverse Action',
    'INCIDENT': 'Incident',
    'PROTECTED_ACTIVITY': 'Protected Activity',
    'REQUEST_FOR_HELP': 'Request for Help',
    'RESPONSE': 'Response',
    'CLAIM_AGAINST_YOU': 'Claim Against You',
    'CLAIM_YOU_MADE': 'Your Claim',
    'PAY_RECORD': 'Pay Record',
    'CONTEXT': 'Context',
    'SUPPORTING': 'Supporting'
  };
  return labels[type] || type?.replace(/_/g, ' ') || 'Document';
}

function getEvidenceDescription(type) {
  return EVIDENCE_TYPE_GLOSSARY[type] || '';
}

function getStyles() {
  return {
    container: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: colors.bg,
      position: 'relative',
      transition: 'background 0.2s ease'
    },
    containerDragOver: {
      background: colors.surfaceAlt
    },

    // Ingest overlay
    ingestOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
    },
    ingestSpinner: {
      width: '16px',
      height: '16px',
      border: `2px solid rgba(255,255,255,0.3)`,
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    ingestText: {
      color: colors.textInverse,
    },

    // Loading
    loadingContainer: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      background: colors.bg
    },
    loadingSpinner: {
      width: '32px',
      height: '32px',
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.primary,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: typography.fontSize.base
    },

    // Header
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.lg} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0
    },
    dateRange: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono
    },
    spanBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      background: colors.surfaceAlt,
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.full
    },
    docCount: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    importButton: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },
    importButtonLarge: {
      padding: `${spacing.md} ${spacing.xl}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      marginBottom: spacing.lg,
      transition: 'background 0.15s ease'
    },
    escalationBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.adverseAction,
      background: colors.escalationBg,
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.full
    },
    escalationIcon: {
      fontSize: typography.fontSize.base
    },
    caseStrengthBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      padding: `${spacing.xs} ${spacing.md}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      cursor: 'pointer',
      transition: 'all 0.15s ease'
    },
    caseStrengthIcon: {
      fontSize: typography.fontSize.base
    },

    // Jurisdiction toggle
    jurisdictionToggle: {
      display: 'flex',
      alignItems: 'center',
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      padding: '2px',
      gap: '1px'
    },
    jurisdictionBtn: {
      padding: `${spacing.xs} ${spacing.sm}`,
      background: 'none',
      border: 'none',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      color: colors.textMuted,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap'
    },
    jurisdictionBtnActive: {
      background: colors.primary,
      color: colors.textInverse,
      fontWeight: typography.fontWeight.semibold
    },

    // Zoom controls
    zoomControls: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      padding: '2px'
    },
    zoomButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      background: 'none',
      border: 'none',
      borderRadius: radius.sm,
      color: colors.textSecondary,
      cursor: 'pointer',
      transition: 'background 0.1s ease'
    },
    zoomButtonDisabled: {
      opacity: 0.3,
      cursor: 'default'
    },
    zoomLabel: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '52px',
      height: '28px',
      color: colors.textPrimary,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      padding: `0 ${spacing.xs}`
    },

    // Legend
    legend: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
      padding: `${spacing.sm} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface
    },
    legendControls: {
      display: 'flex',
      gap: spacing.xs
    },
    legendControlBtn: {
      background: 'transparent',
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      padding: `2px ${spacing.sm}`,
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      cursor: 'pointer'
    },
    legendPills: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.xs
    },
    legendPill: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      padding: `4px ${spacing.md}`,
      border: '2px solid',
      borderRadius: radius.full,
      background: `${colors.surface}`,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      fontFamily: 'inherit',
      outline: 'none',
      userSelect: 'none'
    },
    legendPillHidden: {
      opacity: 0.35,
      background: 'transparent',
      borderStyle: 'dashed'
    },
    legendDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0
    },
    legendIcon: {
      fontSize: '12px',
      lineHeight: 1
    },
    legendLabel: {
      whiteSpace: 'nowrap'
    },
    connectionToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    connectionToggleBtn: {
      background: 'transparent',
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      padding: `3px ${spacing.sm}`,
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      cursor: 'pointer',
      transition: 'all 0.15s ease'
    },
    connectionToggleBtnActive: {
      background: colors.primary + '18',
      borderColor: colors.primary,
      color: colors.primary
    },
    connectionLegend: {
      display: 'flex',
      gap: spacing.md,
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    connectionLegendItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs
    },
    connectionLegendDot: {
      width: '10px',
      height: '4px',
      borderRadius: '2px'
    },
    filterInfo: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic'
    },

    // Empty state
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      textAlign: 'center'
    },
    emptyIcon: {
      fontSize: '64px',
      marginBottom: spacing.lg,
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: `0 0 ${spacing.sm} 0`
    },
    emptyText: {
      fontSize: typography.fontSize.base,
      color: colors.textMuted,
      margin: `0 0 ${spacing.lg} 0`
    },
    emptyHints: {
      display: 'flex',
      gap: spacing.md,
      flexWrap: 'wrap',
      justifyContent: 'center'
    },
    emptyHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      background: colors.surface,
      padding: `${spacing.sm} ${spacing.md}`,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`
    },

    // Timeline
    timelineWrapper: {
      flex: 1,
      overflow: 'auto',
      padding: spacing.xl,
      position: 'relative'
    },
    connectionsLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none',
      zIndex: 10
    },
    timeline: {
      display: 'flex',
      gap: spacing.lg,
      minHeight: '100%',
      position: 'relative'
    },
    dateColumn: {
      minWidth: '180px',
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md,
      transition: 'min-width 0.2s ease'
    },
    dateColumnWide: {
      minWidth: '260px'
    },
    dateColumnMedium: {
      minWidth: '200px'
    },
    dateHeader: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: spacing.sm,
      background: colors.surface,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.sm
    },
    dateHeaderCompact: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: `${spacing.sm} ${spacing.md}`
    },
    dateDay: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold,
      color: colors.textPrimary,
      lineHeight: 1
    },
    dateMonth: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    groupLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    groupCount: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.full
    },
    eventsColumn: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },

    // Day view: full event card
    eventCard: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderLeft: `4px solid ${colors.context}`,
      boxShadow: shadows.sm,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      position: 'relative'
    },
    eventCardHover: {
      boxShadow: shadows.md,
      transform: 'translateY(-2px)'
    },
    eventCardPinned: {
      borderStyle: 'dashed',
      background: `${colors.surface}ee`,
      opacity: 0.92
    },
    pinLabelBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginBottom: spacing.xs,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    retaliationBadge: {
      position: 'absolute',
      top: `-${spacing.sm}`,
      left: spacing.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textInverse,
      background: colors.retaliationBg,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      whiteSpace: 'nowrap'
    },
    eventType: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.xs,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs
    },
    eventIcon: {
      fontSize: '13px',
      lineHeight: 1
    },
    eventTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    eventMeta: {
      display: 'flex',
      gap: spacing.sm
    },
    fileTypeBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.sm,
      fontFamily: typography.fontFamilyMono,
      textTransform: 'lowercase'
    },
    confidenceBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.sm
    },
    precedentBadge: {
      display: 'inline-block',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      marginTop: spacing.xs
    },
    lowConfidence: {
      display: 'inline-block',
      fontSize: '9px',
      fontWeight: typography.fontWeight.bold,
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.15)',
      borderRadius: '50%',
      width: '14px',
      height: '14px',
      lineHeight: '14px',
      textAlign: 'center',
      marginLeft: '4px'
    },
    secondaryType: {
      fontSize: '9px',
      color: colors.textTertiary,
      marginLeft: '2px',
      fontWeight: typography.fontWeight.normal
    },
    reclassifyBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      color: colors.textSecondary,
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap'
    },

    // Month view: compact event card
    eventCardCompact: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      background: colors.surface,
      borderRadius: radius.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      borderLeft: `3px solid ${colors.context}`,
      boxShadow: shadows.sm,
      cursor: 'pointer',
      transition: 'box-shadow 0.15s ease'
    },
    compactTitle: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    compactDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono,
      whiteSpace: 'nowrap'
    },

    // Year view: type groups
    yearTypeGroup: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: spacing.sm,
      boxShadow: shadows.sm,
      marginBottom: spacing.xs
    },
    yearTypeHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.xs,
      padding: `0 ${spacing.xs}`
    },
    yearTypeCount: {
      marginLeft: 'auto',
      background: colors.surfaceAlt,
      color: colors.textMuted,
      padding: `1px ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.xs
    },
    yearDocRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.sm,
      cursor: 'pointer',
      transition: 'background 0.1s ease'
    },
    yearDocName: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      marginRight: spacing.sm
    },
    yearDocDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono,
      whiteSpace: 'nowrap'
    },

    // Undated tray
    undatedTray: {
      borderTop: `1px solid ${colors.border}`,
      padding: `${spacing.md} ${spacing.xl}`,
      background: colors.surfaceAlt,
      maxHeight: '140px',
      overflowY: 'auto'
    },
    undatedHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm
    },
    undatedTitle: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    undatedCount: {
      fontSize: typography.fontSize.xs,
      background: colors.warning + '20',
      color: colors.warning,
      padding: `1px 6px`,
      borderRadius: radius.full
    },
    undatedList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.sm
    },
    undatedItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      transition: 'box-shadow 0.15s ease'
    },
    undatedIcon: {
      fontSize: '13px',
      lineHeight: 1
    },
    undatedDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0
    },
    undatedName: {
      maxWidth: '150px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },

    // Drag overlay
    dragOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(37, 99, 235, 0.1)',
      border: `3px dashed ${colors.primary}`,
      borderRadius: radius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      pointerEvents: 'none'
    },
    dragContent: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: spacing.md
    },
    dragIcon: {
      fontSize: '48px'
    },
    dragText: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.primary
    },

    // Incident cards
    incidentCard: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderLeft: `4px solid ${colors.severityModerate}`,
      boxShadow: shadows.sm,
      cursor: 'default',
      marginTop: spacing.sm
    },
    incidentTypeLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: colors.textMuted,
      marginBottom: spacing.xs
    },
    incidentTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      marginBottom: spacing.xs
    },
    incidentDesc: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      lineHeight: typography.lineHeight.relaxed,
      marginBottom: spacing.sm
    },
    severityBadge: {
      display: 'inline-block',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      textTransform: 'capitalize'
    },

    // Duplicate review overlay
    dupOverlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    dupPanel: {
      background: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      maxWidth: '520px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: shadows.lg
    },
    dupHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md
    },
    dupTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0
    },
    dupCloseBtn: {
      background: 'none',
      border: 'none',
      fontSize: '18px',
      color: colors.textMuted,
      cursor: 'pointer'
    },
    dupDesc: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      margin: `0 0 ${spacing.lg} 0`
    },
    dupList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md
    },
    dupItem: {
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md
    },
    dupInfo: {
      flex: 1,
      minWidth: 0
    },
    dupFileRow: {
      display: 'flex',
      gap: spacing.sm,
      alignItems: 'baseline',
      marginBottom: '2px'
    },
    dupLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      flexShrink: 0,
      width: '55px'
    },
    dupFileName: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      fontWeight: typography.fontWeight.medium,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    dupSimilarity: {
      fontSize: typography.fontSize.xs,
      color: '#F59E0B',
      fontWeight: typography.fontWeight.semibold,
      marginTop: spacing.xs
    },
    dupActions: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
      flexShrink: 0
    },
    dupRemoveBtn: {
      padding: `${spacing.xs} ${spacing.md}`,
      background: '#7F1D1D',
      color: '#FCA5A5',
      border: 'none',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    },
    dupKeepBtn: {
      padding: `${spacing.xs} ${spacing.md}`,
      background: 'transparent',
      color: colors.textMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      fontSize: typography.fontSize.xs,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    },

    // Events spine
    eventSpineSection: {
      marginBottom: spacing.lg,
      background: colors.surface,
      borderRadius: radius.lg,
      border: `1px solid ${colors.border}`,
      overflow: 'hidden'
    },
    eventSpineHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${spacing.sm} ${spacing.md}`,
      borderBottom: `1px solid ${colors.border}`
    },
    eventSpineToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      background: 'none',
      border: 'none',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      cursor: 'pointer',
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.sm
    },
    arrowNav: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs
    },
    arrowBtn: {
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      padding: `${spacing.xs} ${spacing.sm}`,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      color: colors.textPrimary,
      lineHeight: 1
    },
    arrowLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      minWidth: '50px',
      textAlign: 'center'
    },
    arrowDismiss: {
      background: 'none',
      border: 'none',
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      cursor: 'pointer',
      padding: `${spacing.xs} ${spacing.sm}`
    },
    startNavBtn: {
      background: colors.primary,
      color: '#FFFFFF',
      border: 'none',
      borderRadius: radius.sm,
      padding: `${spacing.xs} ${spacing.md}`,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    },
    eventSpineList: {
      padding: spacing.sm
    },
    spineNode: {
      borderLeft: `3px solid ${colors.border}`,
      marginLeft: spacing.md,
      padding: `${spacing.sm} ${spacing.md}`,
      marginBottom: spacing.xs,
      cursor: 'pointer',
      borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
      transition: 'background 0.15s ease'
    },
    spineNodeHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap'
    },
    spineTypeBadge: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      padding: `1px ${spacing.sm}`,
      borderRadius: radius.sm,
      textTransform: 'uppercase',
      letterSpacing: '0.3px'
    },
    spineTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    spineDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    spineWeightBadge: {
      fontSize: '10px',
      letterSpacing: '1px'
    },
    spineUpdated: {
      fontSize: '10px',
      color: colors.textMuted,
      marginTop: '2px'
    },
    spineExpanded: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      paddingTop: spacing.xs,
      borderTop: `1px solid ${colors.border}`,
      lineHeight: 1.4
    },
    linkOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9000
    },
    linkModal: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '24px',
      width: '480px',
      maxWidth: '90vw',
      boxShadow: shadows.lg
    },
    linkModalTitle: {
      margin: '0 0 8px',
      fontSize: typography.fontSize.lg,
      color: colors.text
    },
    linkModalHint: {
      margin: '0 0 16px',
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary
    },
    suggestionCard: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      marginBottom: '8px',
      background: colors.background,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md
    },
    suggestionScore: {
      minWidth: '44px',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: typography.fontSize.sm,
      color: '#8B5CF6',
      background: 'rgba(139,92,246,0.1)',
      borderRadius: radius.sm,
      padding: '4px 6px'
    },
    suggestionInfo: {
      flex: 1,
      minWidth: 0
    },
    suggestionTitle: {
      fontSize: typography.fontSize.sm,
      color: colors.text,
      display: 'block',
      marginBottom: '2px'
    },
    suggestionDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    suggestionReason: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      marginTop: '2px'
    },
    linkBtn: {
      padding: '6px 14px',
      background: '#8B5CF6',
      color: '#fff',
      border: 'none',
      borderRadius: radius.sm,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    },
    skipBtn: {
      marginTop: '12px',
      padding: '8px 16px',
      background: 'transparent',
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm
    },
    linkOtherBtn: {
      marginTop: '12px',
      padding: '8px 16px',
      background: 'transparent',
      color: colors.primary,
      border: `1px solid ${colors.primary}`,
      borderRadius: radius.sm,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm
    },
    eventPickerSearch: {
      width: '100%',
      padding: '8px 10px',
      marginBottom: '8px',
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      color: colors.textPrimary,
      fontSize: typography.fontSize.sm,
      outline: 'none',
      boxSizing: 'border-box'
    },
    eventPickerList: {
      maxHeight: '300px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginBottom: '8px'
    },
    eventPickerRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      background: colors.surfaceAlt,
      borderRadius: radius.sm
    },
    eventPickerInfo: {
      flex: 1,
      minWidth: 0
    },
    eventPickerTitle: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      fontWeight: typography.fontWeight.medium,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    eventPickerDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    }
  };
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

// SESSION-9B: Unified timeline styles
const styles9b = {
  unifiedSection: {
    margin: '16px 0',
    border: '1px solid #E5E7EB',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#FAFAFA'
  },
  unifiedHeader: {
    padding: '12px 16px',
    backgroundColor: '#F3F4F6',
    borderBottom: '1px solid #E5E7EB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  unifiedTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151'
  },
  unifiedHint: {
    fontSize: '12px',
    color: '#9CA3AF'
  },
  unifiedList: {
    padding: '8px 0',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 350px)',
    paddingRight: '10px'
  },
  unifiedItem: {
    display: 'flex',
    gap: '14px',
    padding: '12px 16px',
    alignItems: 'flex-start',
    borderBottom: '1px solid #F3F4F6'
  },
  momentBadge: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'solid',
    backgroundColor: 'white',
    flexShrink: 0,
    transition: 'all 0.2s ease'
  },
  docBadge: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    flexShrink: 0
  },
  itemContent: {
    flex: 1,
    minWidth: 0
  },
  itemTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '3px',
    color: '#111827'
  },
  itemDate: {
    fontSize: '13px',
    color: '#6B7280',
    marginBottom: '6px'
  },
  dateConfidence: {
    fontSize: '11px',
    color: '#9CA3AF'
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    marginBottom: '8px'
  },
  tag: {
    padding: '2px 8px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid currentColor',
    textTransform: 'capitalize',
    color: '#6B7280'
  },
  docCount: {
    fontSize: '12px',
    color: '#6B7280',
    marginBottom: '8px'
  },
  linkedDoc: {
    fontSize: '11px',
    color: '#9CA3AF',
    paddingLeft: '12px',
    marginTop: '2px'
  },
  noDocsWarning: {
    fontSize: '12px',
    color: '#F59E0B',
    marginBottom: '8px'
  },
  actionRow: {
    display: 'flex',
    gap: '8px'
  },
  actionBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #D1D5DB',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  dangerBtn: {
    borderColor: '#FCA5A5',
    color: '#DC2626'
  }
};
