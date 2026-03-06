import React, { useState, useEffect } from 'react';

export default function Unlock({ onUnlock }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isNewVault, setIsNewVault] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkVaultExists();
  }, []);

  async function checkVaultExists() {
    const exists = await window.api.vault.exists();
    setIsNewVault(!exists);
    setIsLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (isNewVault) {
      // Setting up new vault
      if (passphrase.length < 8) {
        setError('Passphrase must be at least 8 characters');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match');
        return;
      }

      const result = await window.api.vault.setup(passphrase);
      if (result.success) {
        onUnlock();
      } else {
        setError(result.error || 'Failed to create vault');
      }
    } else {
      // Unlocking existing vault
      const result = await window.api.vault.unlock(passphrase);
      if (result.success) {
        onUnlock();
      } else {
        setError('Invalid passphrase');
      }
    }
  }

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>&#x1f512;</div>
        <h1 style={styles.title}>Litigation Locker</h1>
        <p style={styles.subtitle}>
          {isNewVault ? 'Create a new vault' : 'Enter passphrase to unlock'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            style={styles.input}
            autoFocus
          />

          {isNewVault && (
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm passphrase"
              style={styles.input}
            />
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button}>
            {isNewVault ? 'Create Vault' : 'Unlock'}
          </button>
        </form>

        <p style={styles.warning}>
          If you forget your passphrase, your data cannot be recovered.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1a2e'
  },
  card: {
    background: '#252542',
    borderRadius: '16px',
    padding: '48px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 300,
    color: '#f5f0eb',
    marginBottom: '8px'
  },
  subtitle: {
    color: '#888',
    marginBottom: '32px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  input: {
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '14px 16px',
    fontSize: '16px',
    color: '#f5f0eb',
    outline: 'none'
  },
  button: {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px'
  },
  error: {
    color: '#ef4444',
    fontSize: '14px',
    margin: 0
  },
  warning: {
    color: '#666',
    fontSize: '12px',
    marginTop: '24px'
  }
};
