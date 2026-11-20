/**
 * Every keyboard shortcut, in one list both processes read.
 *
 * `accelerator` is Electron's spelling, used when a shortcut is registered for
 * the whole machine; `keys` is how it is drawn and matched inside the window.
 */
export type ShortcutAction = 'mute' | 'deafen' | 'share' | 'leave' | 'members' | 'settings' | 'help';

export interface Shortcut {
  action: ShortcutAction;
  keys: string;
  label: string;
  /** Works while another window, usually a game, has the keyboard. */
  global?: string;
}

export const shortcuts: Shortcut[] = [
  { action: 'mute', keys: 'Ctrl+Shift+M', label: 'Mute or unmute', global: 'CommandOrControl+Shift+M' },
  { action: 'deafen', keys: 'Ctrl+Shift+D', label: 'Deafen or undeafen', global: 'CommandOrControl+Shift+D' },
  { action: 'share', keys: 'Ctrl+Shift+S', label: 'Share or stop sharing your screen' },
  { action: 'leave', keys: 'Ctrl+Shift+E', label: 'Leave the call' },
  { action: 'members', keys: 'Ctrl+Shift+U', label: 'Show or hide members' },
  { action: 'settings', keys: 'Ctrl+,', label: 'Open settings' },
  { action: 'help', keys: 'Ctrl+/', label: 'Show keyboard shortcuts' },
];

export const keysOf = (action: ShortcutAction): string =>
  shortcuts.find((shortcut) => shortcut.action === action)?.keys ?? '';
