import React, { useState, useEffect } from 'react';
import Unlock from './pages/Unlock';
import Timeline from './pages/Timeline';
import People from './pages/People';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Connections from './pages/Connections';
import LawyerBrief from './pages/LawyerBrief';
import DocumentPanel from './components/DocumentPanel';
import EditMomentModal from './components/EditMomentModal';
import ActorDetail from './components/ActorDetail';
import { useTheme } from './styles/ThemeContext';
import { colors, shadows, spacing, typography, radius } from './styles/tokens';

export default function App() {
  const { mode, toggle } = useTheme();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedActor, setSelectedActor] = useState(null);
  const [currentPage, setCurrentPage] = useState('brief');
  const [timelineKey, setTimelineKey] = useState(0);
  const [peopleKey, setPeopleKey] = useState(0);
  const [threadsKey, setThreadsKey] = useState(0);
  const [highlightDocIds, setHighlightDocIds] = useState(null);
  const [renamingCaseId, setRenamingCaseId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [briefStale, setBriefStale] = useState(false);
  const [importToast, setImportToast] = useState(null);

  // Recompute styles each render so they pick up current theme colors
  const styles = getStyles();

  useEffect(() => {
    checkVaultStatus();
  }, []);

  useEffect(() => {
    if (isReadOnly) return; // No file import or moment creation in read-only mode
    const handleImport = async () => {
      if (!activeCase) {
        alert('Please open a case before importing documents.');
        return;
      }
      const result = await window.api.dialog.openFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        try {
          const res = await window.api.documents.ingest(result.filePaths);
          const added = res?.documents?.length ?? 0;
          const errors = res?.errors?.length ?? 0;
          const dupes = res?.nearDuplicates?.length ?? 0;
          let msg = `${added} document${added !== 1 ? 's' : ''} added.`;
          if (dupes) msg += ` ${dupes} near-duplicate${dupes !== 1 ? 's' : ''} detected.`;
          if (errors) msg += ` ${errors} skipped (duplicate or error).`;
          setImportToast(msg);
          setTimeout(() => setImportToast(null), 4000);
          setCurrentPage('timeline');
          setTimelineKey(k => k + 1);
          setThreadsKey(k => k + 1);
          markBriefStale();
        } catch (e) {
          setImportToast('Import failed: ' + (e?.message || 'Unknown error'));
          setTimeout(() => setImportToast(null), 5000);
        }
      }
    };
    const handleAddMoment = () => setSelectedEvent({});
    window.addEventListener('import-files', handleImport);
    window.addEventListener('add-moment', handleAddMoment);
    return () => {
      window.removeEventListener('import-files', handleImport);
      window.removeEventListener('add-moment', handleAddMoment);
    };
  }, [isReadOnly, activeCase]);

  // Keyboard shortcut: Cmd/Ctrl + B → open lawyer brief
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setCurrentPage('brief');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Mark brief stale when case data changes
  async function markBriefStale() {
    try {
      await window.api.brief.markStale();
      setBriefStale(true);
    } catch (e) { /* non-critical */ }
  }

  async function checkVaultStatus() {
    const readOnly = await window.api.vault.isReadOnly();
    setIsReadOnly(readOnly);
    const unlocked = await window.api.vault.isUnlocked();
    console.log('[App] vault isUnlocked:', unlocked, 'readOnly:', readOnly);
    setIsUnlocked(unlocked);
    if (unlocked) {
      await loadCases();
    }
    setIsLoading(false);
  }

  async function loadCases() {
    const result = await window.api.cases.list();
    console.log('[App] cases:list result:', JSON.stringify(result).slice(0, 200));
    if (result.success) {
      setCases(result.cases);
      if (result.cases.length > 0 && !activeCase) {
        console.log('[App] auto-opening case:', result.cases[0].name);
        await selectCase(result.cases[0]);
      }
    }
  }

  async function selectCase(caseData) {
    console.log('[App] selectCase:', caseData.id, caseData.name);
    const result = await window.api.cases.open(caseData.id);
    console.log('[App] cases:open result:', JSON.stringify(result));
    if (result.success) {
      setActiveCase(caseData);
      setSelectedDocument(null);
      setSelectedActor(null);
      setTimelineKey(k => k + 1);
    }
  }

  async function handleUnlock() {
    setIsUnlocked(true);
    await loadCases();
  }

  async function handleCreateCase() {
    const name = prompt('Case name:');
    if (name) {
      const result = await window.api.cases.create(name);
      if (result.success) {
        const newCases = [...cases, result.case];
        setCases(newCases);
        await selectCase(result.case);
      }
    }
  }

  async function handleRenameCase(caseId, newName) {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingCaseId(null); return; }
    const result = await window.api.cases.rename(caseId, trimmed);
    if (result.success) {
      setCases(prev => prev.map(c => c.id === caseId ? { ...c, name: trimmed } : c));
      if (activeCase?.id === caseId) setActiveCase(prev => ({ ...prev, name: trimmed }));
    }
    setRenamingCaseId(null);
  }

  async function handleBurn() {
    if (confirm('\u26A0\uFE0F BURN all data?\n\nThis will permanently destroy all cases, evidence, and settings.\n\nThis cannot be undone.')) {
      if (prompt('Type BURN to confirm:') === 'BURN') {
        const result = await window.api.burn.execute('all');
        if (result.success) {
          alert('All data has been destroyed.');
          window.location.reload();
        } else {
          alert('Error: ' + (result.errors?.join(', ') || 'Unknown error'));
        }
      }
    }
  }

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.loadingSpinner} />
      </div>
    );
  }

  if (!isUnlocked) {
    return <Unlock onUnlock={handleUnlock} isReadOnly={isReadOnly} />;
  }

  if (!activeCase) {
    return (
      <div style={styles.welcome}>
        <div style={styles.welcomeCard}>
          <div style={styles.welcomeIcon}>{'\uD83D\uDD12'}</div>
          <h1 style={styles.welcomeTitle}>Litigation Locker</h1>
          <p style={styles.welcomeText}>Create a case to start organizing your evidence</p>
          <button style={styles.createButton} onClick={handleCreateCase}>
            + Create Your First Case
          </button>
          <button style={styles.burnButtonSmall} onClick={handleBurn}>
            {'\uD83D\uDD25'} BURN All Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.logo}>{'\uD83D\uDD12'}</span>
          <span style={styles.logoText}>Litigation Locker</span>
        </div>

        <div style={styles.sidebarSection}>
          <div style={styles.sidebarLabel}>VIEWS</div>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'brief' ? styles.navButtonActive : {})
            }}
            onClick={() => { setBriefStale(false); setCurrentPage('brief'); }}
          >
            <span style={styles.caseIcon}>⚖️</span>
            <span style={styles.caseName}>Case Overview</span>
            {briefStale && <span style={styles.staleDot} />}
          </button>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'timeline' ? styles.navButtonActive : {})
            }}
            onClick={() => setCurrentPage('timeline')}
          >
            <span style={styles.caseIcon}>{'\u{1F4C5}'}</span>
            <span style={styles.caseName}>Timeline</span>
          </button>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'threads' ? styles.navButtonActive : {})
            }}
            onClick={() => { setThreadsKey(k => k + 1); setCurrentPage('threads'); }}
          >
            <span style={styles.caseIcon}>{'\uD83E\uDDF5'}</span>
            <span style={styles.caseName}>Threads</span>
          </button>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'people' ? styles.navButtonActive : {})
            }}
            onClick={() => setCurrentPage('people')}
          >
            <span style={styles.caseIcon}>{'\u{1F465}'}</span>
            <span style={styles.caseName}>People</span>
          </button>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'connections' ? styles.navButtonActive : {})
            }}
            onClick={() => setCurrentPage('connections')}
          >
            <span style={styles.caseIcon}>⚡</span>
            <span style={styles.caseName}>Connections</span>
          </button>
          <button
            style={{
              ...styles.caseButton,
              ...(currentPage === 'settings' ? styles.navButtonActive : {})
            }}
            onClick={() => setCurrentPage('settings')}
          >
            <span style={styles.caseIcon}>{'\u2699'}</span>
            <span style={styles.caseName}>Settings</span>
          </button>

          <div style={{ ...styles.sidebarLabel, marginTop: spacing.lg }}>CASES</div>
          {cases.map(c => (
            <button
              key={c.id}
              style={{
                ...styles.caseButton,
                ...(c.id === activeCase?.id ? styles.caseButtonActive : {})
              }}
              onClick={() => selectCase(c)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenamingCaseId(c.id);
                setRenameValue(c.name);
              }}
            >
              <span style={styles.caseIcon}>{'\uD83D\uDCC1'}</span>
              {renamingCaseId === c.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameCase(c.id, renameValue)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameCase(c.id, renameValue);
                    if (e.key === 'Escape') setRenamingCaseId(null);
                  }}
                  onClick={e => e.stopPropagation()}
                  style={styles.renameInput}
                />
              ) : (
                <span style={styles.caseName}>{c.name}</span>
              )}
            </button>
          ))}
          {!isReadOnly && (
            <button style={styles.addCaseButton} onClick={handleCreateCase}>
              <span>+</span>
              <span>New Case</span>
            </button>
          )}
        </div>

        <div style={styles.sidebarFooter}>
          {isReadOnly && (
            <div style={styles.readOnlyBadge}>
              <span>{'👁'}</span>
              <span>Read-Only Vault</span>
            </div>
          )}

          {/* Theme toggle */}
          <button style={styles.themeToggle} onClick={toggle}>
            <span>{mode === 'light' ? '\u263E' : '\u2600'}</span>
            <span>{mode === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>

          {!isReadOnly && (
            <button style={styles.burnButton} onClick={handleBurn}>
              <span>{'\uD83D\uDD25'}</span>
              <span>BURN</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {currentPage === 'timeline' && (
          <Timeline
            refreshSignal={timelineKey}
            onSelectDocument={setSelectedDocument}
            onSelectEvent={setSelectedEvent}
            highlightDocIds={highlightDocIds}
            onClearHighlights={() => setHighlightDocIds(null)}
            onDataChanged={() => setThreadsKey(k => k + 1)}
          />
        )}
        {currentPage === 'threads' && (
          <Dashboard
            key={threadsKey}
            onNavigateToTimeline={(docIds) => {
              setHighlightDocIds(docIds || null);
              setCurrentPage('timeline');
            }}
            onNavigateToPeople={() => setCurrentPage('people')}
            onSelectDocument={setSelectedDocument}
            onSelectActor={setSelectedActor}
          />
        )}
        {currentPage === 'people' && (
          <People
            key={peopleKey}
            onSelectActor={setSelectedActor}
          />
        )}
        {currentPage === 'connections' && (
          <Connections onSelectDocument={setSelectedDocument} />
        )}
        {currentPage === 'settings' && (
          <Settings />
        )}
        {currentPage === 'brief' && (
          <LawyerBrief
            onNavigateToThread={(threadId) => {
              setThreadsKey(k => k + 1);
              setCurrentPage('threads');
            }}
            onNavigateToConnections={() => setCurrentPage('connections')}
          />
        )}
      </div>

      {/* Import toast */}
      {importToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1E293B', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 9999,
          whiteSpace: 'nowrap'
        }}>
          {importToast}
        </div>
      )}

      {selectedEvent && (
        <EditMomentModal
          key={selectedEvent.id ?? 'new'}
          caseId={activeCase?.id}
          momentId={selectedEvent.id}
          onClose={() => setSelectedEvent(null)}
          onSave={() => {
            setTimelineKey(k => k + 1);
            setThreadsKey(k => k + 1);
            setSelectedEvent(null);
            markBriefStale();
          }}
        />
      )}

      {/* Document panel */}
      {selectedDocument && (
        <DocumentPanel
          caseId={activeCase?.id}
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          onNavigate={setSelectedDocument}
          onDocumentUpdated={() => {
            setTimelineKey(k => k + 1);
            setThreadsKey(k => k + 1);
            markBriefStale();
          }}
        />
      )}

      {/* Actor detail panel */}
      {selectedActor && (
        <ActorDetail
          actor={selectedActor}
          onClose={() => setSelectedActor(null)}
          onActorUpdated={async () => {
            // Re-fetch the actor so the panel shows updated data
            try {
              const res = await window.api.actors.list();
              if (res.success && selectedActor) {
                const updated = res.actors.find(a => a.id === selectedActor.id);
                if (updated) {
                  setSelectedActor(updated);
                } else {
                  setSelectedActor(null); // actor was deleted
                }
              }
            } catch (e) {
              console.error('[App] re-fetch actor failed:', e);
              setSelectedActor(null);
            }
            setTimelineKey(k => k + 1);
            setPeopleKey(k => k + 1);
            setThreadsKey(k => k + 1);
            markBriefStale();
          }}
        />
      )}
    </div>
  );
}

function getStyles() {
  return {
    // Loading
    loading: {
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.bg
    },
    loadingSpinner: {
      width: '40px',
      height: '40px',
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.primary,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },

    // Welcome
    welcome: {
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.bg
    },
    welcomeCard: {
      background: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      textAlign: 'center',
      boxShadow: shadows.lg,
      maxWidth: '400px'
    },
    welcomeIcon: {
      fontSize: '48px',
      marginBottom: spacing.lg
    },
    welcomeTitle: {
      fontSize: typography.fontSize.xxl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: `0 0 ${spacing.sm} 0`
    },
    welcomeText: {
      fontSize: typography.fontSize.base,
      color: colors.textMuted,
      margin: `0 0 ${spacing.xl} 0`
    },
    createButton: {
      width: '100%',
      padding: `${spacing.md} ${spacing.lg}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      marginBottom: spacing.md,
      transition: 'background 0.15s ease'
    },
    burnButtonSmall: {
      background: 'transparent',
      color: colors.textMuted,
      border: 'none',
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      padding: spacing.sm
    },

    // Main layout
    app: {
      height: '100vh',
      display: 'flex',
      background: colors.bg
    },

    // Sidebar
    sidebar: {
      width: '240px',
      background: colors.sidebarBg,
      display: 'flex',
      flexDirection: 'column',
      borderRight: `1px solid ${colors.sidebarBorder}`,
      flexShrink: 0
    },
    sidebarHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.sidebarBorder}`
    },
    logo: {
      fontSize: '20px'
    },
    logoText: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.sidebarText
    },
    sidebarSection: {
      flex: 1,
      padding: spacing.md,
      overflowY: 'auto'
    },
    sidebarLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.sidebarTextMuted,
      letterSpacing: '1px',
      marginBottom: spacing.sm,
      paddingLeft: spacing.sm
    },
    caseButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      border: 'none',
      borderRadius: radius.md,
      color: colors.sidebarText,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      textAlign: 'left',
      marginBottom: spacing.xs,
      transition: 'background 0.15s ease'
    },
    caseButtonActive: {
      background: colors.sidebarActive,
      color: colors.textInverse
    },
    navButtonActive: {
      background: `${colors.sidebarActive}33`,
      color: colors.sidebarActive
    },
    caseIcon: {
      fontSize: '14px',
      opacity: 0.7
    },
    caseName: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    renameInput: {
      flex: 1,
      background: colors.bg,
      color: colors.textPrimary,
      border: `1px solid ${colors.primary}`,
      borderRadius: radius.sm,
      padding: '2px 6px',
      fontSize: typography.fontSize.sm,
      outline: 'none',
      minWidth: 0
    },
    addCaseButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      border: `1px dashed ${colors.sidebarBorder}`,
      borderRadius: radius.md,
      color: colors.sidebarTextMuted,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      marginTop: spacing.sm,
      transition: 'border-color 0.15s ease, color 0.15s ease'
    },
    sidebarFooter: {
      padding: spacing.md,
      borderTop: `1px solid ${colors.sidebarBorder}`,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    themeToggle: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.sidebarBorder,
      border: 'none',
      borderRadius: radius.md,
      color: colors.sidebarText,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },
    burnButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: '#7F1D1D',
      border: 'none',
      borderRadius: radius.md,
      color: '#FCA5A5',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },

    // Stale brief dot
    staleDot: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: '#F59E0B',
      flexShrink: 0,
      marginLeft: 'auto'
    },

    // Read-only badge
    readOnlyBadge: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      background: '#1E3A5F',
      border: '1px solid #2563EB44',
      borderRadius: radius.md,
      color: '#93C5FD',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold
    },

    // Main
    main: {
      flex: 1,
      overflow: 'hidden'
    }
  };
}
