import { useState } from 'react';
import { MoreHorizontal, Search, UserPlus, Users, X } from 'lucide-react';
import type { CommunityDetail, Role } from '../../shared/community';
import { has } from '../../shared/permissions';
import { myAccess, outranks } from '../domain/access';
import { Avatar } from './avatar';
import { Modal } from './modal';
import { RoleMark } from './role-appearance';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

export function RoleMembers({
  detail,
  role,
  userId,
  editable,
  busy,
  operationError,
  onChange,
}: {
  detail: CommunityDetail;
  role: Role;
  userId: string;
  editable: boolean;
  busy: boolean;
  operationError?: string;
  onChange(add: string[], remove: string[]): Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [addError, setAddError] = useState('');
  const access = myAccess(detail, userId);
  const mayAct = (member: CommunityDetail['members'][number]) =>
    member.id === userId || access.isOwner || outranks(access, detail, member, userId);
  const members = detail.members.filter((member) => role.isDefault || member.roleIds?.includes(role.id));
  const match = (member: CommunityDetail['members'][number], value: string) =>
    `${member.displayName} ${member.username}`.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase());
  const canGrant = access.isAdministrator || has(access.permissions, role.permissions);
  const candidates = detail.members.filter((member) => !member.roleIds?.includes(role.id) && mayAct(member));
  return (
    <section className="role-members-workspace" aria-label="Role members">
      <header>
        <div>
          <h4>
            Members <span>{members.length}</span>
          </h4>
          <p>
            {role.isDefault
              ? 'Everyone in the server holds this role automatically.'
              : 'People who hold this role in your server.'}
          </p>
        </div>
        {!role.isDefault && editable && (
          <button
            type="button"
            className="role-secondary-button"
            disabled={busy || !canGrant || !candidates.length}
            onClick={() => {
              setPicked([]);
              setSearch('');
              setAddError('');
              setAdding(true);
            }}
          >
            <UserPlus size={16} />
            Add members
          </button>
        )}
      </header>
      <label className="role-search">
        <Search size={16} />
        <input
          aria-label="Search role members"
          placeholder="Search members…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {members.filter((member) => match(member, query)).length ? (
        <ul className="role-members-list">
          {members
            .filter((member) => match(member, query))
            .map((member) => (
              <li key={member.id}>
                <Avatar name={member.displayName} imageId={member.avatarId} className="role-member-avatar" />
                <div className="role-member-name">
                  <strong>
                    {member.displayName}
                    {member.id === userId && <small> (you)</small>}
                  </strong>
                  <span>@{member.username}</span>
                </div>
                <span className="role-member-badge">
                  <RoleMark role={role} />
                  {role.name}
                </span>
                <span className="role-member-state">
                  {member.timeoutUntil ? 'Timed out' : member.role === 'owner' ? 'Owner' : 'Member'}
                </span>
                {!role.isDefault && editable && mayAct(member) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${member.displayName}`}
                        disabled={busy}
                        className="role-icon-button"
                      >
                        <MoreHorizontal size={19} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void onChange([], [member.id])}>
                        <X size={15} />
                        Remove {member.displayName} from {role.name}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
        </ul>
      ) : (
        <div className="role-empty-state">
          <Users size={25} />
          <strong>{query ? 'No matching members' : 'Nobody holds this role yet'}</strong>
          <p>{query ? 'Try another name or username.' : 'Add people from your server to get started.'}</p>
        </div>
      )}
      {adding && (
        <Modal
          title={`Add members to ${role.name}`}
          onClose={() => !busy && setAdding(false)}
          contentClassName="role-add-members-modal"
        >
          <label className="role-search">
            <Search size={16} />
            <input
              aria-label="Search members to add"
              placeholder="Search members…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="role-member-candidates">
            {candidates
              .filter((member) => match(member, search))
              .map((member) => (
                <label key={member.id} className="role-member-candidate">
                  <input
                    type="checkbox"
                    checked={picked.includes(member.id)}
                    disabled={busy}
                    onChange={(event) =>
                      setPicked((current) =>
                        event.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id),
                      )
                    }
                  />
                  <Avatar
                    name={member.displayName}
                    imageId={member.avatarId}
                    className="role-member-avatar"
                  />
                  <span>
                    <strong>{member.displayName}</strong>
                    <small>@{member.username}</small>
                  </span>
                </label>
              ))}
            {!candidates.some((member) => match(member, search)) && (
              <p className="role-empty-caption">No matching members.</p>
            )}
          </div>
          {addError && (
            <p className="role-error" role="alert">
              {operationError || addError}
            </p>
          )}
          <footer>
            <span>{picked.length} selected</span>
            <button
              type="button"
              className="role-secondary-button"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="role-primary-button"
              disabled={busy || !picked.length}
              onClick={() => {
                setAddError('');
                void onChange(picked, []).then((success) =>
                  success
                    ? setAdding(false)
                    : setAddError('Could not add these members. Your selection is preserved. Try again.'),
                );
              }}
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
