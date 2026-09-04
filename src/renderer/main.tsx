import '@fontsource-variable/manrope';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { CommunityRoot } from './community-root';
import { installTheme } from './components/theme-toggle';
import './theme.css';
import './styles.css';

installTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.VITE_API_URL ? <CommunityRoot apiUrl={import.meta.env.VITE_API_URL} /> : <App />}
  </React.StrictMode>,
);
