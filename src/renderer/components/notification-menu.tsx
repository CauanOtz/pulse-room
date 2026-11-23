import { motion } from 'motion/react';
import { AtSign, Bell, BellOff, BellRing, Check, MessagesSquare } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { levelOf, type NotifyLevel } from '../domain/notifications';
import { RoomSoundPlayer } from '../infrastructure/media/room-sound-player';
import { useNotificationStore } from '../infrastructure/notification-store';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Switch } from './ui/switch';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

const sample = new RoomSoundPlayer();

const levels: { level: NotifyLevel; title: string; detail: string; icon: ReactNode }[] = [
  {
    level: 'all',
    title: 'All messages',
    detail: 'Every message in the channels you can read.',
    icon: <MessagesSquare size={15} />,
  },
  {
    level: 'mentions',
    title: 'Only @mentions',
    detail: 'When somebody writes your name with @.',
    icon: <AtSign size={15} />,
  },
  {
    level: 'nothing',
    title: 'Nothing',
    detail: 'No notifications and no badges from here.',
    icon: <BellOff size={15} />,
  },
];

const bellOf: Record<NotifyLevel, ReactNode> = {
  all: <BellRing size={15} />,
  mentions: <Bell size={15} />,
  nothing: <BellOff size={15} />,
};

/**
 * How loud a server is allowed to be, beside its name: everything, mentions,
 * or nothing. Below, what this computer does with a notification at all.
 */
export function NotificationMenu({ serverId, serverName }: { serverId: string; serverName?: string }) {
  const store = useNotificationStore();
  const settings = store.settings;
  const level = levelOf(settings, serverId);
  const ids = useId();

  return (
    <Popover>
      <Tooltip label="Notification settings">
        <PopoverTrigger asChild>
          <button
            className="server-notify"
            type="button"
            aria-label="Notification settings"
            data-level={level}
          >
            {bellOf[level]}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="notification-menu w-[22rem] p-0">
        <header className="notification-menu-head">
          <h3>Notifications</h3>
          <p>{serverName ?? 'This server'}</p>
        </header>
        <div
          className="notification-levels"
          role="radiogroup"
          aria-label={`Notify me about ${serverName ?? 'this server'}`}
        >
          {levels.map((option) => {
            const chosen = option.level === level;
            return (
              <button
                key={option.level}
                type="button"
                role="radio"
                aria-checked={chosen}
                className={cn('notification-level', chosen && 'is-chosen')}
                onClick={() => store.setLevel(serverId, option.level)}
              >
                {chosen && (
                  <motion.span
                    layoutId={`${ids}-level`}
                    className="notification-level-highlight"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="notification-level-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="notification-level-text">
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                </span>
                <span className="notification-level-check" aria-hidden="true">
                  {chosen && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 24 }}
                    >
                      <Check size={13} strokeWidth={2.6} />
                    </motion.span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <section className="notification-device" aria-label="On this computer">
          <h4>On this computer</h4>
          <Toggle
            label="Desktop notifications"
            detail="Shown by Windows, even with the window closed to the tray."
            checked={settings.desktop}
            onChange={(desktop) => store.update({ desktop })}
          />
          <Toggle
            label="Sound"
            detail="A short chime; a mention rings higher."
            checked={settings.sound}
            onChange={(sound) => {
              store.update({ sound });
              if (sound) sample.play('mention');
            }}
          />
          <Toggle
            label="Direct messages"
            detail="Always, whatever the servers are set to."
            checked={settings.directs}
            onChange={(directs) => store.update({ directs })}
          />
          <button
            type="button"
            className="notification-test"
            onClick={() => {
              if (settings.sound) sample.play('mention');
              void window.desktop?.notifications
                ?.show({
                  title: 'Pulse Room',
                  body: 'Notifications are on. This is how a mention will look.',
                  tag: 'test',
                })
                .catch(() => undefined);
            }}
          >
            Send a test notification
          </button>
        </section>
      </PopoverContent>
    </Popover>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const id = useId();
  return (
    <div className="notification-toggle">
      <label htmlFor={id}>
        <strong>{label}</strong>
        <small>{detail}</small>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
