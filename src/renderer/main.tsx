import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400-italic.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { CommunityRoot } from './community-root';
import { installTheme } from './components/theme';
import { installRangeProgress } from './components/range-progress';
import { TooltipProvider } from './components/ui/tooltip';
import { UpdateScreen } from './components/update-screen';
import { installOpusFrameSize } from './infrastructure/media/opus-frame-size';
import './theme.css';

installTheme();
// Sliders paint the stretch before their thumb from a value kept in CSS.
installRangeProgress();
// Before anything opens a connection: the rewrite has to be in place by the
// time LiveKit is handed its first answer.
installOpusFrameSize();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      {import.meta.env.VITE_API_URL ? <CommunityRoot apiUrl={import.meta.env.VITE_API_URL} /> : <App />}
      <UpdateScreen />
    </TooltipProvider>
  </React.StrictMode>,
);
