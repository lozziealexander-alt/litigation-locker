import React, { useState, useCallback } from 'react';

export default function DropZone({ onIngest, isIngesting }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCount, setDragCount] = useState(0);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCount(c => c + 1);
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCount(c => {
      const next = c - 1;
      if (next <= 0) setIsDragging(false);
      return Math.max(0, next);
    });
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCount(0);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files.map(f => {
        try {
          return window.api.getPathForFile(f);
        } catch (err) {
          console.warn('[DropZone] getPathForFile fallback for:', f.name, err.message);
          return f.path || '';
        }
      }).filter(Boolean);
      if (paths.length > 0 && onIngest) {
        onIngest(paths);
      }
    }
  }, [onIngest]);

  async function handleBrowse() {
    const result = await window.api.dialog.openFiles();
    if (!result.canceled && result.filePaths.length > 0) {
      onIngest(result.filePaths);
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        ...styles.dropZone,
        borderColor: isDragging ? '#3b82f6' : '#333',
        background: isDragging ? '#3b82f610' : '#252542'
      }}
    >
      {isIngesting ? (
        <div style={styles.content}>
          <div style={styles.spinner} />
          <p style={styles.text}>Processing files...</p>
          <p style={styles.subtext}>Extracting metadata, running OCR, detecting dates</p>
        </div>
      ) : (
        <div style={styles.content}>
          <p style={styles.icon}>{isDragging ? '\uD83D\uDCE5' : '\uD83D\uDCC2'}</p>
          <p style={styles.text}>
            {isDragging ? 'Drop files here' : 'Drag & drop evidence files'}
          </p>
          <p style={styles.subtext}>
            PDFs, emails, images, screenshots, text files
          </p>
          <button onClick={handleBrowse} style={styles.browseBtn}>
            Or browse files
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  dropZone: {
    border: '2px dashed',
    borderRadius: '12px',
    padding: '24px',
    transition: 'all 0.2s ease',
    cursor: 'default'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },
  icon: {
    fontSize: '28px',
    margin: 0
  },
  text: {
    fontSize: '14px',
    color: '#f5f0eb',
    margin: 0,
    fontWeight: 500
  },
  subtext: {
    fontSize: '12px',
    color: '#666',
    margin: 0
  },
  browseBtn: {
    marginTop: '8px',
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #333',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};
