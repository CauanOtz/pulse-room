import { Compass, Plus, UserRound } from 'lucide-react';
import type { Community } from '../../shared/community';
import { Avatar } from './avatar';
import { cn } from './ui/utils';

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
  onSelect,
  onAdd,
  onAccount,
  showAccount = false,
}: {
  servers?: Community[];
  activeId?: string;
  onSelect?(id: string): void;
  onAdd?(): void;
  onAccount?(): void;
  showAccount?: boolean;
}) {
  const items: RailItem[] =
    servers?.map((s) => ({
      id: s.id,
      label: s.name,
      mark: s.name.slice(0, 2).toUpperCase(),
      iconId: s.iconId,
      active: s.id === activeId,
    })) ?? demoServers.slice(1);
  return (
    <nav className="server-rail flex h-full flex-col items-center gap-2 overflow-y-auto bg-rail py-3" aria-label="Servers">
      <div
        className="brand-mark grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground"
        aria-label="Pulse Room"
      >
        P
      </div>
      <div className="rail-rule my-0.5 h-0.5 w-6 rounded-full bg-border" />
      {items.map((server) => (
        <button
          className={cn(
            'server-button grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-xs font-bold text-secondary-foreground transition-all duration-150',
            'hover:rounded-xl hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            server.active && 'is-active rounded-xl bg-primary text-primary-foreground shadow-[-18px_0_0_-15px_var(--foreground)]',
          )}
          key={server.id}
          type="button"
          aria-label={server.label}
          title={server.label}
          aria-current={server.active}
          onClick={() => onSelect?.(server.id)}
        >
          <Avatar className="server-picture" name={server.label} initials={server.mark} imageId={server.iconId} />
        </button>
      ))}
      <button className="server-button server-action grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-success transition-all duration-150 hover:rounded-xl hover:bg-success hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" aria-label="Add server" onClick={onAdd}>
        <Plus size={20} />
      </button>
      {servers === undefined && (
        <button className="server-button server-action grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-success transition-all duration-150 hover:rounded-xl hover:bg-success hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" aria-label="Explore servers">
          <Compass size={19} />
        </button>
      )}
      {/* Only where there is no profile bar to hold it: the account lives there. */}
      {onAccount && showAccount && (
        <button
          className="server-button account-rail-button mt-auto grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition-all duration-150 hover:rounded-xl hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Your account"
          aria-label="Your account"
          onClick={onAccount}
        >
          <UserRound size={20} />
        </button>
      )}
    </nav>
  );
}
