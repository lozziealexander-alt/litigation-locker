import React, { useState, useEffect } from 'react';
import { colors, spacing, typography, radius } from '../styles/tokens';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // C4: Encrypted export
  const [exportPasscode, setExportPasscode] = useState('');
  const [exportExpiry, setExportExpiry] = useState('7');
  const [exportStatus, setExportStatus] = useState(null); // null | 'working' | 'done' | 'error'
  const [exportMsg, setExportMsg] = useState('');

  // Web export (GitHub Pages viewer)
  const [webPassword, setWebPassword] = useState('');
  const [webStatus, setWebStatus] = useState(null);
  const [webMsg, setWebMsg] = useState('');

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

  async function handleExport() {
    if (!exportPasscode.trim()) {
      setExportMsg('Please enter a passcode.');
      setExportStatus('error');
      return;
    }
    setExportStatus('working');
    setExportMsg('');
    const r = await window.api.export.generateHTML(exportPasscode, parseInt(exportExpiry) || 7);
    if (r.success) {
      setExportStatus('done');
      setExportMsg('Saved to: ' + r.path);
      setExportPasscode('');
    } else {
      setExportStatus('error');
      setExportMsg(r.error || 'Export failed');
    }
  }

  async function handleWebExport() {
    if (!webPassword.trim() || webPassword.length < 4) {
      setWebMsg('Password must be at least 4 characters.');
      setWebStatus('error');
      return;
    }
    setWebStatus('working');
    setWebMsg('');
    const r = await window.api.export.webVault(webPassword);
    if (r.success) {
      setWebStatus('done');
      setWebMsg('Saved to: ' + r.path);
      setWebPassword('');
    } else {
      setWebStatus('error');
      setWebMsg(r.error || 'Export failed');
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

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Encrypted Export</h3>
        <p style={s.sectionDesc}>
          Export your case as a self-contained, password-protected HTML file you can share with
          your attorney. The file decrypts in any browser using AES-256 and automatically expires
          after the chosen number of days.
        </p>

        <div style={s.field}>
          <label style={s.label}>Export Passcode</label>
          <div style={s.inputRow}>
            <input
              style={s.input}
              type="password"
              value={exportPasscode}
              onChange={e => { setExportPasscode(e.target.value); setExportStatus(null); }}
              placeholder="Choose a strong passcode"
            />
            <select
              style={{ ...s.input, flex: '0 0 auto', width: 'auto', cursor: 'pointer' }}
              value={exportExpiry}
              onChange={e => setExportExpiry(e.target.value)}
            >
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <button
              style={{ ...s.saveBtn, opacity: exportStatus === 'working' ? 0.6 : 1 }}
              onClick={handleExport}
              disabled={exportStatus === 'working'}
            >
              {exportStatus === 'working' ? 'Generating...' : 'Export'}
            </button>
          </div>
          {exportStatus === 'done' && (
            <span style={{ ...s.hint, color: '#16A34A' }}>
              ✓ {exportMsg}
            </span>
          )}
          {exportStatus === 'error' && (
            <span style={{ ...s.hint, color: '#DC2626' }}>
              {exportMsg}
            </span>
          )}
          <span style={s.hint}>
            Share the .html file with your attorney. Do NOT share the passcode in the same message.
          </span>
        </div>
      </div>
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Web Viewer Export</h3>
        <p style={s.sectionDesc}>
          Export your case as an encrypted vault for the GitHub Pages web viewer.
          Recipients visit your site and enter the password to browse the case in
          their browser — no download required.
        </p>

        <div style={s.field}>
          <label style={s.label}>Viewer Password</label>
          <div style={s.inputRow}>
            <input
              style={s.input}
              type="password"
              value={webPassword}
              onChange={e => { setWebPassword(e.target.value); setWebStatus(null); }}
              placeholder="Choose a password for the web viewer"
            />
            <button
              style={{ ...s.saveBtn, opacity: webStatus === 'working' ? 0.6 : 1 }}
              onClick={handleWebExport}
              disabled={webStatus === 'working'}
            >
              {webStatus === 'working' ? 'Exporting...' : 'Export for Web'}
            </button>
          </div>
          {webStatus === 'done' && (
            <span style={{ ...s.hint, color: '#16A34A' }}>
              {'\u2713'} {webMsg}
            </span>
          )}
          {webStatus === 'error' && (
            <span style={{ ...s.hint, color: '#DC2626' }}>
              {webMsg}
            </span>
          )}
          <span style={s.hint}>
            Save the vault.enc.json file, then run: npm run build:web -- --vault path/to/vault.enc.json
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
