import React, { useState } from 'react';
import { colors, spacing, radius, shadows } from '../styles/tokens';

const RELEVANCE_OPTIONS = [
  { value: 'supports_me', label: 'Supports Me', color: '#16A34A', bg: '#F0FDF4' },
  { value: 'against_me', label: 'Against Me', color: '#DC2626', bg: '#FEF2F2' },
  { value: 'timing', label: 'Timing Evidence', color: '#2563EB', bg: '#EFF6FF' },
  { value: 'context', label: 'Context', color: '#6B7280', bg: '#F9FAFB' }
];

const TIMING_OPTIONS = [
  { value: 'before', label: 'Before Event', color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'same_day', label: 'Same Day', color: '#D97706', bg: '#FFFBEB' },
  { value: 'after', label: 'After Event', color: '#0D9488', bg: '#F0FDFA' }
];

export default function DocumentLinkModal({ document, eventTitle, onSave, onCancel }) {
  const [relevance, setRelevance] = useState(['context']);
  const [timing, setTiming] = useState([]);

  function toggleValue(arr, setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  }

  function handleSave() {
    onSave({
      relevanceV2: JSON.stringify(relevance),
      timingRelation: JSON.stringify(timing)
    });
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Link Document to Event</h3>
          <button style={styles.closeBtn} onClick={onCancel}>{'\u00D7'}</button>
        </div>

        <div style={styles.body}>
          <div style={styles.docName}>
            {'\u{1F4CE}'} {document?.filename || 'Document'}
          </div>
          <div style={styles.eventRef}>
            {'\u{1F4CC}'} {eventTitle || 'Event'}
          </div>

          <div style={styles.section}>
            <label style={styles.sectionLabel}>Relevance (select all that apply)</label>
            <div style={styles.checkboxGrid}>
              {RELEVANCE_OPTIONS.map(opt => {
                const checked = relevance.includes(opt.value);
                return (
                  <label key={opt.value} style={{
                    ...styles.checkboxLabel,
                    background: checked ? opt.bg : '#FFFFFF',
                    borderColor: checked ? opt.color : colors.border
                  }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleValue(relevance, setRelevance, opt.value)}
                      style={{ display: 'none' }} />
                    <span style={{
                      ...styles.checkboxDot,
                      background: checked ? opt.color : '#D1D5DB',
                      boxShadow: checked ? `0 0 0 2px ${opt.color}33` : 'none'
                    }} />
                    <span style={{ color: checked ? opt.color : colors.textSecondary, fontWeight: checked ? 600 : 400 }}>
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={styles.section}>
            <label style={styles.sectionLabel}>Timing Relation (select all that apply)</label>
            <div style={styles.checkboxGrid}>
              {TIMING_OPTIONS.map(opt => {
                const checked = timing.includes(opt.value);
                return (
                  <label key={opt.value} style={{
                    ...styles.checkboxLabel,
                    background: checked ? opt.bg : '#FFFFFF',
                    borderColor: checked ? opt.color : colors.border
                  }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleValue(timing, setTiming, opt.value)}
                      style={{ display: 'none' }} />
                    <span style={{
                      ...styles.checkboxDot,
                      background: checked ? opt.color : '#D1D5DB',
                      boxShadow: checked ? `0 0 0 2px ${opt.color}33` : 'none'
                    }} />
                    <span style={{ color: checked ? opt.color : colors.textSecondary, fontWeight: checked ? 600 : 400 }}>
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSave}
            disabled={relevance.length === 0}>
            Link Document
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 100
  },
  modal: {
    background: '#FFFFFF', borderRadius: radius.lg,
    width: '440px', maxHeight: '80vh', overflow: 'hidden',
    boxShadow: shadows.xl, display: 'flex', flexDirection: 'column'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${spacing.md} ${spacing.lg}`,
    borderBottom: `1px solid ${colors.border}`
  },
  title: {
    fontSize: '16px', fontWeight: 600, color: colors.textPrimary, margin: 0
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '20px',
    color: colors.textMuted, cursor: 'pointer', padding: '4px'
  },
  body: {
    padding: spacing.lg, overflowY: 'auto'
  },
  docName: {
    fontSize: '13px', fontWeight: 500, color: colors.textPrimary,
    padding: `${spacing.sm} ${spacing.md}`,
    background: '#F9FAFB', borderRadius: radius.md,
    marginBottom: spacing.sm, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  eventRef: {
    fontSize: '12px', color: colors.textSecondary,
    padding: `${spacing.xs} ${spacing.md}`,
    marginBottom: spacing.lg
  },
  section: {
    marginBottom: spacing.lg
  },
  sectionLabel: {
    fontSize: '12px', fontWeight: 600, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: spacing.sm, display: 'block'
  },
  checkboxGrid: {
    display: 'flex', flexDirection: 'column', gap: spacing.xs
  },
  checkboxLabel: {
    display: 'flex', alignItems: 'center', gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    border: '1.5px solid', borderRadius: radius.md,
    cursor: 'pointer', transition: 'all 0.15s ease',
    fontSize: '13px'
  },
  checkboxDot: {
    width: '10px', height: '10px', borderRadius: '50%',
    flexShrink: 0, transition: 'all 0.15s ease'
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: spacing.sm,
    padding: `${spacing.md} ${spacing.lg}`,
    borderTop: `1px solid ${colors.border}`
  },
  cancelBtn: {
    padding: `${spacing.sm} ${spacing.lg}`,
    background: 'transparent', border: `1px solid ${colors.border}`,
    borderRadius: radius.md, fontSize: '13px',
    color: colors.textSecondary, cursor: 'pointer'
  },
  saveBtn: {
    padding: `${spacing.sm} ${spacing.lg}`,
    background: colors.primary, border: 'none',
    borderRadius: radius.md, fontSize: '13px', fontWeight: 600,
    color: '#FFFFFF', cursor: 'pointer',
    transition: 'background 0.15s ease'
  }
};
