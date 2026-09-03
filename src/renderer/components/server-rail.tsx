import { Compass, Plus, UserRound } from 'lucide-react';
import type { Community } from '../../shared/community';

const demoServers = [
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
}: {
  servers?: Community[];
  activeId?: string;
  onSelect?(id: string): void;
  onAdd?(): void;
  onAccount?(): void;
}) {
  const items =
    servers?.map((s) => ({
      id: s.id,
      label: s.name,
      mark: s.name.slice(0, 2).toUpperCase(),
      active: s.id === activeId,
    })) ?? demoServers.slice(1);
  return (
    <nav className="server-rail" aria-label="Servers">
      <div className="brand-mark" aria-label="Pulse Room">
        P
      </div>
      <div className="rail-rule" />
      {items.map((server) => (
        <button
          className={`server-button${server.active ? ' is-active' : ''}`}
          key={server.id}
          type="button"
          aria-label={server.label}
          title={server.label}
          aria-current={server.active}
          onClick={() => onSelect?.(server.id)}
        >
          {server.mark}
        </button>
      ))}
      <button className="server-button server-action" type="button" aria-label="Add server" onClick={onAdd}>
        <Plus size={20} />
      </button>
      {servers === undefined && (
        <button className="server-button server-action" type="button" aria-label="Explore servers">
          <Compass size={19} />
        </button>
      )}
      {onAccount && (
        <button
          className="server-button account-rail-button"
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
