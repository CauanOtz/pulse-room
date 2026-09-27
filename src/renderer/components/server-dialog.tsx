import { useEffect, useState, type ReactNode } from 'react';
import { Ban as BanIcon, Check, Copy, Plus, Settings, ShieldHalf, Tag, Ticket, Trash2, Users, type LucideIcon } from 'lucide-react';
import type { Account, CommunityDetail, CommunityInvite } from '../../shared/community';
import { Permission } from '../../shared/permissions';
import { myAccess } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { BanList, MemberManager } from './member-manager';
import { SettingsHeading, SettingsNavButton, SettingsScreen } from './settings-screen';
import { Modal } from './modal';
import { PictureField } from './picture-field';
import { RoleEditor } from './role-editor';
import { TagManager } from './tag-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const primaryClass =
  'primary-action inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

type Section = 'server' | 'members' | 'roles' | 'tags' | 'invites' | 'bans';

const meta: Record<Section, { label: string; icon: LucideIcon; title: string; description: string }> = {
  server: {
    label: 'Server',
    icon: Settings,
    title: 'Server',
    description: 'The name and picture everybody sees in their sidebar.',
  },
  members: {
    label: 'Members',
    icon: Users,
    title: 'Members',
    description: 'Who belongs here, the roles they hold, and what can be done about them.',
  },
  roles: {
    label: 'Roles',
    icon: ShieldHalf,
    title: 'Roles',
    description: 'Control what members can do in this server.',
  },
  tags: {
    label: 'Tags',
    icon: Tag,
    title: 'Server tags',
    description: 'Small identities members can display beside their names.',
  },
  invites: {
    label: 'Invites',
    icon: Ticket,
    title: 'Invites',
    description: 'Create temporary access codes and revoke them whenever you need.',
  },
  bans: {
    label: 'Bans',
    icon: BanIcon,
    title: 'Bans',
    description: 'People refused at every invitation until the ban is lifted.',
  },
};

/**
 * Everything about a server, one section at a time, and only the sections the
 * person opening it can use: the service would refuse the rest anyway.
 */
export function ServerDialog({
  api,
  user,
  detail,
  onClose,
  onChanged,
  onRemoved,
}: {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  onClose(): void;
  onChanged(): Promise<void>;
  onRemoved(): void;
}) {
  const access = myAccess(detail, user.id);
  const sections = (Object.keys(meta) as Section[]).filter(
    (section) =>
      ({
        server: access.can(Permission.ManageServer),
        members: true,
        roles: access.can(Permission.ManageRoles),
        tags: access.can(Permission.ManageTags) || (detail.tags?.length ?? 0) > 0,
        invites: access.can(Permission.CreateInvites) || access.can(Permission.ManageServer),
        bans: access.can(Permission.BanMembers),
      })[section],
  );
  const [section, setSection] = useState<Section>('members');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/api/servers/${detail.server.id}`;
  const current = meta[sections.includes(section) ? section : 'members'];

  const requestRemoval = () =>
    setConfirmation({
      title: access.isOwner ? 'Delete server' : 'Leave server',
      description: access.isOwner
        ? `Permanently delete ${detail.server.name}, its channels and every message in them? This cannot be undone.`
        : `Leave ${detail.server.name}? You will need a new invitation to return.`,
      confirmLabel: access.isOwner ? 'Delete' : 'Leave',
      tone: 'danger',
      action: async () => {
        await api.request(access.isOwner ? base : `${base}/members/${user.id}`, 'DELETE');
        onRemoved();
      },
    });

  return (
    <SettingsScreen
      title={detail.server.name}
      onClose={onClose}
      nav={
        <nav className="flex flex-col gap-0.5" aria-label="Server settings sections">
          {sections.map((id) => (
            <SettingsNavButton
              key={id}
              icon={meta[id].icon}
              label={meta[id].label}
              active={current === meta[id]}
              onClick={() => setSection(id)}
            >
              {id === 'members' && (
                <span className="font-mono text-[10px] text-muted-foreground">{detail.members.length}</span>
              )}
            </SettingsNavButton>
          ))}
        </nav>
      }
      footer={
        <SettingsNavButton
          icon={Trash2}
          label={access.isOwner ? 'Delete server' : 'Leave server'}
          tone="danger"
          onClick={requestRemoval}
        />
      }
    >
      <SettingsHeading title={current.title} description={current.description} />
      <div className="server-workspace-content space-y-6">
        {current === meta.server && <ServerIdentity api={api} detail={detail} onChanged={onChanged} />}
        {current === meta.members && <MemberManager api={api} detail={detail} userId={user.id} onChanged={onChanged} />}
        {current === meta.roles && <RoleEditor api={api} detail={detail} userId={user.id} onChanged={onChanged} />}
        {current === meta.tags && <TagManager api={api} detail={detail} userId={user.id} onChanged={onChanged} />}
        {current === meta.invites && (
          <Invites
            api={api}
            serverId={detail.server.id}
            canList={access.can(Permission.ManageServer)}
            canCreate={access.can(Permission.CreateInvites)}
          />
        )}
        {current === meta.bans && <BanList api={api} serverId={detail.server.id} />}
        {error && (
          <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => {
            setBusy(true);
            setError('');
            void confirmation
              .action()
              .catch((e) => setError(errorMessage(e)))
              .finally(() => {
                setBusy(false);
                setConfirmation(undefined);
              });
          }}
        />
      )}
    </SettingsScreen>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ServerIdentity({
  api,
  detail,
  onChanged,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  onChanged(): Promise<void>;
}) {
  const base = `/api/servers/${detail.server.id}`;
  const [name, setName] = useState(detail.server.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <div className="max-w-2xl space-y-4">
      <PictureField
        name={detail.server.name}
        imageId={detail.server.iconId}
        label="Server picture"
        kind="icon"
        canEdit
        onChoose={async (image) => {
          await api.upload(`${base}/icon`, image);
          await onChanged();
        }}
        onRemove={async () => {
          await api.request(`${base}/icon`, 'DELETE');
          await onChanged();
        }}
      />
      <Panel title="Display name" hint="This is how the server appears in every member's sidebar.">
        <form
          className="flex flex-row items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setMessage('');
            void api
              .request(base, 'PATCH', { name })
              .then(onChanged)
              .then(() => setMessage('Name saved.'))
              .catch((e) => setMessage(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="min-w-0 flex-1">
            Server name
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className={primaryClass} disabled={busy}>
            Rename server
          </button>
        </form>
        {message && (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </Panel>
    </div>
  );
}

function Invites({
  api,
  serverId,
  canList,
  canCreate,
}: {
  api: CommunityClient;
  serverId: string;
  canList: boolean;
  canCreate: boolean;
}) {
  const base = `/api/servers/${serverId}`;
  const [invites, setInvites] = useState<CommunityInvite[]>([]);
  const [code, setCode] = useState('');
  const [hours, setHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    if (canList) setInvites((await api.request<{ invites: CommunityInvite[] }>(`${base}/invites`)).invites);
  };
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, [serverId, canList]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="max-w-2xl space-y-6">
      {canCreate && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Only share a code with people you want in this server.</p>
          <button
            type="button"
            className={primaryClass}
            onClick={() => {
              setCode('');
              setCopied(false);
              setError('');
              setCreating(true);
            }}
          >
            <Plus className="size-4" /> Create invite
          </button>
        </div>
      )}
      {creating && (
        // Made in a dialog, where the code it produces is shown and copied
        // before going back to the list it has joined.
        <Modal title="Create invite" onClose={() => setCreating(false)} contentClassName="w-[min(28rem,calc(100vw-2rem))]">
          {code ? (
            <div className="space-y-3">
              <label>
                Invite code — copy and share
                <textarea className="font-mono text-xs" readOnly value={code} onFocus={(event) => event.target.select()} />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(code)
                      .then(() => setCopied(true))
                      .catch(() => undefined)
                  }
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className={primaryClass} onClick={() => setCreating(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                  <span id="invite-expiry">Expires in</span>
                  <Select value={String(hours)} onValueChange={(value) => setHours(Number(value))}>
                    <SelectTrigger aria-labelledby="invite-expiry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label>
                  Maximum uses
                  <input type="number" min={1} max={100} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
                </label>
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={primaryClass}
                  onClick={() =>
                    void run(async () =>
                      setCode((await api.request<{ code: string }>(`${base}/invites`, 'POST', { hours, maxUses })).code),
                    )
                  }
                >
                  Generate invite
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {canList && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Active invitations</h3>
            <span className="font-mono text-[10px] text-muted-foreground">{invites.length}</span>
          </div>
          {invites.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/35">
              {invites.map((invite) => (
                <div className="member-row flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-sm" key={invite.id}>
                  <span className="flex min-w-0 flex-col">
                    <strong className="font-medium text-foreground">
                      {invite.uses} of {invite.maxUses} uses
                    </strong>
                    <small className="text-xs text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleString()}</small>
                  </span>
                  <button
                    className="ml-auto rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => void run(() => api.request(`${base}/invites/${invite.id}`, 'DELETE'))}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No active invitation codes.
            </div>
          )}
        </section>
      )}
      {error && (
        <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
