import React, { useState, useEffect } from 'react';

const TAG_OPTIONS = [
  'protected_activity',
  'adverse_action',
  'sexual_harassment',
  'gender_harassment',
  'retaliation',
  'exclusion',
  'pay_discrimination',
  'hostile_environment',
  'help_request',
  'context'
];

const DATE_CONFIDENCE_OPTIONS = [
  { value: 'exact', label: 'Exact (specific day)' },
  { value: 'week', label: 'Week (approximate week)' },
  { value: 'month', label: 'Month (approximate month)' },
  { value: 'quarter', label: 'Quarter (Q1, Q2, Q3, Q4)' }
];

export default function EditMomentModal({ caseId, momentId, onClose, onSave }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [dateConfidence, setDateConfidence] = useState('exact');
  const [tags, setTags] = useState([]);
  const [isContextEvent, setIsContextEvent] = useState(false);
  const [contextScope, setContextScope] = useState('company-wide');

  // Document linking
  const [linkedDocs, setLinkedDocs] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');

  useEffect(() => {
    loadMoment();
    loadAllDocs();
  }, [momentId]);

  async function loadMoment() {
    if (!momentId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const result = await window.api.events.get(caseId, momentId);

      if (result.success && result.event) {
        setTitle(result.event.title || '');
        setDescription(result.event.description || '');
        setDate(result.event.date || '');
        setDateConfidence(result.event.date_confidence || 'exact');
        setIsContextEvent(!!result.event.is_context_event);
        setContextScope(result.event.context_scope || 'company-wide');

        const tagsResult = await window.api.events.getTags(caseId, momentId);
        if (tagsResult.success) {
          setTags(tagsResult.tags || []);
        }

        const docsResult = await window.api.events.getLinkedDocuments(caseId, momentId);
        if (docsResult.success) {
          setLinkedDocs(docsResult.documents || []);
        }
      } else {
        setError('Failed to load moment');
      }
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }

  async function loadAllDocs() {
    try {
      const res = await window.api.documents.list();
      if (res.success) setAllDocs(res.documents || []);
    } catch (e) {}
  }

  async function handleLinkDoc() {
    if (!selectedDocId) return;
    setLinkingDoc(true);
    try {
      await window.api.events.linkEvidence(caseId, momentId, selectedDocId);
      const docsResult = await window.api.events.getLinkedDocuments(caseId, momentId);
      if (docsResult.success) setLinkedDocs(docsResult.documents || []);
      setSelectedDocId('');
    } catch (e) {}
    setLinkingDoc(false);
  }

  async function handleUnlinkDoc(docId) {
    try {
      await window.api.events.unlinkEvidence(caseId, momentId, docId);
      setLinkedDocs(prev => prev.filter(d => d.id !== docId));
    } catch (e) {}
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const momentData = {
        title: title.trim(),
        description: description.trim(),
        date,
        date_confidence: dateConfidence
      };

      let result;
      if (momentId) {
        result = await window.api.events.update(caseId, momentId, momentData);
      } else {
        result = await window.api.events.create(caseId, momentData);
      }

      if (result.success) {
        const savedId = momentId || result.id;
        await window.api.events.updateTags(caseId, savedId, tags);
        await window.api.events.updateContextStatus(caseId, savedId, isContextEvent, contextScope);
        onSave?.();
        onClose();
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message);
    }

    setSaving(false);
  }

  function toggleTag(tag) {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag));
    } else {
      setTags([...tags, tag]);
    }
  }

  if (loading) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {momentId ? '✏️ Edit Moment' : '+ Add Moment'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.content}>
          <div style={styles.field}>
            <label style={styles.label}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What happened?"
              style={styles.input}
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Date Confidence</label>
            <select
              value={dateConfidence}
              onChange={(e) => setDateConfidence(e.target.value)}
              style={styles.select}
            >
              {DATE_CONFIDENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details..."
              style={styles.textarea}
              rows={4}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tags</label>
            <div style={styles.tagGrid}>
              {TAG_OPTIONS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  style={{
                    ...styles.tagBtn,
                    ...(tags.includes(tag) ? styles.tagBtnActive : {})
                  }}
                >
                  {tags.includes(tag) ? '✓ ' : ''}{tag.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Document Linking — only for existing moments */}
          {momentId && (
            <div style={styles.field}>
              <label style={styles.label}>Linked Documents</label>

              {linkedDocs.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '0 0 10px 0' }}>No documents linked yet</p>
              ) : (
                <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {linkedDocs.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#F3F4F6', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.filename || doc.title || doc.id}
                        {doc.evidence_type && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6B7280', background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>{doc.evidence_type}</span>}
                      </span>
                      <button onClick={() => handleUnlinkDoc(doc.id)} style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px', background: 'white', cursor: 'pointer', color: '#DC2626', flexShrink: 0 }}>
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={selectedDocId}
                  onChange={e => setSelectedDocId(e.target.value)}
                  style={{ ...styles.select, flex: 1 }}
                >
                  <option value=''>— select a document to link —</option>
                  {allDocs
                    .filter(d => !linkedDocs.some(ld => ld.id === d.id))
                    .map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.filename || doc.title || doc.id}{doc.evidence_type ? ` [${doc.evidence_type}]` : ''}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleLinkDoc}
                  disabled={!selectedDocId || linkingDoc}
                  style={{ padding: '10px 16px', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '6px', cursor: selectedDocId ? 'pointer' : 'not-allowed', opacity: selectedDocId ? 1 : 0.5, fontSize: '13px', flexShrink: 0 }}
                >
                  Link
                </button>
              </div>
            </div>
          )}

          <div style={{ ...styles.field, background: isContextEvent ? '#F9FAFB' : 'transparent', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={isContextEvent}
                onChange={e => setIsContextEvent(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Mark as Context Event</span>
            </label>
            <p style={{ margin: '6px 0 0 24px', fontSize: '12px', color: '#6B7280' }}>
              Background context (VRP, layoffs, policy changes) — excluded from claim strength
            </p>
            {isContextEvent && (
              <select
                value={contextScope}
                onChange={e => setContextScope(e.target.value)}
                style={{ ...styles.select, marginTop: '10px', marginLeft: '24px', width: 'calc(100% - 24px)' }}
              >
                <option value="company-wide">Company-wide</option>
                <option value="department">Department-specific</option>
                <option value="industry">Industry-wide</option>
              </select>
            )}
          </div>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid #E5E7EB',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#6B7280',
    lineHeight: 1
  },
  error: {
    padding: '12px 24px',
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    fontSize: '14px'
  },
  content: {
    padding: '24px'
  },
  field: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    resize: 'vertical',
    boxSizing: 'border-box'
  },
  tagGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '8px'
  },
  tagBtn: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    textTransform: 'capitalize'
  },
  tagBtnActive: {
    backgroundColor: '#8B5CF6',
    color: 'white',
    borderColor: '#8B5CF6'
  },
  footer: {
    padding: '24px',
    borderTop: '1px solid #E5E7EB',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  cancelBtn: {
    padding: '10px 20px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#8B5CF6',
    color: 'white',
    cursor: 'pointer'
  },
  loading: {
    padding: '60px',
    textAlign: 'center',
    color: '#6B7280'
  }
};
