import React, { useState, useEffect } from 'react';
import Unlock from './pages/Unlock';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: '#f5f0eb'
      }}>
        Loading...
      </div>
    );
  }

  if (!isUnlocked) {
    return <Unlock onUnlock={handleUnlock} />;
  }

  // Placeholder for main app - will be built in Session 1
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a1a2e',
      color: '#f5f0eb',
      gap: '20px'
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 300 }}>Litigation Locker</h1>
      <p style={{ color: '#888' }}>Vault unlocked. Main interface coming in Session 1.</p>

      {!burnConfirm ? (
        <button
          onClick={() => setBurnConfirm(true)}
          style={{
            background: '#dc2626',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          BURN
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <p style={{ color: '#ef4444', fontSize: '14px' }}>Type BURN to confirm destruction of all data:</p>
          <input
            type="text"
            value={burnText}
            onChange={(e) => setBurnText(e.target.value)}
            style={{
              background: '#1a1a2e',
              border: '1px solid #dc2626',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '16px',
              color: '#f5f0eb',
              outline: 'none',
              textAlign: 'center',
              width: '200px'
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => { setBurnConfirm(false); setBurnText(''); }}
              style={{
                background: '#333',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (burnText === 'BURN') {
                  try {
                    await window.api.burn.execute('all');
                  } catch (err) {
                    console.error('Burn error:', err);
                  }
                  setIsUnlocked(false);
                }
              }}
              disabled={burnText !== 'BURN'}
              style={{
                background: burnText === 'BURN' ? '#dc2626' : '#555',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: burnText === 'BURN' ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Confirm BURN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
