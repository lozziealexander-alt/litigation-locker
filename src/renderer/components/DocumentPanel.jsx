import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../styles/ThemeContext';
import { colors, shadows, spacing, typography, radius, getEvidenceColor } from '../styles/tokens';
import NotifyModal, { NotifySummary } from './NotifyModal';

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'ADVERSE_ACTION', label: 'Adverse Action', desc: 'Demotion, warning, termination' },
  { value: 'INCIDENT', label: 'Incident', desc: 'Discrimination, harassment, hostile behavior' },
  { value: 'PROTECTED_ACTIVITY', label: 'Protected Activity', desc: 'Complaints, EEOC filings, whistleblower reports' },
  { value: 'REQUEST_FOR_HELP', label: 'Request for Help', desc: 'Asking for help or escalating concerns' },
  { value: 'RESPONSE', label: 'Response', desc: 'Company responses to your complaints' },
  { value: 'CLAIM_AGAINST_YOU', label: 'Claim Against You', desc: 'PIPs, performance complaints, allegations' },
  { value: 'CLAIM_YOU_MADE', label: 'Your Claim', desc: 'Formal claims, charges, legal filings' },
  { value: 'PAY_RECORD', label: 'Pay Record', desc: 'Pay stubs, bonus records, compensation' },
  { value: 'CONTEXT', label: 'Context', desc: 'Org charts, policies, background docs' },
  { value: 'SUPPORTING', label: 'Supporting', desc: 'Witness statements, corroborating evidence' }
];

const DOCUMENT_SUBTYPE_OPTIONS = [
  { value: '', label: '— None —' },
  { value: 'recap_self_doc', label: '📝 Recap / Self-Documentation' },
  { value: 'feedback_email', label: '📧 Feedback Email' },
  { value: 'forward_fyi', label: '📤 Forward / FYI' }
];

export default function DocumentPanel({ caseId, document: doc, onClose, onDocumentUpdated, onNavigate }) {
  const { mode } = useTheme();
  const [fullDoc, setFullDoc] = useState(null);
  const [allDocs, setAllDocs] = useState([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editContext, setEditContext] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  // Date entries (multi-date timeline)
  const [dateEntries, setDateEntries] = useState([]);
  const [addingDateEntry, setAddingDateEntry] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState('');
  const [newEntryLabel, setNewEntryLabel] = useState('');
  // Document linking / groups
  const [groups, setGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [dateSaveFlash, setDateSaveFlash] = useState(false);
  // Document actors
  const [docActors, setDocActors] = useState([]);
  const [allActors, setAllActors] = useState([]);
  const [showActorPicker, setShowActorPicker] = useState(false);
  const [actorSearch, setActorSearch] = useState('');
  // Linked moments
  const [linkedMoments, setLinkedMoments] = useState([]);
  const [allMoments, setAllMoments] = useState([]);
  const [showMomentPicker, setShowMomentPicker] = useState(false);
  const [selectedMomentId, setSelectedMomentId] = useState('');
  const [linkingMoment, setLinkingMoment] = useState(false);
  const [linkError, setLinkError] = useState(null);
  // Notifications
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifiedActors, setNotifiedActors] = useState([]);
  const nameInputRef = useRef(null);
  const styles = getStyles();

  useEffect(() => {
    if (doc?.id) {
      loadFullDocument(doc.id);
      loadDateEntries(doc.id);
      loadDocActors(doc.id);
      loadLinkedMoments(doc.id);
      loadNotifications(doc.id);
      setPreviewData(null);
      setShowPreview(false);
      setPreviewError(null);
      setShowGroupPicker(false);
      setCreatingGroup(false);
      setShowActorPicker(false);
      setActorSearch('');
      setShowMomentPicker(false);
      setSelectedMomentId('');
    }
  }, [doc?.id]);

  // Load all docs for prev/next navigation
  useEffect(() => {
    if (!onNavigate) return;
    (async () => {
      try {
        const result = await window.api.documents.list();
        if (result.success) {
          const sorted = (result.documents || []).sort((a, b) => {
            const da = a.document_date || '';
            const db = b.document_date || '';
            return da.localeCompare(db);
          });
          setAllDocs(sorted);
        }
      } catch (e) {}
    })();
  }, [onNavigate]);

  const currentDocIndex = allDocs.findIndex(d => d.id === doc?.id);
  const prevDoc = currentDocIndex > 0 ? allDocs[currentDocIndex - 1] : null;
  const nextDoc = currentDocIndex < allDocs.length - 1 ? allDocs[currentDocIndex + 1] : null;

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  async function loadFullDocument(docId) {
    const result = await window.api.documents.get(docId);
    if (result.success) {
      setFullDoc(result.document);
      // Load group members if document has a group
      if (result.document.group_id) {
        loadGroupMembers(result.document.group_id);
      } else {
        setGroupMembers([]);
      }
    }
  }

  async function loadDateEntries(docId) {
    const result = await window.api.documents.getDateEntries(docId);
    if (result.success) {
      setDateEntries(result.entries);
    }
  }

  async function loadGroupMembers(groupId) {
    const result = await window.api.groups.getMembers(groupId);
    if (result.success) {
      setGroupMembers(result.members);
    }
  }

  async function loadGroups() {
    const result = await window.api.groups.list();
    if (result.success) {
      setGroups(result.groups);
    }
  }

  async function loadDocActors(docId) {
    const result = await window.api.actors.getForDocument(docId);
    if (result.success) {
      setDocActors(result.actors);
    }
  }

  async function loadLinkedMoments(docId) {
    if (!caseId) return;
    try {
      const result = await window.api.events.getForDocument(caseId, docId);
      if (result.success) setLinkedMoments(result.events || []);
    } catch (e) {}
  }

  async function loadAllMoments() {
    if (!caseId) return;
    try {
      const result = await window.api.events.list(caseId);
      if (result.success) setAllMoments(result.events || []);
    } catch (e) {}
  }

  async function handleLinkMoment() {
    if (!selectedMomentId || !caseId) return;
    setLinkingMoment(true);
    setLinkError(null);
    try {
      const res = await window.api.events.linkEvidence(caseId, selectedMomentId, doc.id);
      if (res.success) {
        await loadLinkedMoments(doc.id);
        setSelectedMomentId('');
        setShowMomentPicker(false);
      } else {
        setLinkError(res.error || 'Link failed — try again.');
      }
    } catch (e) {
      setLinkError(e?.message || 'Unexpected error linking moment.');
    }
    setLinkingMoment(false);
  }

  async function handleUnlinkMoment(momentId) {
    if (!caseId) return;
    try {
      await window.api.events.unlinkEvidence(caseId, momentId, doc.id);
      setLinkedMoments(prev => prev.filter(m => m.id !== momentId));
    } catch (e) {}
  }

  async function loadNotifications(docId) {
    try {
      const result = await window.api.notifications?.getForTarget('document', docId);
      if (result?.success && result.notifications) {
        setNotifiedActors(result.notifications);
      } else {
        setNotifiedActors([]);
      }
    } catch (e) {
      setNotifiedActors([]);
    }
  }

  async function loadAllActors() {
    const result = await window.api.actors.list();
    if (result.success) {
      setAllActors(result.actors);
    }
  }

  async function handleAddActorToDoc(actorId) {
    const result = await window.api.actors.addToDocument(actorId, doc.id);
    if (result.success) {
      await loadDocActors(doc.id);
      setShowActorPicker(false);
      setActorSearch('');
    }
  }

  async function handleRemoveActorFromDoc(actorId) {
    const result = await window.api.actors.removeFromDocument(actorId, doc.id);
    if (result.success) {
      await loadDocActors(doc.id);
    }
  }

  async function handleRename() {
    if (!editName.trim() || editName === displayDoc.filename) {
      setIsEditingName(false);
      return;
    }
    const result = await window.api.documents.rename(doc.id, editName.trim());
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, filename: editName.trim() } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
    setIsEditingName(false);
  }

  async function handleDateChange() {
    // Normalize to ISO timestamp (noon UTC) to avoid timezone display issues
    const isoDate = editDate ? new Date(editDate + 'T12:00:00Z').toISOString() : null;
    const confidence = isoDate ? 'exact' : 'undated';
    const result = await window.api.documents.updateDate(doc.id, isoDate, confidence);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, document_date: isoDate, document_date_confidence: confidence } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
      // Flash checkmark
      setDateSaveFlash(true);
      setTimeout(() => setDateSaveFlash(false), 1500);
    }
    setIsEditingDate(false);
  }

  async function handlePinDate(dateStr, label) {
    const isoDate = new Date(dateStr + 'T12:00:00Z').toISOString();
    const result = await window.api.documents.addDateEntry(doc.id, isoDate, label, 'exact');
    if (result.success) {
      loadDateEntries(doc.id);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleUnpinDate(entryId) {
    const result = await window.api.documents.removeDateEntry(entryId);
    if (result.success) {
      loadDateEntries(doc.id);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleAddDateEntry() {
    if (!newEntryDate) return;
    const isoDate = new Date(newEntryDate + 'T12:00:00Z').toISOString();
    const result = await window.api.documents.addDateEntry(doc.id, isoDate, newEntryLabel || null, 'exact');
    if (result.success) {
      loadDateEntries(doc.id);
      setAddingDateEntry(false);
      setNewEntryDate('');
      setNewEntryLabel('');
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleSetGroup(groupId) {
    const result = await window.api.documents.setGroup(doc.id, groupId);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, group_id: groupId } : prev);
      loadGroupMembers(groupId);
      setShowGroupPicker(false);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleRemoveGroup() {
    const result = await window.api.documents.removeGroup(doc.id);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, group_id: null } : prev);
      setGroupMembers([]);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    const result = await window.api.groups.create(newGroupName.trim());
    if (result.success) {
      await handleSetGroup(result.group.id);
      setCreatingGroup(false);
      setNewGroupName('');
    }
  }

  async function handleTypeChange(newType) {
    const result = await window.api.documents.updateType(doc.id, newType);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, evidence_type: newType } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleContextSave() {
    const result = await window.api.documents.updateContext(doc.id, editContext);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, user_context: editContext } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
    setIsEditingContext(false);
  }

  async function handlePreview() {
    if (previewData) {
      setShowPreview(true);
      return;
    }
    setPreviewError(null);
    try {
      const result = await window.api.documents.getContent(doc.id);
      if (result.success) {
        if (result.mimeType === 'application/pdf') {
          // Blob URLs don't render PDFs reliably in Electron iframes — use a real temp file instead
          const tmp = await window.api.documents.getTempPath(doc.id);
          if (!tmp.success) {
            setPreviewError(tmp.error || 'Could not create preview file.');
            return;
          }
          setPreviewData({ filePath: tmp.path, mimeType: result.mimeType });
        } else {
          setPreviewData({ data: result.data, mimeType: result.mimeType });
        }
        setShowPreview(true);
      } else {
        setPreviewError(result.error || 'Content not available for this file.');
      }
    } catch (err) {
      console.error('[DocumentPanel] preview error:', err);
      setPreviewError('Preview failed: ' + err.message);
    }
  }

  if (!doc) return null;

  const displayDoc = fullDoc || doc;
  const metadata = displayDoc.metadata_json ? safeParseJSON(displayDoc.metadata_json) : {};
  const contentDates = displayDoc.content_dates_json ? safeParseJSON(displayDoc.content_dates_json) : [];
  const isImage = displayDoc.file_type?.startsWith('image/');
  const isPdf = displayDoc.file_type === 'application/pdf';
  const canPreview = isImage || isPdf;

  return (
    <>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.panel} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerContent}>
              <div style={{
                ...styles.typeBadge,
                background: `${getEvidenceColor(displayDoc.evidence_type)}15`,
                color: getEvidenceColor(displayDoc.evidence_type)
              }}>
                {formatType(displayDoc.evidence_type)}
              </div>

              {/* Editable filename */}
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  style={styles.nameInput}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={styles.title}>{displayDoc.filename}</h2>
                  <button
                    onClick={() => { setEditName(displayDoc.filename); setIsEditingName(true); }}
                    title="Rename"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 15, color: colors.textMuted, padding: '2px 4px',
                      borderRadius: 4, flexShrink: 0
                    }}
                  >✏️</button>
                </div>
              )}
            </div>
            <button style={styles.closeButton} onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Prev/Next navigation */}
          {onNavigate && allDocs.length > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 16px', background: colors.bgSecondary, borderBottom: `1px solid ${colors.border}`,
              fontSize: '12px'
            }}>
              <button
                disabled={!prevDoc}
                onClick={() => prevDoc && onNavigate(prevDoc)}
                style={{
                  background: 'none', border: `1px solid ${prevDoc ? colors.border : 'transparent'}`,
                  borderRadius: '6px', padding: '4px 10px', cursor: prevDoc ? 'pointer' : 'default',
                  color: prevDoc ? colors.textPrimary : colors.textMuted, fontWeight: 600,
                  opacity: prevDoc ? 1 : 0.4
                }}
              >{'\u2190'} Prev</button>
              <span style={{ color: colors.textMuted }}>{currentDocIndex + 1} / {allDocs.length}</span>
              <button
                disabled={!nextDoc}
                onClick={() => nextDoc && onNavigate(nextDoc)}
                style={{
                  background: 'none', border: `1px solid ${nextDoc ? colors.border : 'transparent'}`,
                  borderRadius: '6px', padding: '4px 10px', cursor: nextDoc ? 'pointer' : 'default',
                  color: nextDoc ? colors.textPrimary : colors.textMuted, fontWeight: 600,
                  opacity: nextDoc ? 1 : 0.4
                }}
              >Next {'\u2192'}</button>
            </div>
          )}

          {/* Preview button */}
          {canPreview && (
            <div style={styles.previewButtonRow}>
              <button style={styles.previewButton} onClick={handlePreview}>
                {isImage ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCC4'} View {isImage ? 'Image' : 'PDF'}
              </button>
              {previewError && (
                <div style={{
                  marginTop: 8, fontSize: 12, color: colors.error || '#EF4444',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 6, padding: '6px 10px', lineHeight: 1.5
                }}>
                  ⚠ {previewError}
                </div>
              )}
            </div>
          )}

          {/* Evidence type selector */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Evidence Type</h3>
            <select
              style={styles.typeSelect}
              value={displayDoc.evidence_type || ''}
              onChange={e => handleTypeChange(e.target.value)}
            >
              <option value="">-- Select type --</option>
              {EVIDENCE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
              ))}
            </select>
          </div>

          {/* Primary date with editing */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Document Date</h3>
            {isEditingDate ? (
              <div style={styles.dateEditRow}>
                <input
                  type="date"
                  style={styles.dateInput}
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  autoFocus
                />
                <button style={styles.saveBtn} onClick={handleDateChange}>Save</button>
                <button style={styles.cancelBtn} onClick={() => setIsEditingDate(false)}>Cancel</button>
              </div>
            ) : (
              <div
                style={styles.primaryDate}
                onClick={() => {
                  setEditDate(displayDoc.document_date?.split('T')[0] || '');
                  setIsEditingDate(true);
                }}
                title="Click to edit date"
              >
                {displayDoc.document_date
                  ? formatDate(displayDoc.document_date)
                  : 'No date extracted'
                }
                {dateSaveFlash
                  ? <span style={styles.saveFlash}>{'\u2713'} Saved</span>
                  : <span style={styles.editHint}>{'\u270E'}</span>
                }
              </div>
            )}
            <div style={styles.confidenceRow}>
              <span style={styles.confidenceLabel}>Confidence:</span>
              <span style={{
                ...styles.confidenceBadge,
                background: getConfidenceColor(displayDoc.document_date_confidence)
              }}>
                {displayDoc.document_date_confidence || 'undated'}
              </span>
            </div>
          </div>

          {/* Document linking / groups */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              Linked Documents
              {groupMembers.length > 1 && <span style={styles.countBadge}>{groupMembers.length}</span>}
            </h3>
            {displayDoc.group_id ? (
              <>
                <div style={styles.groupHeader}>
                  <span style={styles.groupIcon}>{'\uD83D\uDCCE'}</span>
                  <span style={styles.groupName}>
                    {groups.find(g => g.id === displayDoc.group_id)?.name || 'Linked group'}
                  </span>
                  <button style={styles.unlinkBtn} onClick={handleRemoveGroup} title="Unlink from group">
                    Unlink
                  </button>
                </div>
                <div style={styles.memberList}>
                  {groupMembers.filter(m => m.id !== doc.id).map(member => (
                    <div key={member.id} style={styles.memberRow}>
                      <span style={styles.memberName}>{member.filename}</span>
                      <span style={styles.memberType}>{formatType(member.evidence_type)}</span>
                    </div>
                  ))}
                  {groupMembers.filter(m => m.id !== doc.id).length === 0 && (
                    <div style={styles.emptyHint}>No other documents in this group yet.</div>
                  )}
                </div>
              </>
            ) : showGroupPicker ? (
              <div style={styles.groupPicker}>
                {creatingGroup ? (
                  <div style={styles.addEntryRow}>
                    <input
                      style={styles.labelInput}
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="Group name"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                    />
                    <button style={styles.saveBtn} onClick={handleCreateGroup}>Create</button>
                    <button style={styles.cancelBtn} onClick={() => { setCreatingGroup(false); setNewGroupName(''); }}>✕</button>
                  </div>
                ) : (
                  <>
                    {groups.length > 0 && (
                      <div style={styles.datesList}>
                        {groups.map(g => (
                          <div
                            key={g.id}
                            style={styles.groupOption}
                            onClick={() => handleSetGroup(g.id)}
                          >
                            <span>{'\uD83D\uDCCE'} {g.name}</span>
                            <span style={styles.memberCount}>{g.member_count} doc{g.member_count !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      style={styles.addDateBtn}
                      onClick={() => setCreatingGroup(true)}
                    >
                      + Create new group
                    </button>
                    <button
                      style={{ ...styles.cancelBtn, width: '100%', marginTop: spacing.sm }}
                      onClick={() => setShowGroupPicker(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                style={styles.addDateBtn}
                onClick={() => { loadGroups(); setShowGroupPicker(true); }}
              >
                {'\uD83D\uDCCE'} Link to group
              </button>
            )}
          </div>

          {/* People in this document */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              People
              {docActors.length > 0 && <span style={styles.countBadge}>{docActors.length}</span>}
            </h3>
            {docActors.length > 0 && (
              <div style={styles.datesList}>
                {docActors.map(actor => (
                  <div key={actor.id} style={styles.actorRow}>
                    <span style={styles.actorInitials}>
                      {actor.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                    <span style={styles.memberName}>{actor.name}</span>
                    {actor.auto_detected === 1 && (
                      <span style={styles.autoTag}>auto</span>
                    )}
                    <button
                      style={styles.unpinBtn}
                      onClick={() => handleRemoveActorFromDoc(actor.id)}
                      title="Remove from document"
                    >
                      {'\u2715'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showActorPicker ? (
              <div style={{ marginTop: spacing.sm }}>
                <input
                  style={styles.labelInput}
                  value={actorSearch}
                  onChange={e => setActorSearch(e.target.value)}
                  placeholder="Search people..."
                  autoFocus
                />
                <div style={{ ...styles.datesList, marginTop: spacing.sm, maxHeight: '150px', overflowY: 'auto' }}>
                  {allActors
                    .filter(a => !docActors.some(da => da.id === a.id))
                    .filter(a => !actorSearch || a.name.toLowerCase().includes(actorSearch.toLowerCase()))
                    .slice(0, 10)
                    .map(actor => (
                      <div
                        key={actor.id}
                        style={styles.groupOption}
                        onClick={() => handleAddActorToDoc(actor.id)}
                      >
                        <span>{actor.name}</span>
                        {actor.classification && actor.classification !== 'unknown' && (
                          <span style={styles.memberType}>{actor.classification.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    ))}
                  {allActors.filter(a => !docActors.some(da => da.id === a.id)).length === 0 && (
                    <div style={styles.emptyHint}>No other people available. Add people from the People page first.</div>
                  )}
                </div>
                <button
                  style={{ ...styles.cancelBtn, width: '100%', marginTop: spacing.sm }}
                  onClick={() => { setShowActorPicker(false); setActorSearch(''); }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                style={styles.addDateBtn}
                onClick={() => { loadAllActors(); setShowActorPicker(true); }}
              >
                + Add person to document
              </button>
            )}
          </div>

          {/* Notifications */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              Notifications
              {notifiedActors.length > 0 && <span style={styles.countBadge}>{notifiedActors.length}</span>}
            </h3>
            {notifiedActors.length > 0 && (
              <NotifySummary
                actors={notifiedActors}
                onClick={() => setShowNotifyModal(true)}
              />
            )}
            <button
              style={styles.addDateBtn}
              onClick={() => setShowNotifyModal(true)}
            >
              {notifiedActors.length > 0 ? '\uD83D\uDD14 Edit Notifications' : '\uD83D\uDD14 Notify People'}
            </button>
          </div>

          {/* Linked Moments */}
          {caseId && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                Linked Moments
                {linkedMoments.length > 0 && <span style={styles.countBadge}>{linkedMoments.length}</span>}
              </h3>
              {linkedMoments.length > 0 && (
                <div style={styles.datesList}>
                  {linkedMoments.map(moment => (
                    <div key={moment.id} style={styles.actorRow}>
                      <span style={{ ...styles.memberName, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {moment.date && <span style={{ color: colors.textMuted, fontSize: '11px', marginRight: '6px' }}>{moment.date.slice(0, 10)}</span>}
                        {moment.title}
                      </span>
                      <button
                        style={styles.unpinBtn}
                        onClick={() => handleUnlinkMoment(moment.id)}
                        title="Unlink from moment"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              {showMomentPicker ? (
                <div style={{ marginTop: spacing.sm }}>
                  <select
                    value={selectedMomentId}
                    onChange={e => setSelectedMomentId(e.target.value)}
                    style={styles.typeSelect}
                  >
                    <option value=''>— select a moment to link —</option>
                    {allMoments
                      .filter(m => !linkedMoments.some(lm => lm.id === m.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.date ? m.date.slice(0, 10) + ' — ' : ''}{m.title}
                        </option>
                      ))}
                  </select>
                  <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
                    <button
                      style={{ ...styles.saveBtn, flex: 1 }}
                      onClick={handleLinkMoment}
                      disabled={!selectedMomentId || linkingMoment}
                    >
                      {linkingMoment ? 'Linking...' : 'Link'}
                    </button>
                    <button
                      style={styles.cancelBtn}
                      onClick={() => { setShowMomentPicker(false); setSelectedMomentId(''); setLinkError(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {linkError && (
                    <p style={{ color: '#DC2626', fontSize: '12px', marginTop: spacing.xs }}>
                      ⚠ {linkError}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  style={styles.addDateBtn}
                  onClick={() => { loadAllMoments(); setShowMomentPicker(true); }}
                >
                  + Link to moment
                </button>
              )}
            </div>
          )}

          {/* Extracted text */}
          {displayDoc.extracted_text && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Extracted Text</h3>
              <div style={styles.textBox}>
                {displayDoc.extracted_text.slice(0, 800)}
                {displayDoc.extracted_text.length > 800 && (
                  <span style={styles.truncated}>... (truncated)</span>
                )}
              </div>
            </div>
          )}

          {/* User context / notes (editable) */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Your Notes</h3>
            {isEditingContext ? (
              <div style={styles.contextEditArea}>
                <textarea
                  style={styles.contextTextarea}
                  value={editContext}
                  onChange={e => setEditContext(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Add your notes about this document..."
                />
                <div style={styles.contextButtons}>
                  <button style={styles.saveBtn} onClick={handleContextSave}>Save</button>
                  <button style={styles.cancelBtn} onClick={() => setIsEditingContext(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                style={styles.textBox}
                onClick={() => {
                  setEditContext(displayDoc.user_context || '');
                  setIsEditingContext(true);
                }}
                title="Click to edit notes"
              >
                {displayDoc.user_context || (
                  <span style={styles.placeholder}>Click to add notes...</span>
                )}
                <span style={styles.editHintInline}>{'\u270E'}</span>
              </div>
            )}
          </div>

          {/* Delete document */}
          <div style={styles.dangerSection}>
            <button
              style={styles.deleteButton}
              onClick={async () => {
                if (confirm(`Delete "${displayDoc.filename}"?\n\nThis cannot be undone.`)) {
                  const result = await window.api.documents.delete(displayDoc.id);
                  if (result.success) {
                    onDocumentUpdated?.();
                    onClose();
                  } else {
                    alert('Error deleting document: ' + (result.error || 'Unknown error'));
                  }
                }
              }}
            >
              {'\uD83D\uDDD1\uFE0F'} Delete Document
            </button>
            <button
              style={{ ...styles.deleteButton, border: `1px solid ${colors.border}`, color: colors.textSecondary, marginTop: spacing.sm }}
              onClick={async () => {
                const result = await window.api.documents.copy(displayDoc.id);
                if (result.success) {
                  onDocumentUpdated?.();
                  alert(`Created copy: ${result.document.filename}`);
                } else {
                  alert('Error copying document: ' + (result.error || 'Unknown error'));
                }
              }}
            >
              {'\u{1F4CB}'} Copy Document
            </button>
          </div>
        </div>
      </div>

      {/* Notify modal */}
      {showNotifyModal && (
        <NotifyModal
          targetType="document"
          targetId={doc.id}
          onClose={() => setShowNotifyModal(false)}
          onNotified={(actors) => {
            setNotifiedActors(actors);
            setShowNotifyModal(false);
          }}
        />
      )}

      {/* Full-screen preview overlay */}
      {showPreview && previewData && (
        <div style={styles.previewOverlay} onClick={() => setShowPreview(false)}>
          <div style={styles.previewContainer} onClick={e => e.stopPropagation()}>
            <div style={styles.previewHeader}>
              <span style={styles.previewTitle}>{displayDoc.filename}</span>
              <button style={styles.previewClose} onClick={() => setShowPreview(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div style={styles.previewBody}>
              {isImage ? (
                <img
                  src={`data:${previewData.mimeType};base64,${previewData.data}`}
                  alt={displayDoc.filename}
                  style={styles.previewImage}
                />
              ) : isPdf ? (
                <iframe
                  src={`file://${previewData.filePath}`}
                  style={styles.previewPdf}
                  title={displayDoc.filename}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaRow({ label, value, mono, styles }) {
  return (
    <div style={styles.metaRow}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={{
        ...styles.metaValue,
        ...(mono ? { fontFamily: typography.fontFamilyMono } : {})
      }}>{value}</span>
    </div>
  );
}

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function formatType(type) {
  const labels = {
    'ADVERSE_ACTION': 'Adverse Action',
    'INCIDENT': 'Incident',
    'PROTECTED_ACTIVITY': 'Protected Activity',
    'REQUEST_FOR_HELP': 'Request',
    'RESPONSE': 'Response',
    'CLAIM_AGAINST_YOU': 'Their Claim',
    'CLAIM_YOU_MADE': 'Your Claim',
    'PAY_RECORD': 'Pay Record',
    'CONTEXT': 'Context',
    'SUPPORTING': 'Supporting'
  };
  return labels[type] || type?.replace(/_/g, ' ') || 'Document';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getConfidenceColor(confidence) {
  const map = {
    'exact': colors.confidenceExact,
    'approximate': colors.confidenceApprox,
    'inferred': colors.confidenceInferred,
    'undated': colors.confidenceUndated
  };
  return map[confidence] || colors.confidenceUndated;
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.3)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 1000,
      animation: 'fadeIn 0.15s ease'
    },
    panel: {
      width: '420px',
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
    headerContent: {
      flex: 1,
      marginRight: spacing.md
    },
    typeBadge: {
      display: 'inline-block',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.sm,
      marginBottom: spacing.sm
    },
    title: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
      wordBreak: 'break-word',
      lineHeight: typography.lineHeight.tight,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'baseline',
      gap: spacing.sm
    },
    editHint: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      opacity: 0.5,
      flexShrink: 0
    },
    editHintInline: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      opacity: 0.4,
      marginLeft: spacing.sm
    },
    nameInput: {
      width: '100%',
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      background: colors.surface,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.sm,
      padding: `${spacing.xs} ${spacing.sm}`,
      outline: 'none',
      fontFamily: 'inherit'
    },
    closeButton: {
      background: 'none',
      border: 'none',
      color: colors.textMuted,
      cursor: 'pointer',
      padding: spacing.xs,
      borderRadius: radius.sm,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'color 0.15s ease'
    },

    // Preview button
    previewButtonRow: {
      padding: `${spacing.sm} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`
    },
    previewButton: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      color: colors.primary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },

    // Evidence type select
    typeSelect: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      color: colors.textPrimary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      outline: 'none',
      fontFamily: 'inherit'
    },

    recapToggle: {
      display: 'flex',
      alignItems: 'center',
      cursor: 'pointer',
      padding: `${spacing.sm} 0`
    },
    recapLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary
    },

    // Date editing
    dateEditRow: {
      display: 'flex',
      gap: spacing.sm,
      alignItems: 'center',
      marginBottom: spacing.sm
    },
    dateInput: {
      flex: 1,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      color: colors.textPrimary,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      outline: 'none',
      fontFamily: 'inherit'
    },
    saveBtn: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    cancelBtn: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      color: colors.textMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer'
    },

    // Context editing
    contextEditArea: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    contextTextarea: {
      width: '100%',
      padding: spacing.md,
      background: colors.surface,
      color: colors.textPrimary,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      lineHeight: typography.lineHeight.relaxed,
      outline: 'none',
      fontFamily: 'inherit',
      resize: 'vertical',
      minHeight: '80px',
      boxSizing: 'border-box'
    },
    contextButtons: {
      display: 'flex',
      gap: spacing.sm
    },
    placeholder: {
      color: colors.textMuted,
      fontStyle: 'italic'
    },

    // Sections
    section: {
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`
    },
    sectionTitle: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: `0 0 ${spacing.md} 0`,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm
    },
    countBadge: {
      background: colors.surfaceAlt,
      color: colors.textSecondary,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.normal
    },

    // Primary date
    primaryDate: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'baseline',
      gap: spacing.sm
    },
    confidenceRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm
    },
    confidenceLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    confidenceBadge: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      textTransform: 'capitalize'
    },

    // Dates list
    datesList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    dateRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    dateText: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginRight: spacing.md
    },
    dateValue: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamilyMono,
      color: colors.textPrimary,
      whiteSpace: 'nowrap'
    },
    moreText: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      textAlign: 'center',
      padding: spacing.sm
    },

    // Pin buttons
    pinBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.sm,
      flexShrink: 0,
      transition: 'opacity 0.15s ease'
    },
    unpinBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      padding: `2px ${spacing.xs}`,
      flexShrink: 0
    },
    addDateBtn: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      color: colors.primary,
      border: `1px dashed ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      marginTop: spacing.sm,
      transition: 'background 0.15s ease'
    },
    addEntryRow: {
      display: 'flex',
      gap: spacing.sm,
      alignItems: 'center',
      marginTop: spacing.sm
    },
    labelInput: {
      flex: 1,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      color: colors.textPrimary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      outline: 'none',
      fontFamily: 'inherit'
    },
    emptyHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
      padding: `${spacing.sm} 0`
    },
    saveFlash: {
      fontSize: typography.fontSize.xs,
      color: '#22c55e',
      fontWeight: typography.fontWeight.semibold,
      flexShrink: 0,
      animation: 'fadeIn 0.2s ease'
    },

    // Group / linking styles
    groupHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      marginBottom: spacing.sm
    },
    groupIcon: {
      fontSize: typography.fontSize.md
    },
    groupName: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      flex: 1
    },
    unlinkBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      color: colors.textMuted,
      fontSize: typography.fontSize.xs,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      cursor: 'pointer'
    },
    memberList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs
    },
    memberRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.xs} ${spacing.sm}`,
      background: colors.surfaceAlt,
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm
    },
    memberName: {
      color: colors.textPrimary,
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginRight: spacing.sm
    },
    memberType: {
      color: colors.textMuted,
      fontSize: typography.fontSize.xs,
      flexShrink: 0
    },
    groupPicker: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    groupOption: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      transition: 'background 0.15s ease'
    },
    memberCount: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },

    // Actor rows
    actorRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    actorInitials: {
      width: '28px',
      height: '28px',
      borderRadius: radius.full,
      background: `${colors.primary}15`,
      color: colors.primary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      flexShrink: 0
    },
    autoTag: {
      fontSize: '10px',
      color: colors.textMuted,
      background: colors.surface,
      padding: `1px ${spacing.xs}`,
      borderRadius: radius.sm,
      flexShrink: 0
    },

    // Meta grid
    metaGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    metaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    metaLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    metaValue: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      textAlign: 'right',
      maxWidth: '60%',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    // Text box
    textBox: {
      background: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      lineHeight: typography.lineHeight.relaxed,
      maxHeight: '250px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      cursor: 'pointer',
      position: 'relative'
    },
    truncated: {
      color: colors.textMuted,
      fontStyle: 'italic'
    },

    // Delete
    dangerSection: {
      padding: `${spacing.lg} ${spacing.lg} ${spacing.xl}`,
      borderTop: `1px solid ${colors.border}`
    },
    deleteButton: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      border: `1px solid #7F1D1D`,
      borderRadius: radius.md,
      color: '#DC2626',
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },

    // Preview overlay
    previewOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.15s ease'
    },
    previewContainer: {
      width: '90vw',
      height: '90vh',
      display: 'flex',
      flexDirection: 'column',
      background: colors.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      boxShadow: shadows.xl
    },
    previewHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.md} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    previewTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    previewClose: {
      background: 'none',
      border: 'none',
      color: colors.textMuted,
      cursor: 'pointer',
      padding: spacing.xs,
      borderRadius: radius.sm,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    previewBody: {
      flex: 1,
      overflow: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.bg,
      padding: spacing.lg
    },
    previewImage: {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      borderRadius: radius.md,
      boxShadow: shadows.lg
    },
    previewPdf: {
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: radius.md
    },
    previewFallback: {
      color: colors.textMuted,
      fontSize: typography.fontSize.base,
      textAlign: 'center'
    }
  };
}

// Add animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
`;
document.head.appendChild(styleSheet);
