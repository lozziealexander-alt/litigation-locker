import React, { useState, useEffect } from 'react';

const OUTCOME_OPTIONS = [
  { value: 'forced_out', label: 'Forced Out / Fired' },
  { value: 'resigned_under_pressure', label: 'Resigned Under Pressure' },
  { value: 'demoted', label: 'Demoted' },
  { value: 'underpaid', label: 'Underpaid vs Peers' },
  { value: 'passed_over', label: 'Passed Over for Promotion' },
  { value: 'pip', label: 'Put on PIP' },
  { value: 'excluded', label: 'Excluded from Opportunities' }
];

export default function ComparatorFormModal({ comparator, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    gender: '',
    race: '',
    outcome: 'forced_out',
    outcome_date: '',
    circumstances: '',
    evidence_similarity: '',
    relevance_score: 0.5,
    notes: ''
  });

  useEffect(() => {
    if (comparator) {
      setFormData({
        name: comparator.name || '',
        role: comparator.role || '',
        gender: comparator.gender || '',
        race: comparator.race || '',
        outcome: comparator.outcome || 'forced_out',
        outcome_date: comparator.outcome_date || '',
        circumstances: comparator.circumstances || '',
        evidence_similarity: comparator.evidence_similarity || '',
        relevance_score: comparator.relevance_score != null ? comparator.relevance_score : 0.5,
        notes: comparator.notes || ''
      });
    }
  }, [comparator]);

  function set(field, val) {
    setFormData(prev => ({ ...prev, [field]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSave(formData);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{comparator ? 'Edit Comparator' : 'Add Comparator'}</h3>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Name *</label>
            <input
              required
              type="text"
              value={formData.name}
              onChange={e => set('name', e.target.value)}
              placeholder="First name or full name"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Role / Title</label>
            <input
              type="text"
              value={formData.role}
              onChange={e => set('role', e.target.value)}
              placeholder="e.g. Senior Engineer"
              style={styles.input}
            />
          </div>

          <div style={styles.twoCol}>
            <div style={styles.field}>
              <label style={styles.label}>Gender</label>
              <select value={formData.gender} onChange={e => set('gender', e.target.value)} style={styles.select}>
                <option value="">—</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Race / Ethnicity</label>
              <input
                type="text"
                value={formData.race}
                onChange={e => set('race', e.target.value)}
                placeholder="Optional"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.twoCol}>
            <div style={styles.field}>
              <label style={styles.label}>Outcome *</label>
              <select required value={formData.outcome} onChange={e => set('outcome', e.target.value)} style={styles.select}>
                {OUTCOME_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Outcome Date</label>
              <input
                type="date"
                value={formData.outcome_date}
                onChange={e => set('outcome_date', e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Circumstances</label>
            <textarea
              value={formData.circumstances}
              onChange={e => set('circumstances', e.target.value)}
              placeholder="What happened to them (similar to your situation)"
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>How Their Case Resembles Yours</label>
            <textarea
              value={formData.evidence_similarity}
              onChange={e => set('evidence_similarity', e.target.value)}
              placeholder="e.g. Also reported harassment, also excluded from meetings after complaint"
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Similarity Score: <strong>{Number(formData.relevance_score).toFixed(1)}</strong>
              <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: '8px', fontSize: '11px' }}>
                (0 = different, 1 = nearly identical)
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.relevance_score}
              onChange={e => set('relevance_score', parseFloat(e.target.value))}
              style={{ width: '100%', marginTop: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9CA3AF' }}>
              <span>Different</span><span>Identical</span>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any additional details"
              style={styles.textarea}
              rows={2}
            />
          </div>

          <div style={styles.footer}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>Save Comparator</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200
  },
  modal: {
    background: '#fff', borderRadius: '12px',
    width: '580px', maxWidth: '92vw', maxHeight: '88vh',
    overflow: 'auto', display: 'flex', flexDirection: 'column'
  },
  header: {
    padding: '20px 24px', borderBottom: '1px solid #E5E7EB',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 600 },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6B7280' },
  form: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#374151' },
  input: {
    padding: '9px 12px', fontSize: '14px',
    border: '1px solid #D1D5DB', borderRadius: '6px', boxSizing: 'border-box', width: '100%'
  },
  select: {
    padding: '9px 12px', fontSize: '14px',
    border: '1px solid #D1D5DB', borderRadius: '6px', boxSizing: 'border-box', width: '100%',
    background: '#fff'
  },
  textarea: {
    padding: '9px 12px', fontSize: '14px',
    border: '1px solid #D1D5DB', borderRadius: '6px', resize: 'vertical',
    boxSizing: 'border-box', width: '100%', fontFamily: 'inherit'
  },
  footer: { display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' },
  cancelBtn: {
    padding: '10px 20px', border: '1px solid #D1D5DB', borderRadius: '6px',
    background: '#fff', cursor: 'pointer', fontSize: '14px'
  },
  saveBtn: {
    padding: '10px 20px', border: 'none', borderRadius: '6px',
    background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600
  }
};
