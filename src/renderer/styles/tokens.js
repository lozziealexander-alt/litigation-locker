// ---- Color palettes ----

const lightColors = {
  // Backgrounds
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F3F0',

  // Borders
  border: '#E8E4DF',
  borderLight: '#F0EDE8',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#FFFFFF',

  // Semantic
  primary: '#2563EB',
  primaryHover: '#1D4ED8',

  // Evidence types (shared)
  adverseAction: '#DC2626',
  incident: '#F97316',
  protectedActivity: '#7C3AED',
  requestHelp: '#2563EB',
  response: '#EC4899',
  claimAgainst: '#991B1B',
  claimYours: '#0D9488',
  payRecord: '#CA8A04',
  context: '#6B7280',
  supporting: '#16A34A',

  // Severity
  severityMinor: '#6B7280',
  severityModerate: '#F97316',
  severitySevere: '#DC2626',
  severityEgregious: '#7F1D1D',

  // Connection lines
  connectionRetaliation: '#DC2626',
  connectionEscalation: '#F97316',
  connectionCluster: '#2563EB',
  connectionActor: '#6B7280',

  // Status
  success: '#16A34A',
  warning: '#F97316',
  error: '#DC2626',

  // Retaliation badge bg
  retaliationBg: '#DC2626',

  // Error panel bg
  errorBg: '#FEF2F2',

  // Escalation badge
  escalationBg: '#FEF2F2',

  // Confidence backgrounds
  confidenceExact: '#DCFCE7',
  confidenceApprox: '#FEF9C3',
  confidenceInferred: '#FEE2E2',
  confidenceUndated: '#F3F4F6',

  // Sidebar (always dark for contrast)
  sidebarBg: '#1E1E2E',
  sidebarText: '#E5E5E5',
  sidebarTextMuted: '#888888',
  sidebarBorder: '#2E2E3E',
  sidebarActive: '#3B82F6'
};

const darkColors = {
  // Backgrounds
  bg: '#1a1a2e',
  surface: '#252542',
  surfaceAlt: '#1e1e36',

  // Borders
  border: '#2a2a4a',
  borderLight: '#333355',

  // Text
  textPrimary: '#f5f0eb',
  textSecondary: '#bbbbcc',
  textMuted: '#888899',
  textInverse: '#1A1A1A',

  // Semantic
  primary: '#3B82F6',
  primaryHover: '#2563EB',

  // Evidence types (slightly brighter for dark bg)
  adverseAction: '#EF4444',
  incident: '#FB923C',
  protectedActivity: '#A78BFA',
  requestHelp: '#60A5FA',
  response: '#F472B6',
  claimAgainst: '#FCA5A5',
  claimYours: '#5EEAD4',
  payRecord: '#FACC15',
  context: '#9CA3AF',
  supporting: '#4ADE80',

  // Severity
  severityMinor: '#9CA3AF',
  severityModerate: '#FB923C',
  severitySevere: '#EF4444',
  severityEgregious: '#FCA5A5',

  // Connection lines
  connectionRetaliation: '#EF4444',
  connectionEscalation: '#FB923C',
  connectionCluster: '#60A5FA',
  connectionActor: '#9CA3AF',

  // Status
  success: '#4ADE80',
  warning: '#FB923C',
  error: '#EF4444',

  // Retaliation badge bg
  retaliationBg: '#DC2626',

  // Error panel bg
  errorBg: '#450a0a',

  // Escalation badge
  escalationBg: '#450a0a',

  // Confidence backgrounds
  confidenceExact: '#064e3b',
  confidenceApprox: '#713f12',
  confidenceInferred: '#450a0a',
  confidenceUndated: '#1f2937',

  // Sidebar (always dark)
  sidebarBg: '#1E1E2E',
  sidebarText: '#E5E5E5',
  sidebarTextMuted: '#888888',
  sidebarBorder: '#2E2E3E',
  sidebarActive: '#3B82F6'
};

// Mutable reference — updated by setTheme()
export let colors = { ...lightColors };

export function setTheme(mode) {
  const src = mode === 'dark' ? darkColors : lightColors;
  Object.assign(colors, src);
}

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px rgba(0,0,0,0.07)',
  lg: '0 10px 15px rgba(0,0,0,0.1)',
  xl: '0 20px 25px rgba(0,0,0,0.12)',
  inner: 'inset 0 1px 2px rgba(0,0,0,0.05)',
  glow: '0 0 0 3px rgba(37, 99, 235, 0.15)'
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px'
};

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'SF Mono', 'Fira Code', 'Consolas', monospace",

  fontSize: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    md: '16px',
    lg: '18px',
    xl: '24px',
    xxl: '32px'
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75
  }
};

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px'
};

// Helper to get evidence type color
export function getEvidenceColor(type) {
  const map = {
    'ADVERSE_ACTION': colors.adverseAction,
    'INCIDENT': colors.incident,
    'PROTECTED_ACTIVITY': colors.protectedActivity,
    'REQUEST_FOR_HELP': colors.requestHelp,
    'RESPONSE': colors.response,
    'CLAIM_AGAINST_YOU': colors.claimAgainst,
    'CLAIM_YOU_MADE': colors.claimYours,
    'PAY_RECORD': colors.payRecord,
    'CONTEXT': colors.context,
    'SUPPORTING': colors.supporting
  };
  return map[type] || colors.context;
}

// Helper to get severity color
export function getSeverityColor(severity) {
  const map = {
    'minor': colors.severityMinor,
    'moderate': colors.severityModerate,
    'severe': colors.severitySevere,
    'egregious': colors.severityEgregious
  };
  return map[severity] || colors.severityMinor;
}
