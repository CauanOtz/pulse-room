import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  tagBadges,
  tagTextPattern,
  type CommunityDetail,
  type ServerTagDefinition,
  type TagBadge,
  type TagMode,
} from '../../shared/community';
import { Permission } from '../../shared/permissions';
import { myAccess } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog } from './confirm-dialog';
import { colourPresets, ColourField } from './profile-editors';
import { badgeIcons, badgeNames, TagChip } from './profile-identity';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const primaryClass =
  'primary-action inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

const modeLabels: Record<TagMode, { title: string; description: string }> = {
  everyone: { title: 'Everyone', description: 'Anybody in the server can wear it.' },
  roles: { title: 'Selected roles', description: 'Members holding one of the roles below can wear it.' },
  assigned: { title: 'Staff assign it', description: 'Only the people staff hand it to can wear it.' },
};

interface Draft {
  text: string;
  badge: TagBadge;
  colour: string;
  name: string;
  mode: TagMode;
  roleIds: string[];
}
const blank: Draft = { text: '', badge: 'spark', colour: colourPresets[0], name: '', mode: 'everyone', roleIds: [] };

/**
 * The small identities a server's members can wear beside their names. A tag
 * grants nothing: who may wear it is the only rule it has.
 */
export function TagManager({
  api,
  detail,
  userId,
  onChanged,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
}) {
  const access = myAccess(detail, userId);
  const tags = detail.tags ?? [];
  const roles = (detail.roles ?? []).filter((role) => !role.isDefault).sort((a, b) => b.position - a.position);
  const [editing, setEditing] = useState<ServerTagDefinition | 'new'>();
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const manage = access.can(Permission.ManageTags);

  const open = (tag: ServerTagDefinition | 'new') => {
    setEditing(tag);
    setMessage('');
    setDraft(
      tag === 'new'
        ? blank
        : { text: tag.text, badge: tag.badge, colour: tag.colour, name: tag.name, mode: tag.mode, roleIds: tag.roleIds },
    );
  };
  async function run(action: () => Promise<unknown>, close = true) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await onChanged();
      if (close) setEditing(undefined);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const valid = tagTextPattern.test(draft.text) && (draft.mode !== 'roles' || draft.roleIds.length > 0);
  const current = editing && editing !== 'new' ? tags.find((tag) => tag.id === editing.id) : undefined;

  if (editing)
    return (
      <div className="tag-editor max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{editing === 'new' ? 'Create tag' : 'Edit tag'}</h3>
          <TagChip
            tag={{ text: draft.text || 'TAG', badge: draft.badge, colour: draft.colour }}
            className={cn(!tagTextPattern.test(draft.text) && 'opacity-50')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div>
            <label className="block text-xs font-medium text-foreground">
              Tag
              <input
                className="mt-1.5 block w-full font-bold uppercase tracking-[0.08em]"
                value={draft.text}
                maxLength={4}
                placeholder="DEV"
                aria-describedby="tag-text-rule"
                onChange={(event) => setDraft({ ...draft, text: event.target.value.replace(/[^A-Za-z0-9]/g, '') })}
              />
            </label>
            <small id="tag-text-rule" className="mt-1 block text-[11px] text-muted-foreground">
              One to four letters or digits.
            </small>
          </div>
          <label className="block text-xs font-medium text-foreground">
            What it stands for
            <input
              className="mt-1.5 block w-full"
              value={draft.name}
              maxLength={32}
              placeholder="Developers"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
        </div>
        <div role="radiogroup" aria-label="Badge" className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Badge</span>
          <div className="flex flex-wrap gap-1.5">
            {tagBadges.map((name) => {
              const Icon = badgeIcons[name];
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={draft.badge === name}
                  aria-label={badgeNames[name]}
                  className={cn(
                    'grid size-10 place-items-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    draft.badge === name ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/60',
                  )}
                  style={draft.badge === name ? { color: draft.colour } : undefined}
                  onClick={() => setDraft({ ...draft, badge: name })}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <ColourField label="Colour" value={draft.colour} onChange={(colour) => setDraft({ ...draft, colour })} />

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-foreground">Who can use this tag?</legend>
          <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background/40">
            {(Object.keys(modeLabels) as TagMode[]).map((mode) => (
              <label key={mode} className="flex cursor-pointer flex-row items-start gap-3 px-3.5 py-2.5 hover:bg-accent/40">
                <input
                  type="radio"
                  name="tag-mode"
                  className="mt-0.5 accent-foreground"
                  checked={draft.mode === mode}
                  onChange={() => setDraft({ ...draft, mode })}
                />
                <span className="flex flex-col">
                  <strong className="text-[13px] font-medium text-foreground">{modeLabels[mode].title}</strong>
                  <small className="text-[11px] text-muted-foreground">{modeLabels[mode].description}</small>
                </span>
              </label>
            ))}
          </div>
          {draft.mode === 'roles' && (
            <div className="space-y-1 rounded-lg border border-border bg-background/40 p-2" aria-label="Allowed roles" role="group">
              {roles.length ? (
                roles.map((role) => (
                  <label key={role.id} className="flex cursor-pointer flex-row items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="accent-foreground"
                      checked={draft.roleIds.includes(role.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          roleIds: event.target.checked
                            ? [...draft.roleIds, role.id]
                            : draft.roleIds.filter((id) => id !== role.id),
                        })
                      }
                    />
                    <span className="size-2.5 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                    {role.name}
                  </label>
                ))
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">Create a role first, under Roles.</p>
              )}
            </div>
          )}
          {draft.mode === 'assigned' && current && current.mode === 'assigned' && (
            <div className="space-y-1 rounded-lg border border-border bg-background/40 p-2" aria-label="People holding this tag" role="group">
              {detail.members.map((member) => (
                <label key={member.id} className="flex cursor-pointer flex-row items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                  <input
                    type="checkbox"
                    className="accent-foreground"
                    aria-label={`Give ${member.displayName} this tag`}
                    checked={current.holderIds.includes(member.id)}
                    disabled={busy}
                    onChange={(event) =>
                      void run(
                        () =>
                          api.request(
                            `/api/tags/${current.id}/holders/${member.id}`,
                            event.target.checked ? 'PUT' : 'DELETE',
                          ),
                        false,
                      )
                    }
                  />
                  {member.displayName}
                </label>
              ))}
            </div>
          )}
          {draft.mode === 'assigned' && (!current || current.mode !== 'assigned') && (
            <p className="text-[11px] text-muted-foreground">Save the tag, then open it again to hand it out.</p>
          )}
        </fieldset>

        {message && (
          <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
            {message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {current && (
            <button
              type="button"
              className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> Delete tag
            </button>
          )}
          <button
            type="button"
            className={cn(!current && 'ml-auto', 'inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground')}
            onClick={() => setEditing(undefined)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={primaryClass}
            disabled={busy || !valid}
            onClick={() =>
              void run(() =>
                current
                  ? api.request(`/api/tags/${current.id}`, 'PATCH', draft)
                  : api.request(`/api/servers/${detail.server.id}/tags`, 'POST', draft),
              )
            }
          >
            {busy ? 'Saving…' : 'Save tag'}
          </button>
        </div>
        {current && confirmDelete && (
          <ConfirmDialog
            confirmation={{
              title: 'Delete tag',
              description: `Delete ${current.text}? It comes off everybody wearing it.`,
              confirmLabel: 'Delete',
              tone: 'danger',
              action: async () => undefined,
            }}
            busy={busy}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              setConfirmDelete(false);
              void run(() => api.request(`/api/tags/${current.id}`, 'DELETE'));
            }}
          />
        )}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Members wear one tag from each server, beside their name there.</p>
        {manage && (
          <button type="button" className={primaryClass} onClick={() => open('new')}>
            <Plus className="size-4" /> Create tag
          </button>
        )}
      </div>
      {tags.length ? (
        <ul className="grid gap-2.5">
          {tags.map((tag) => {
            const allowed =
              tag.mode === 'roles'
                ? roles.filter((role) => tag.roleIds.includes(role.id)).map((role) => role.name).join(', ')
                : undefined;
            return (
              <li key={tag.id} className="server-tag-card flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3.5">
                <TagChip tag={tag} />
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <strong className="block truncate text-sm font-semibold text-foreground">{tag.name || tag.text}</strong>
                  <p className="text-muted-foreground">
                    {tag.mode === 'everyone' && 'Available to everyone. Members can equip it.'}
                    {tag.mode === 'roles' && `Available to: ${allowed || 'no role'}. Members can equip it.`}
                    {tag.mode === 'assigned' &&
                      `Staff assign it${manage ? ` · ${tag.holderIds.length} ${tag.holderIds.length === 1 ? 'holder' : 'holders'}` : ''}.`}
                  </p>
                </div>
                {manage && (
                  <button
                    type="button"
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Edit ${tag.text}`}
                    onClick={() => open(tag)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          This server has no tags yet.
        </div>
      )}
    </div>
  );
}
