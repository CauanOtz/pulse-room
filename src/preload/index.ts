import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, UpdateStatus } from '../shared/desktop-api';

const desktopApi: DesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  },
  capture: {
    listScreens: () => ipcRenderer.invoke('capture:list-screens'),
    selectSource: (sourceId) => ipcRenderer.invoke('capture:select-source', sourceId),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
      ipcRenderer.on('updates:status', handler);
      return () => ipcRenderer.removeListener('updates:status', handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
