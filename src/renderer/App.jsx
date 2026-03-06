import React, { useState, useEffect } from 'react';
import Unlock from './pages/Unlock';
import CaseSelector from './pages/CaseSelector';
import Timeline from './pages/Timeline';
import DocumentDetail from './pages/DocumentDetail';
import DropZone from './components/DropZone';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentCase, setCurrentCase] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState(null);
  const [timelineKey, setTimelineKey] = useState(0);

  // Burn state
  const [burnConfirm, setBurnConfirm] = useState(false);
  const [burnText, setBurnText] = useState('');

  useEffect(() => {
    checkVaultStatus();
  }, []);

  async function checkVaultStatus() {
    const unlocked = await window.api.vault.isUnlocked();
    setIsUnlocked(unlocked);
    setIsLoading(false);
  }

  function handleUnlock() {
    setIsUnlocked(true);
  }

  async function handleLock() {
    await window.api.vault.lock();
    setIsUnlocked(false);
    setCurrentCase(null);
    setSelectedDoc(null);
  }

  function handleSelectCase(caseData) {
    setCurrentCase(caseData);
    setSelectedDoc(null);
    setTimelineKey(k => k + 1);
  }

  function handleBackToCases() {
    setCurrentCase(null);
    setSelectedDoc(null);
  }

  async function handleIngest(filePaths) {
    setIsIngesting(true);
    setIngestResults(null);

    try {
      const result = await window.api.documents.ingest(filePaths);
      setIngestResults(result);

      if (result.success && result.documents?.length > 0) {
        // Refresh timeline
        setTimelineKey(k => k + 1);
      }
    } catch (err) {
      setIngestResults({ success: false, error: err.message });
    }

    setIsIngesting(false);
  }

  function handleSelectDocument(doc) {
    setSelectedDoc(doc);
  }

  function handleCloseDetail() {
    setSelectedDoc(null);
  }

  function handleDocUpdate() {
    setTimelineKey(k => k + 1);
  }

  // Loading screen
  if (isLoading) {
    return (
      <div style={styles.loadingScreen}>
        Loading...
      </div>
    );
  }

  // Lock screen
  if (!isUnlocked) {
    return <Unlock onUnlock={handleUnlock} />;
  }

  // Case selector
  if (!currentCase) {
    return (
      <div style={styles.fullScreen}>
        <CaseSelector onSelectCase={handleSelectCase} />
      </div>
    );
  }

  // Main app with timeline
  return (
    <div style={styles.appContainer}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <button onClick={handleBackToCases} style={styles.backBtn}>
            {'\u2190'} Cases
          </button>
          <span style={styles.caseName}>{currentCase.name}</span>
        </div>
        <div style={styles.topRight}>
          {!burnConfirm ? (
            <>
              <button onClick={handleLock} style={styles.lockBtn}>Lock</button>
              <button onClick={() => setBurnConfirm(true)} style={styles.burnBtn}>BURN</button>
            </>
          ) : (
            <div style={styles.burnConfirmRow}>
              <span style={styles.burnWarning}>Type BURN:</span>
              <input
                type="text"
                value={burnText}
                onChange={(e) => setBurnText(e.target.value)}
                style={styles.burnInput}
                autoFocus
              />
              <button
                onClick={async () => {
                  if (burnText === 'BURN') {
                    await window.api.burn.execute('all');
                    setIsUnlocked(false);
                    setCurrentCase(null);
                  }
                }}
                disabled={burnText !== 'BURN'}
                style={{
                  ...styles.burnConfirmBtn,
                  opacity: burnText === 'BURN' ? 1 : 0.4
                }}
              >Confirm</button>
              <button
                onClick={() => { setBurnConfirm(false); setBurnText(''); }}
                style={styles.burnCancelBtn}
              >Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div style={styles.mainContent}>
        {/* Left: Timeline + drop zone */}
        <div style={{
          ...styles.leftPanel,
          flex: selectedDoc ? '1 1 60%' : '1 1 100%'
        }}>
          {/* Drop zone */}
          <div style={styles.dropArea}>
            <DropZone onIngest={handleIngest} isIngesting={isIngesting} />
          </div>

          {/* Ingest results toast */}
          {ingestResults && (
            <div style={styles.ingestResults}>
              {ingestResults.success ? (
                <>
                  <span style={styles.successText}>
                    {'\u2713'} {ingestResults.documents?.length || 0} file(s) ingested
                  </span>
                  {ingestResults.errors?.length > 0 && (
                    <span style={styles.errorText}>
                      {ingestResults.errors.length} error(s):{' '}
                      {ingestResults.errors.map(e => e.error).join(', ')}
                    </span>
                  )}
                </>
              ) : (
                <span style={styles.errorText}>Error: {ingestResults.error}</span>
              )}
              <button
                onClick={() => setIngestResults(null)}
                style={styles.dismissBtn}
              >{'\u2715'}</button>
            </div>
          )}

          {/* Timeline */}
          <div style={styles.timelineArea}>
            <Timeline
              key={timelineKey}
              onSelectDocument={handleSelectDocument}
            />
          </div>
        </div>

        {/* Right: Document detail */}
        {selectedDoc && (
          <div style={styles.rightPanel}>
            <DocumentDetail
              docSummary={selectedDoc}
              onClose={handleCloseDetail}
              onUpdate={handleDocUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  loadingScreen: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1a2e',
    color: '#f5f0eb'
  },
  fullScreen: {
    height: '100vh',
    background: '#1a1a2e',
    color: '#f5f0eb'
  },
  appContainer: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a2e',
    color: '#f5f0eb'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#151528',
    borderBottom: '1px solid #2a2a4a',
    WebkitAppRegion: 'drag',
    minHeight: '44px'
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    WebkitAppRegion: 'no-drag'
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  caseName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f5f0eb'
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    WebkitAppRegion: 'no-drag'
  },
  lockBtn: {
    background: '#333',
    color: '#ccc',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  burnBtn: {
    background: '#dc2626',
    color: 'white',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  burnConfirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  burnWarning: {
    color: '#ef4444',
    fontSize: '12px'
  },
  burnInput: {
    background: '#1a1a2e',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    padding: '4px 8px',
    color: '#f5f0eb',
    fontSize: '12px',
    width: '60px',
    textAlign: 'center'
  },
  burnConfirmBtn: {
    background: '#dc2626',
    color: 'white',
    border: 'none',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  burnCancelBtn: {
    background: '#333',
    color: '#ccc',
    border: 'none',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'flex 0.2s ease'
  },
  dropArea: {
    padding: '12px 16px',
    flexShrink: 0
  },
  ingestResults: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: '#252542',
    borderBottom: '1px solid #2a2a4a',
    fontSize: '13px'
  },
  successText: {
    color: '#22c55e'
  },
  errorText: {
    color: '#ef4444'
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: 'auto',
    padding: '2px 6px'
  },
  timelineArea: {
    flex: 1,
    overflow: 'hidden'
  },
  rightPanel: {
    flex: '0 0 380px',
    overflow: 'hidden'
  }
};
