import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './styles/ThemeContext';
import App from './App';

// Allow drops by preventing default dragover (required for drop events to fire in Chromium).
document.addEventListener('dragover', (e) => e.preventDefault());

const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
