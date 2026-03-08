import React, { useState, useEffect } from 'react';
import { colors, spacing, typography, radius } from '../styles/tokens';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.settings.get('anthropic_api_key').then(r => {
      if (r.success && r.value) setApiKey(r.value);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    const r = await window.api.settings.set('anthropic_api_key', apiKey);
    if (r.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const s = getStyles();

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>Settings</h1>
        <p style={s.subtitle}>Configure application settings. All data is stored securely in the vault.</p>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>AI Analysis</h3>
        <p style={s.sectionDesc}>
          An Anthropic API key enables AI-powered document assessment including deep flag analysis
          and full legal memos. Without it, the assessor uses pattern-based detection only.
        </p>

        <div style={s.field}>
          <label style={s.label}>Anthropic API Key</label>
          <div style={s.inputRow}>
            <input
              style={s.input}
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setSaved(false); }}
              placeholder="sk-ant-..."
            />
            <button
              style={{ ...s.saveBtn, opacity: saved ? 0.6 : 1 }}
              onClick={handleSave}
              disabled={saved}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
          <span style={s.hint}>
            Your key is stored in the encrypted vault database, never in localStorage or config files.
          </span>
        </div>
      </div>
    </div>
  );
}

function getStyles() {
  return {
    container: {
      height: '100%',
      overflowY: 'auto',
      padding: spacing.xl,
      maxWidth: '640px',
    },
    loading: {
      color: colors.textMuted,
      textAlign: 'center',
      padding: spacing.xl,
    },
    header: {
      marginBottom: spacing.xl,
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
    },
    subtitle: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.sm,
    },
    sectionDesc: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      lineHeight: typography.lineHeight.relaxed,
      marginBottom: spacing.md,
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
    },
    label: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    inputRow: {
      display: 'flex',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },
    saveBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.primary,
      color: '#fff',
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    hint: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
  };
}
