import React from 'react';

export default function DeleteConfirmModal({
  item,
  itemType,
  impact,
  onConfirm,
  onCancel
}) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>⚠️ Confirm Deletion</h2>
        </div>

        <div style={styles.content}>
          <p style={styles.question}>
            Delete <strong>{item?.title || item?.filename}</strong>?
          </p>

          {impact && impact.length > 0 && (
            <div style={styles.impact}>
              <div style={styles.impactTitle}>Impact:</div>
              {impact.map((msg, i) => (
                <div key={i} style={styles.impactItem}>• {msg}</div>
              ))}
            </div>
          )}

          <p style={styles.warning}>
            This action cannot be undone.
          </p>
        </div>

        <div style={styles.footer}>
          <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
          <button onClick={onConfirm} style={styles.deleteBtn}>
            Delete Permanently
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
    width: '500px',
    maxWidth: '90vw'
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid #E5E7EB'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#DC2626'
  },
  content: {
    padding: '24px'
  },
  question: {
    fontSize: '15px',
    marginBottom: '20px'
  },
  impact: {
    backgroundColor: '#FEF3C7',
    border: '1px solid #F59E0B',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px'
  },
  impactTitle: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#92400E',
    marginBottom: '8px'
  },
  impactItem: {
    fontSize: '13px',
    color: '#78350F',
    marginBottom: '4px'
  },
  warning: {
    fontSize: '13px',
    color: '#DC2626',
    fontWeight: 600
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
  deleteBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#DC2626',
    color: 'white',
    cursor: 'pointer'
  }
};
