import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, UpdateStatus } from '../shared/desktop-api';
import type { ShortcutAction } from '../shared/shortcuts';

const desktopApi: DesktopApi = {
  session: {
    read: () => ipcRenderer.invoke('session:read'),
    save: (token) => ipcRenderer.invoke('session:save', token),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  },
  capture: {
    listScreens: () => ipcRenderer.invoke('capture:list-screens'),
    selectSource: (sourceId) => ipcRenderer.invoke('capture:select-source', sourceId),
  },
  shortcuts: {
    setGlobal: (enabled) => ipcRenderer.invoke('shortcuts:set-global', enabled),
    onTrigger: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, action: ShortcutAction) => listener(action);
      ipcRenderer.on('shortcuts:trigger', handler);
      return () => ipcRenderer.removeListener('shortcuts:trigger', handler);
    },
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    current: () => ipcRenderer.invoke('updates:current'),
    finished: () => ipcRenderer.invoke('updates:finished'),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
      ipcRenderer.on('updates:status', handler);
      return () => ipcRenderer.removeListener('updates:status', handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
