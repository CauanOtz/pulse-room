import '@fontsource-variable/manrope';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { CommunityRoot } from './community-root';
import { installTheme } from './components/theme';
import { TooltipProvider } from './components/ui/tooltip';
import './theme.css';

installTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      {import.meta.env.VITE_API_URL ? <CommunityRoot apiUrl={import.meta.env.VITE_API_URL} /> : <App />}
    </TooltipProvider>
  </React.StrictMode>,
);
