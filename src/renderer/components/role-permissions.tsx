import {
  Eye,
  Hash,
  Link,
  MessageSquare,
  MessagesSquare,
  Settings,
  ShieldHalf,
  SlidersHorizontal,
  Users,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import {
  administratorInfo,
  has,
  Permission,
  permissionGroups,
  type PermissionInfo,
} from '../../shared/permissions';
import type { Role } from '../../shared/community';
import { Switch } from './ui/switch';

const all = permissionGroups.flatMap((group) => group.items);
const items = (...flags: number[]) =>
  flags.map((flag) => all.find((item) => item.flag === flag)!).filter(Boolean);
export const rolePermissionCategories = [
  {
    id: 'general',
    label: 'General',
    title: 'General permissions',
    hint: 'Basic permissions that apply across the server.',
    icon: Settings,
    items: items(
      Permission.ViewChannels,
      Permission.SendMessages,
      Permission.CreateInvites,
      Permission.ManageMessages,
    ),
  },
  {
    id: 'text',
    label: 'Text channels',
    title: 'Text channel permissions',
    hint: 'Control conversations in text channels.',
    icon: Hash,
    items: items(Permission.SendMessages, Permission.ManageMessages),
  },
  {
    id: 'voice',
    label: 'Voice channels',
    title: 'Voice channel permissions',
    hint: 'Joining, speaking and managing voice conversations.',
    icon: Volume2,
    items: permissionGroups.find((group) => group.title === 'Voice')!.items,
  },
  {
    id: 'members',
    label: 'Members',
    title: 'Member permissions',
    hint: 'Control who can moderate the community.',
    icon: Users,
    items: items(Permission.KickMembers, Permission.BanMembers, Permission.TimeoutMembers),
  },
  {
    id: 'management',
    label: 'Server management',
    title: 'Server management',
    hint: 'Manage the server, its channels, roles and tags.',
    icon: ShieldHalf,
    items: permissionGroups.find((group) => group.title === 'Management')!.items,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    title: 'Advanced permissions',
    hint: 'Powerful access that bypasses channel restrictions.',
    icon: SlidersHorizontal,
    items: [administratorInfo],
  },
] as const;
const icons: Record<number, LucideIcon> = {
  [Permission.ViewChannels]: Eye,
  [Permission.SendMessages]: MessageSquare,
  [Permission.CreateInvites]: Link,
  [Permission.ManageMessages]: MessagesSquare,
};

export function RolePermissions({
  value,
  roles,
  role,
  category,
  onCategory,
  editable,
  grantable,
  busy,
  onToggle,
  onSelectAll,
}: {
  value: number;
  roles: readonly Role[];
  role: Role;
  category: string;
  onCategory(id: string): void;
  editable: boolean;
  grantable(flag: number): boolean;
  busy: boolean;
  onToggle(flag: number, value: boolean): void;
  onSelectAll(flags: number[]): void;
}) {
  const categories = rolePermissionCategories.filter((entry) => !role.isDefault || entry.id !== 'advanced');
  const active = categories.find((entry) => entry.id === category) ?? categories[0];
  const inherited = roles.find((entry) => entry.isDefault)?.permissions ?? 0;
  const administrator = has(value, Permission.Administrator);
  const available = active.items.filter(
    (item) => editable && grantable(item.flag) && (!administrator || item.flag === Permission.Administrator),
  );
  const complete = available.length > 0 && available.every((item) => has(value, item.flag));
  return (
    <div className="role-permission-workspace">
      <nav className="role-permission-nav" aria-label="Permission categories">
        {categories.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={active.id === entry.id}
              onClick={() => onCategory(entry.id)}
            >
              <Icon size={18} />
              {entry.label}
            </button>
          );
        })}
      </nav>
      <section className="role-permission-category" aria-label={active.title}>
        <header>
          <div>
            <h4>{active.title}</h4>
            <p>{active.hint}</p>
          </div>
          <button
            type="button"
            className="role-secondary-button"
            disabled={busy || !available.length || complete}
            onClick={() => onSelectAll(available.map((item) => item.flag))}
          >
            Select all
          </button>
        </header>
        <div className="role-permission-rows">
          {active.items.map((item: PermissionInfo) => {
            const Icon = icons[item.flag] ?? active.icon;
            const fromEveryone = !role.isDefault && has(inherited, item.flag) && !has(value, item.flag);
            return (
              <div className="role-permission-row" key={item.flag}>
                <span className="permission-row-icon">
                  <Icon size={19} />
                </span>
                <label htmlFor={`role-permission-${item.name}`}>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                  {fromEveryone && <em>Inherited from @everyone</em>}
                  {administrator && item.flag !== Permission.Administrator && (
                    <em>Granted by Administrator</em>
                  )}
                  {!grantable(item.flag) && <em>You cannot grant a permission you do not hold.</em>}
                </label>
                <Switch
                  id={`role-permission-${item.name}`}
                  aria-label={item.label}
                  checked={has(value, item.flag)}
                  disabled={
                    busy ||
                    !editable ||
                    !grantable(item.flag) ||
                    (administrator && item.flag !== Permission.Administrator)
                  }
                  onCheckedChange={(on) => onToggle(item.flag, on)}
                />
              </div>
            );
          })}
        </div>
        <p className="role-permission-footnote">
          Roles add permissions to @everyone. Channel and category overrides are configured in their own
          settings.
        </p>
      </section>
    </div>
  );
}
