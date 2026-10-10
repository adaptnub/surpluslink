import React from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled from npm, so the app works fully offline.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
