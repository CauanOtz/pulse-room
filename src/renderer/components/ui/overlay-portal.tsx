import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const container = () => document.fullscreenElement ?? document.body;

/** Fullscreen only paints its own descendants, including portalled overlays. */
export function useOverlayContainer() {
  return useSyncExternalStore(subscribe, container);
}
