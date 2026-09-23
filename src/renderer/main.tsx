import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/jetbrains-mono';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { CommunityRoot } from './community-root';
import { installTheme } from './components/theme';
import { TooltipProvider } from './components/ui/tooltip';
import { installOpusFrameSize } from './infrastructure/media/opus-frame-size';
import './theme.css';

installTheme();
// Before anything opens a connection: the rewrite has to be in place by the
// time LiveKit is handed its first answer.
installOpusFrameSize();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      {import.meta.env.VITE_API_URL ? <CommunityRoot apiUrl={import.meta.env.VITE_API_URL} /> : <App />}
    </TooltipProvider>
  </React.StrictMode>,
);
