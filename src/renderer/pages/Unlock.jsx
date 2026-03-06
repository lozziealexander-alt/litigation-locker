import React, { useState, useEffect } from 'react';
import { useTheme } from '../styles/ThemeContext';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

export default function Unlock({ onUnlock }) {
  const { mode } = useTheme(); // subscribe to theme changes
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isNewVault, setIsNewVault] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styles = getStyles();

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
    setIsSubmitting(true);

    try {
      if (isNewVault) {
        if (passphrase.length < 8) {
          setError('Passphrase must be at least 8 characters');
          setIsSubmitting(false);
          return;
        }
        if (passphrase !== confirmPassphrase) {
          setError('Passphrases do not match');
          setIsSubmitting(false);
          return;
        }

        const result = await window.api.vault.setup(passphrase);
        if (result.success) {
          onUnlock();
        } else {
          setError(result.error || 'Failed to create vault');
        }
      } else {
        const result = await window.api.vault.unlock(passphrase);
        if (result.success) {
          onUnlock();
        } else {
          setError('Invalid passphrase');
        }
      }
    } catch (err) {
      setError('An error occurred');
    }

    setIsSubmitting(false);
  }

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{'\uD83D\uDD12'}</span>
        </div>

        <h1 style={styles.title}>Litigation Locker</h1>
        <p style={styles.subtitle}>
          {isNewVault
            ? 'Create a passphrase to secure your vault'
            : 'Enter your passphrase to unlock'
          }
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Passphrase</label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={isNewVault ? 'Create a strong passphrase' : 'Enter passphrase'}
              style={styles.input}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          {isNewVault && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm Passphrase</label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Confirm passphrase"
                style={styles.input}
                disabled={isSubmitting}
              />
            </div>
          )}

          {error && (
            <div style={styles.error}>
              <span style={styles.errorIcon}>{'\u26A0\uFE0F'}</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(isSubmitting ? styles.buttonDisabled : {})
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Please wait...' : isNewVault ? 'Create Vault' : 'Unlock'}
          </button>
        </form>

        <p style={styles.warning}>
          {'\u26A0\uFE0F'} Your passphrase cannot be recovered. If forgotten, all data is permanently lost.
        </p>
      </div>
    </div>
  );
}

function getStyles() {
  return {
    container: {
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.surfaceAlt} 100%)`
    },
    loadingSpinner: {
      width: '40px',
      height: '40px',
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.primary,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    card: {
      background: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      width: '100%',
      maxWidth: '400px',
      boxShadow: shadows.xl,
      textAlign: 'center'
    },
    iconContainer: {
      width: '72px',
      height: '72px',
      background: colors.surfaceAlt,
      borderRadius: radius.full,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: `0 auto ${spacing.lg}`
    },
    icon: {
      fontSize: '32px'
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: `0 0 ${spacing.sm} 0`
    },
    subtitle: {
      fontSize: typography.fontSize.base,
      color: colors.textMuted,
      margin: `0 0 ${spacing.xl} 0`
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md
    },
    inputGroup: {
      textAlign: 'left'
    },
    label: {
      display: 'block',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textSecondary,
      marginBottom: spacing.xs
    },
    input: {
      width: '100%',
      padding: spacing.md,
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.base,
      color: colors.textPrimary,
      outline: 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      boxSizing: 'border-box'
    },
    button: {
      width: '100%',
      padding: spacing.md,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      marginTop: spacing.sm,
      transition: 'background 0.15s ease'
    },
    buttonDisabled: {
      background: colors.textMuted,
      cursor: 'not-allowed'
    },
    error: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      background: colors.errorBg,
      color: colors.error,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm
    },
    errorIcon: {
      fontSize: typography.fontSize.base
    },
    warning: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: spacing.xl,
      lineHeight: typography.lineHeight.relaxed
    }
  };
}
