import { ArrowDownToLine, Compass, MessageCircle, Plus, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import appIconUrl from '../../../assets/app-icon.png';
import type { Community } from '../../shared/community';
import { Avatar } from './avatar';
import { ServerPresenceCard, type PresenceReader } from './server-presence-card';
import { cn } from './ui/utils';
import { useNotificationStore } from '../infrastructure/notification-store';
import { Tooltip } from './ui/tooltip';
import { usePendingUpdate } from './update-prompt';
import { updateFlow } from './update-screen';

interface RailItem {
  id: string;
  label: string;
  mark: string;
  iconId?: string | null;
  active?: boolean;
}

const demoServers: RailItem[] = [
  { id: 'home', label: 'Pulse Room', mark: 'P', active: true },
  { id: 'after-hours', label: 'After hours', mark: 'AH' },
  { id: 'squad', label: 'Night squad', mark: 'NS' },
];

export function ServerRail({
  servers,
  activeId,
  loadingId,
  onSelect,
  onAdd,
  onAccount,
  showAccount = false,
  directsUnread = 0,
  directsActive = false,
  onDirects,
  readPresence,
}: {
  servers?: Community[];
  activeId?: string;
  /** A server already chosen whose room is still on its way. */
  loadingId?: string;
  onSelect?(id: string): void;
  onAdd?(): void;
  onAccount?(): void;
  showAccount?: boolean;
  /** Messages waiting in direct conversations. */
  directsUnread?: number;
  directsActive?: boolean;
  /** Absent where there are no direct messages to open. */
  onDirects?(): void;
  /** Who is in voice in a server; without it the icons show only their name. */
  readPresence?: PresenceReader;
}) {
  const notifications = useNotificationStore();
  const items: RailItem[] =
    servers?.map((s) => ({
      id: s.id,
      label: s.name,
      mark: s.name.slice(0, 2).toUpperCase(),
      iconId: s.iconId,
      active: s.id === activeId,
    })) ?? demoServers.slice(1);
  return (
    <nav
      className="server-rail flex h-full flex-col items-center gap-1.5 overflow-y-auto border-r border-border/70 bg-rail py-2.5"
      aria-label="Servers"
    >
      <div
        className="brand-mark grid size-9.5 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-secondary shadow-[var(--gloss)]"
        aria-label="Pulse Room"
      >
        <img aria-hidden="true" className="size-full object-contain" src={appIconUrl} />
      </div>
      {onDirects && (
        <button
          className={cn(
            'server-button direct-button grid size-9.5 shrink-0 place-items-center',
            directsActive && 'is-active',
          )}
          type="button"
          aria-label={directsUnread ? `Direct messages, ${directsUnread} unread` : 'Direct messages'}
          title="Direct messages"
          aria-current={directsActive || undefined}
          onClick={onDirects}
        >
          {directsActive && (
            <motion.span
              layoutId="server-selection"
              className="server-selection"
              aria-hidden="true"
              transition={{ type: 'spring', stiffness: 480, damping: 36 }}
            />
          )}
          <MessageCircle size={17} aria-hidden="true" />
          {directsUnread > 0 && (
            <motion.b
              key={directsUnread}
              className="direct-badge"
              initial={{ scale: 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              aria-hidden="true"
            >
              {directsUnread > 9 ? '9+' : directsUnread}
            </motion.b>
          )}
        </button>
      )}
      <div className="rail-rule my-1 h-px w-7 bg-border" />
      {items.map((server) => {
        const button = (
          <button
            className={cn(
              'server-button grid size-9.5 shrink-0 place-items-center rounded-[13px] bg-secondary text-[10px] font-bold text-secondary-foreground transition-[border-radius,background-color,color] duration-150',
              'hover:rounded-[10px] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              server.active &&
                'is-active rounded-[10px] bg-accent text-foreground ring-1 ring-inset ring-[rgb(var(--ink)/0.1)]',
              server.id === loadingId && 'is-loading',
            )}
            key={server.id}
            type="button"
            aria-label={
              notifications.mentionsInServer(server.id)
                ? `${server.label}, ${notifications.mentionsInServer(server.id)} mentions`
                : server.label
            }
            title={readPresence ? undefined : server.label}
            aria-current={server.active}
            aria-busy={server.id === loadingId || undefined}
            onClick={() => onSelect?.(server.id)}
          >
            {server.active && (
              <motion.span
                layoutId="server-selection"
                className="server-selection"
                aria-hidden="true"
                transition={{ type: 'spring', stiffness: 480, damping: 36 }}
              />
            )}
            <span className="server-indicator" aria-hidden="true" />
            <Avatar
              className="server-picture size-full overflow-hidden rounded-[inherit]"
              name={server.label}
              initials={server.mark}
              imageId={server.iconId}
            />
            <MentionBadge count={notifications.mentionsInServer(server.id)} />
          </button>
        );
        return readPresence ? (
          <ServerPresenceCard key={server.id} server={server} read={readPresence}>
            {button}
          </ServerPresenceCard>
        ) : (
          button
        );
      })}
      <button
        className="server-button server-action grid size-9.5 shrink-0 place-items-center rounded-[13px] bg-secondary text-muted-foreground transition-[border-radius,background-color,color] duration-150 hover:rounded-[10px] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
        aria-label="Add server"
        onClick={onAdd}
      >
        <Plus size={17} />
      </button>
      {servers === undefined && (
        <button
          className="server-button server-action grid size-9.5 shrink-0 place-items-center rounded-[13px] bg-secondary text-muted-foreground transition-[border-radius,background-color,color] duration-150 hover:rounded-[10px] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          aria-label="Explore servers"
        >
          <Compass size={17} />
        </button>
      )}
      <div className="rail-foot mt-auto flex flex-col items-center gap-1.5">
        <RailUpdate />
        {/* Only where there is no profile bar to hold it: the account lives there. */}
        {onAccount && showAccount && (
          <button
            className="server-button account-rail-button grid size-9.5 shrink-0 place-items-center rounded-[13px] bg-secondary text-secondary-foreground transition-[border-radius,background-color,color] duration-150 hover:rounded-[10px] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Your account"
            aria-label="Your account"
            onClick={onAccount}
          >
            <UserRound size={17} />
          </button>
        )}
      </div>
    </nav>
  );
}

/** Mentions not yet seen in a server, on the corner of its icon. */
function MentionBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <motion.b
      key={count}
      className="direct-badge mention-badge"
      initial={{ scale: 0.3 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 20 }}
      aria-hidden="true"
    >
      {count > 9 ? '9+' : count}
    </motion.b>
  );
}

const ringRadius = 17;
const ringLength = 2 * Math.PI * ringRadius;

/**
 * A newer version, kept quietly at the foot of the rail for anybody who
 * closed the notice or never saw it: an arrow while it downloads, with the
 * download drawn around it, and a small green light once it is ready.
 */
function RailUpdate() {
  const update = usePendingUpdate();
  return (
    <AnimatePresence>
      {update && (
        <motion.span
          key="rail-update"
          className="rail-update-slot"
          initial={{ opacity: 0, scale: 0.6, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          <Tooltip
            side="right"
            label={
              update.ready
                ? `Update ready: v${update.version}. Click to install`
                : `Downloading v${update.version}${update.progress !== undefined ? ` · ${Math.round(update.progress)}%` : ''}`
            }
          >
            <button
              type="button"
              className="server-button rail-update"
              data-ready={update.ready || undefined}
              aria-label={
                update.ready
                  ? `Update to version ${update.version}`
                  : `Version ${update.version} is downloading`
              }
              onClick={() => updateFlow.start()}
            >
              {update.progress !== undefined && (
                <svg className="rail-update-ring" viewBox="0 0 38 38" aria-hidden="true">
                  <circle cx="19" cy="19" r={ringRadius} />
                  <circle
                    className="rail-update-ring-fill"
                    cx="19"
                    cy="19"
                    r={ringRadius}
                    strokeDasharray={ringLength}
                    strokeDashoffset={ringLength * (1 - update.progress / 100)}
                  />
                </svg>
              )}
              <ArrowDownToLine size={16} aria-hidden="true" />
              {update.ready && <span className="rail-update-light" aria-hidden="true" />}
            </button>
          </Tooltip>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
