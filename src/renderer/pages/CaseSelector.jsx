import React, { useState, useEffect } from 'react';

export default function CaseSelector({ onSelectCase }) {
  const [cases, setCases] = useState([]);
  const [newCaseName, setNewCaseName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    const result = await window.api.cases.list();
    if (result.success) setCases(result.cases || []);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newCaseName.trim()) return;

    setCreating(true);
    setError('');

    const result = await window.api.cases.create(newCaseName.trim());
    if (result.success) {
      // Open the case immediately
      const openResult = await window.api.cases.open(result.case.id);
      if (openResult.success) {
        onSelectCase({ id: result.case.id, name: newCaseName.trim() });
      }
    } else {
      setError(result.error || 'Failed to create case');
    }
    setCreating(false);
  }

  async function handleOpen(caseItem) {
    const result = await window.api.cases.open(caseItem.id);
    if (result.success) {
      onSelectCase(caseItem);
    } else {
      setError(result.error || 'Failed to open case');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Your Cases</h2>

        {cases.length > 0 ? (
          <div style={styles.caseList}>
            {cases.map(c => (
              <button
                key={c.id}
                onClick={() => handleOpen(c)}
                style={styles.caseItem}
              >
                <span style={styles.caseName}>{c.name}</span>
                <span style={styles.caseDate}>
                  {new Date(c.updated_at || c.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p style={styles.empty}>No cases yet. Create your first case below.</p>
        )}

        <form onSubmit={handleCreate} style={styles.form}>
          <input
            type="text"
            value={newCaseName}
            onChange={(e) => setNewCaseName(e.target.value)}
            placeholder="New case name (e.g., Employment Dispute 2024)"
            style={styles.input}
          />
          <button
            type="submit"
            disabled={creating || !newCaseName.trim()}
            style={{
              ...styles.createBtn,
              opacity: creating || !newCaseName.trim() ? 0.5 : 1
            }}
          >
            {creating ? 'Creating...' : 'Create Case'}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px'
  },
  card: {
    background: '#252542',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  title: {
    fontSize: '20px',
    fontWeight: 300,
    color: '#f5f0eb',
    marginBottom: '24px',
    margin: '0 0 24px 0'
  },
  caseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px'
  },
  caseItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    color: '#f5f0eb',
    fontSize: '14px'
  },
  caseName: {
    fontWeight: 500
  },
  caseDate: {
    fontSize: '12px',
    color: '#888'
  },
  empty: {
    color: '#666',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px 0'
  },
  form: {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid #333',
    paddingTop: '16px'
  },
  input: {
    flex: 1,
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    color: '#f5f0eb',
    outline: 'none'
  },
  createBtn: {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    marginTop: '12px'
  }
};
