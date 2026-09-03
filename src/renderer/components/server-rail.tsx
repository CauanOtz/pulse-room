import { Compass, Plus } from 'lucide-react';

const servers = [
  { id: 'home', label: 'Pulse Room', mark: 'P', active: true },
  { id: 'after-hours', label: 'After hours', mark: 'AH' },
  { id: 'squad', label: 'Night squad', mark: 'NS' },
];

export function ServerRail() {
  return (
    <nav className="server-rail" aria-label="Servers">
      <div className="brand-mark" aria-label="Pulse Room">P</div>
      <div className="rail-rule" />
      {servers.slice(1).map((server) => (
        <button
          className={`server-button${server.active ? ' is-active' : ''}`}
          key={server.id}
          type="button"
          aria-label={server.label}
        >
          {server.mark}
        </button>
      ))}
      <button className="server-button server-action" type="button" aria-label="Add server">
        <Plus size={20} />
      </button>
      <button className="server-button server-action" type="button" aria-label="Explore servers">
        <Compass size={19} />
      </button>
    </nav>
  );
}
