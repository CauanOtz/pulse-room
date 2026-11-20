import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Globe } from 'lucide-react';
import { shortcuts, type ShortcutAction } from '../../shared/shortcuts';
import { Modal } from './modal';
import { Switch } from './ui/switch';

const globalKey = 'pulse-room:global-shortcuts';

export function readGlobalShortcuts(): boolean {
  try {
    return window.localStorage.getItem(globalKey) !== 'off';
  } catch {
    return true;
  }
}

function matches(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split('+');
  const key = parts.at(-1)!;
  const wants = (name: string) => parts.includes(name);
  if (wants('ctrl') !== (event.ctrlKey || event.metaKey)) return false;
  if (wants('shift') !== event.shiftKey) return false;
  if (wants('alt') !== event.altKey) return false;
  return event.key.toLowerCase() === key || event.code.toLowerCase() === `key${key}`;
}

/**
 * Runs the handler for a shortcut, whether it came from the window's own
 * keyboard or from the machine-wide registration made in the main process.
 */
export function useShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>) {
  const current = useRef(handlers);
  current.current = handlers;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const hit = shortcuts.find((shortcut) => matches(event, shortcut.keys));
      const run = hit && current.current[hit.action];
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    const stop = window.desktop?.shortcuts?.onTrigger((action) => current.current[action]?.());
    void window.desktop?.shortcuts?.setGlobal(readGlobalShortcuts()).catch(() => undefined);
    return () => {
      window.removeEventListener('keydown', onKey);
      stop?.();
    };
  }, []);
}

/** Keys drawn as keys. */
export function Keys({ keys }: { keys: string }) {
  return (
    <span className="shortcut-keys">
      {keys.split('+').map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}

/** Every shortcut, and whether mute and deafen reach through to a game. */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const [everywhere, setEverywhere] = useState(readGlobalShortcuts);
  const [taken, setTaken] = useState<ShortcutAction[]>();
  const desktop = Boolean(window.desktop?.shortcuts);

  useEffect(() => {
    void window.desktop?.shortcuts
      ?.setGlobal(everywhere)
      .then(setTaken)
      .catch(() => undefined);
    try {
      window.localStorage.setItem(globalKey, everywhere ? 'on' : 'off');
    } catch {
      // The choice still holds for this session.
    }
  }, [everywhere]);

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} contentClassName="shortcuts-dialog">
      <ul className="shortcut-list">
        {shortcuts.map((shortcut, index) => (
          <motion.li
            key={shortcut.action}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <span>
              {shortcut.label}
              {shortcut.global && everywhere && desktop && (
                <small className={taken && !taken.includes(shortcut.action) ? 'is-taken' : undefined}>
                  <Globe size={11} aria-hidden="true" />
                  {taken && !taken.includes(shortcut.action) ? 'Held by another app' : 'Works in games'}
                </small>
              )}
            </span>
            <Keys keys={shortcut.keys} />
          </motion.li>
        ))}
      </ul>
      {desktop && (
        <label className="shortcut-global">
          <span>
            <strong>Mute and deafen from anywhere</strong>
            <small>Ctrl+Shift+M and Ctrl+Shift+D keep working while a game or another app is in front.</small>
          </span>
          <Switch checked={everywhere} onCheckedChange={setEverywhere} aria-label="Mute and deafen from anywhere" />
        </label>
      )}
    </Modal>
  );
}
