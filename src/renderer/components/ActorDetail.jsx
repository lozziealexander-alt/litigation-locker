import React, { useState, useEffect } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

const CLASSIFICATIONS = [
  { value: 'bad_actor', label: 'Bad Actor', color: '#DC2626' },
  { value: 'enabler', label: 'Enabler', color: '#F97316' },
  { value: 'witness_supportive', label: 'Supportive Witness', color: '#16A34A' },
  { value: 'witness_neutral', label: 'Neutral Witness', color: '#6B7280' },
  { value: 'witness_hostile', label: 'Hostile Witness', color: '#DC2626' },
  { value: 'bystander', label: 'Bystander', color: '#9CA3AF' },
  { value: 'corroborator', label: 'Corroborator', color: '#16A34A' },
  { value: 'self', label: 'This is Me', color: '#2563EB' }
];

const RELATIONSHIPS = [
  { value: '', label: 'Select...' },
  { value: 'supervisor', label: 'My Supervisor/Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'executive', label: 'Executive' },
  { value: 'peer', label: 'Peer/Colleague' },
  { value: 'direct_report', label: 'My Direct Report' },
  { value: 'other', label: 'Other' }
];

const GENDERS = [
  { value: '', label: 'Not set' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' }
];

const DISABILITY_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' }
];

const WOULD_HELP_OPTIONS = [
  { value: 'likely_helpful', label: 'Likely Helpful', color: '#16A34A' },
  { value: 'uncertain', label: 'Uncertain', color: '#F97316' },
  { value: 'likely_hostile', label: 'Likely Hostile', color: '#DC2626' },
  { value: 'unknown', label: 'Unknown', color: '#6B7280' }
];

export default function ActorDetail({ actor, onClose, onActorUpdated }) {
  const [editedActor, setEditedActor] = useState({ ...actor });
  const [allActors, setAllActors] = useState([]);
  const [appearances, setAppearances] = useState([]);
  const [payRecords, setPayRecords] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ period: '', baseSalary: '', recordDate: '' });
  const [dirty, setDirty] = useState(false);

  const styles = getStyles();

  useEffect(() => {
    loadDetails();
  }, [actor.id]);

  async function loadDetails() {
    try {
      const [actorsResult, appearResult, payResult] = await Promise.all([
        window.api.actors.list(),
        window.api.actors.getAppearances(actor.id),
        window.api.payRecords?.getForActor(actor.id).catch(() => ({ success: false }))
          || Promise.resolve({ success: false })
      ]);

      if (actorsResult.success) setAllActors(actorsResult.actors.filter(a => a.id !== actor.id));
      if (appearResult.success) setAppearances(appearResult.appearances);
      if (payResult?.success) setPayRecords(payResult.records || []);
    } catch (err) {
      console.error('[ActorDetail] loadDetails error:', err);
    }
  }

  function handleChange(field, value) {
    setEditedActor(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    const updates = {
      name: editedActor.name,
      role: editedActor.role,
      title: editedActor.title,
      department: editedActor.department,
      classification: editedActor.classification,
      wouldTheyHelp: editedActor.would_they_help,
      relationship: editedActor.relationship_to_self,
      reportsTo: editedActor.reports_to,
      gender: editedActor.gender,
      disabilityStatus: editedActor.disability_status,
      startDate: editedActor.start_date,
      endDate: editedActor.end_date
    };

    try {
      const result = await window.api.actors.update(actor.id, updates);
      console.log('[ActorDetail] save result:', result);
      if (result.success) {
        setDirty(false);
        onActorUpdated();
      } else {
        console.error('[ActorDetail] save failed:', result);
        alert('Failed to save: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[ActorDetail] save error:', err);
      alert('Error saving: ' + err.message);
    }
  }

  async function handleSetSelf() {
    const result = await window.api.actors.setSelf(actor.id);
    if (result.success) {
      handleChange('classification', 'self');
      handleChange('is_self', 1);
      setDirty(false);
    }
  }

  async function handleDelete() {
    const result = await window.api.actors.delete(actor.id);
    if (result.success) {
      onActorUpdated();
    }
  }

  async function handleUploadPay() {
    const dialogResult = await window.api.dialog.openFiles();
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) return;

    // Ingest file as document
    const ingestResult = await window.api.documents.ingest(dialogResult.filePaths);
    if (!ingestResult.success || ingestResult.documents.length === 0) return;

    const doc = ingestResult.documents[0];

    // Create pay record linked to this actor and document
    const payResult = await window.api.payRecords.create({
      actorId: actor.id,
      documentId: doc.id,
      recordDate: payForm.recordDate || new Date().toISOString().split('T')[0],
      period: payForm.period || null,
      baseSalary: payForm.baseSalary ? parseFloat(payForm.baseSalary) : null
    });

    if (payResult.success) {
      setShowPayForm(false);
      setPayForm({ period: '', baseSalary: '', recordDate: '' });
      await loadDetails();
    }
  }

  async function handleDeletePayRecord(recordId) {
    const result = await window.api.payRecords.delete(recordId);
    if (result.success) {
      await loadDetails();
    }
  }

  const classColor = CLASSIFICATIONS.find(c => c.value === editedActor.classification)?.color || '#6B7280';
  const directReports = allActors.filter(a => a.reports_to === actor.id);

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <button style={styles.closeBtn} onClick={onClose}>{'\u2715'}</button>
            {dirty && (
              <button style={styles.saveBtn} onClick={handleSave}>Save Changes</button>
            )}
          </div>

          {/* Name */}
          <input
            type="text"
            value={editedActor.name || ''}
            onChange={e => handleChange('name', e.target.value)}
            style={styles.nameInput}
            placeholder="Full name"
          />

          {/* Classification tag */}
          <div style={{ ...styles.classTag, background: `${classColor}15`, color: classColor }}>
            {CLASSIFICATIONS.find(c => c.value === editedActor.classification)?.label || 'Unknown'}
          </div>
        </div>

        <div style={styles.body}>
          {/* Classification */}
          <Section title="Classification">
            <div style={styles.classGrid}>
              {CLASSIFICATIONS.map(c => (
                <button
                  key={c.value}
                  style={{
                    ...styles.classBtn,
                    borderColor: editedActor.classification === c.value ? c.color : colors.border,
                    background: editedActor.classification === c.value ? `${c.color}10` : colors.surface,
                    color: editedActor.classification === c.value ? c.color : colors.textSecondary
                  }}
                  onClick={() => handleChange('classification', c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {editedActor.is_self !== 1 && (
              <button style={styles.selfBtn} onClick={handleSetSelf}>
                Mark as "This is Me"
              </button>
            )}
          </Section>

          {/* Identity */}
          <Section title="Identity">
            <FieldRow>
              <Field label="Role/Title">
                <input
                  type="text"
                  value={editedActor.role || ''}
                  onChange={e => handleChange('role', e.target.value)}
                  style={styles.input}
                  placeholder="e.g., Manager"
                />
              </Field>
              <Field label="Relationship">
                <select
                  value={editedActor.relationship_to_self || ''}
                  onChange={e => handleChange('relationship_to_self', e.target.value)}
                  style={styles.select}
                >
                  {RELATIONSHIPS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Gender">
                <select
                  value={editedActor.gender || ''}
                  onChange={e => handleChange('gender', e.target.value)}
                  style={styles.select}
                >
                  {GENDERS.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Disability Status">
                <select
                  value={editedActor.disability_status || ''}
                  onChange={e => handleChange('disability_status', e.target.value)}
                  style={styles.select}
                >
                  {DISABILITY_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </Field>
            </FieldRow>
          </Section>

          {/* Employment */}
          <Section title="Employment">
            <FieldRow>
              <Field label="Start Date">
                <input
                  type="date"
                  value={editedActor.start_date || ''}
                  onChange={e => handleChange('start_date', e.target.value)}
                  style={styles.input}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  value={editedActor.end_date || ''}
                  onChange={e => handleChange('end_date', e.target.value)}
                  style={styles.input}
                />
              </Field>
            </FieldRow>
          </Section>

          {/* Reporting Line */}
          <Section title="Reporting Line">
            <Field label="Reports To">
              <select
                value={editedActor.reports_to || ''}
                onChange={e => handleChange('reports_to', e.target.value)}
                style={styles.select}
              >
                <option value="">None</option>
                {allActors.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.role ? ` (${a.role})` : ''}</option>
                ))}
              </select>
            </Field>
            {directReports.length > 0 && (
              <Field label="Direct Reports">
                <div style={styles.reportsList}>
                  {directReports.map(dr => (
                    <div key={dr.id} style={styles.reportItem}>
                      {dr.name}
                      {dr.role && <span style={styles.reportRole}> - {dr.role}</span>}
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </Section>

          {/* Assessment (for witnesses) */}
          {editedActor.classification?.startsWith('witness') && (
            <Section title="Assessment">
              <Field label="Would they help your case?">
                <div style={styles.helpGrid}>
                  {WOULD_HELP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      style={{
                        ...styles.helpBtn,
                        borderColor: editedActor.would_they_help === opt.value ? opt.color : colors.border,
                        background: editedActor.would_they_help === opt.value ? `${opt.color}10` : colors.surface,
                        color: editedActor.would_they_help === opt.value ? opt.color : colors.textSecondary
                      }}
                      onClick={() => handleChange('would_they_help', opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>
          )}

          {/* Pay Records */}
          <Section title="Pay Records">
            {payRecords.length > 0 ? (
              <div style={styles.payList}>
                {payRecords.map(pr => (
                  <div key={pr.id} style={styles.payCard}>
                    <div style={styles.payInfo}>
                      <div style={styles.payPeriod}>{pr.period || pr.record_date}</div>
                      {pr.base_salary && (
                        <div style={styles.payAmount}>
                          ${pr.base_salary.toLocaleString()}
                        </div>
                      )}
                      {pr.document_filename && (
                        <div style={styles.payDoc}>{pr.document_filename}</div>
                      )}
                    </div>
                    <button
                      style={styles.payDeleteBtn}
                      onClick={() => handleDeletePayRecord(pr.id)}
                    >
                      {'\u2715'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptySection}>No pay records uploaded</div>
            )}

            {showPayForm ? (
              <div style={styles.payForm}>
                <FieldRow>
                  <Field label="Period">
                    <input
                      type="text"
                      value={payForm.period}
                      onChange={e => setPayForm(prev => ({ ...prev, period: e.target.value }))}
                      style={styles.input}
                      placeholder="e.g., March 2024"
                    />
                  </Field>
                  <Field label="Base Salary">
                    <input
                      type="number"
                      value={payForm.baseSalary}
                      onChange={e => setPayForm(prev => ({ ...prev, baseSalary: e.target.value }))}
                      style={styles.input}
                      placeholder="Amount"
                    />
                  </Field>
                </FieldRow>
                <Field label="Record Date">
                  <input
                    type="date"
                    value={payForm.recordDate}
                    onChange={e => setPayForm(prev => ({ ...prev, recordDate: e.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <div style={styles.payFormActions}>
                  <button style={styles.uploadBtn} onClick={handleUploadPay}>
                    Choose File & Upload
                  </button>
                  <button
                    style={styles.cancelSmall}
                    onClick={() => { setShowPayForm(false); setPayForm({ period: '', baseSalary: '', recordDate: '' }); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button style={styles.addPayBtn} onClick={() => setShowPayForm(true)}>
                + Upload Pay Record
              </button>
            )}
          </Section>

          {/* Document Appearances */}
          <Section title={`Document Appearances (${appearances.length})`}>
            {appearances.length > 0 ? (
              <div style={styles.appearanceList}>
                {appearances.map(app => (
                  <div key={app.id} style={styles.appearanceItem}>
                    <span style={styles.appearanceIcon}>
                      {app.file_type?.includes('image') ? '\u{1F5BC}' : '\u{1F4C4}'}
                    </span>
                    <div style={styles.appearanceInfo}>
                      <div style={styles.appearanceName}>{app.filename}</div>
                      {app.document_date && (
                        <div style={styles.appearanceDate}>
                          {new Date(app.document_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptySection}>Not found in any documents</div>
            )}
          </Section>

          {/* Delete */}
          <Section title="Actions">
            {showDeleteConfirm ? (
              <div style={styles.deleteConfirm}>
                <p style={styles.deleteWarning}>
                  This will permanently remove this person and all their connections.
                </p>
                <div style={styles.deleteActions}>
                  <button style={styles.deleteConfirmBtn} onClick={handleDelete}>
                    Confirm Delete
                  </button>
                  <button style={styles.cancelSmall} onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button style={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>
                Delete This Person
              </button>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

// Helper components
function Section({ title, children }) {
  const sectionStyles = {
    container: { marginBottom: spacing.lg },
    title: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      marginBottom: spacing.sm
    }
  };

  return (
    <div style={sectionStyles.container}>
      <div style={sectionStyles.title}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, flex: 1 }}>
      <label style={{
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        color: colors.textSecondary
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.sm }}>
      {children}
    </div>
  );
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.3)',
      zIndex: 999
    },
    panel: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '420px',
      background: colors.surface,
      boxShadow: shadows.xl,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    },

    // Header
    header: {
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    headerTop: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: '18px',
      color: colors.textMuted,
      cursor: 'pointer',
      padding: spacing.xs
    },
    saveBtn: {
      padding: `${spacing.xs} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    nameInput: {
      width: '100%',
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      background: 'transparent',
      border: 'none',
      borderBottom: `1px solid transparent`,
      padding: `${spacing.xs} 0`,
      outline: 'none',
      marginBottom: spacing.sm
    },
    classTag: {
      display: 'inline-block',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.full
    },

    // Body
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.lg
    },

    // Classification grid
    classGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: spacing.xs,
      marginBottom: spacing.sm
    },
    classBtn: {
      padding: `${spacing.xs} ${spacing.sm}`,
      border: '2px solid',
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      textAlign: 'center',
      background: 'none'
    },
    selfBtn: {
      width: '100%',
      padding: spacing.sm,
      background: '#EFF6FF',
      border: `1px solid #2563EB`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: '#2563EB',
      cursor: 'pointer',
      marginTop: spacing.sm
    },

    // Inputs
    input: {
      width: '100%',
      padding: spacing.sm,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none',
      boxSizing: 'border-box'
    },
    select: {
      width: '100%',
      padding: spacing.sm,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none',
      cursor: 'pointer',
      boxSizing: 'border-box'
    },

    // Help grid
    helpGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: spacing.xs
    },
    helpBtn: {
      padding: spacing.sm,
      border: '2px solid',
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      textAlign: 'center',
      background: 'none'
    },

    // Reporting
    reportsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs
    },
    reportItem: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    reportRole: {
      color: colors.textMuted
    },

    // Pay records
    payList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
      marginBottom: spacing.sm
    },
    payCard: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`
    },
    payInfo: {
      flex: 1
    },
    payPeriod: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary
    },
    payAmount: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      marginTop: '2px'
    },
    payDoc: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: '2px'
    },
    payDeleteBtn: {
      background: 'none',
      border: 'none',
      color: colors.textMuted,
      cursor: 'pointer',
      fontSize: '14px',
      padding: spacing.xs
    },
    addPayBtn: {
      width: '100%',
      padding: spacing.sm,
      background: colors.surfaceAlt,
      border: `1px dashed ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      cursor: 'pointer'
    },
    payForm: {
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      marginTop: spacing.sm
    },
    payFormActions: {
      display: 'flex',
      gap: spacing.sm,
      marginTop: spacing.sm
    },
    uploadBtn: {
      flex: 1,
      padding: spacing.sm,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    cancelSmall: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      cursor: 'pointer'
    },

    // Appearances
    appearanceList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs
    },
    appearanceItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    appearanceIcon: {
      fontSize: '16px',
      flexShrink: 0
    },
    appearanceInfo: {
      flex: 1,
      minWidth: 0
    },
    appearanceName: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    appearanceDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: '1px'
    },

    emptySection: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
      padding: spacing.sm
    },

    // Delete
    deleteBtn: {
      width: '100%',
      padding: spacing.sm,
      background: 'transparent',
      border: `1px solid #DC2626`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: '#DC2626',
      cursor: 'pointer'
    },
    deleteConfirm: {
      padding: spacing.md,
      background: '#FEF2F2',
      borderRadius: radius.md,
      border: '1px solid #DC2626'
    },
    deleteWarning: {
      fontSize: typography.fontSize.sm,
      color: '#991B1B',
      margin: `0 0 ${spacing.sm} 0`
    },
    deleteActions: {
      display: 'flex',
      gap: spacing.sm
    },
    deleteConfirmBtn: {
      flex: 1,
      padding: spacing.sm,
      background: '#DC2626',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    }
  };
}
