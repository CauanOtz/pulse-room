import type { Account, TagBadge } from '../src/shared/community.js';

/**
 * Everything a profile shows beyond a name, read the same way everywhere an
 * account is read for somebody to look at.
 *
 * Expects the account under the alias `a`.
 */
export const profileColumns = `
  a.id, a.username, a.display_name AS "displayName", a.avatar_id AS "avatarId", a.bio,
  a.banner_id AS "bannerId",
  a.theme_primary AS "themePrimary", a.theme_accent AS "themeAccent",
  tc.id AS "tagServerId", tc.name AS "tagServerName",
  tc.tag_text AS "tagText", tc.tag_badge AS "tagBadge", tc.tag_colour AS "tagColour"`;

/**
 * Resolves the tag somebody wears, and only while it is still true: they are
 * still a member of that server, and that server still has a tag. Leaving a
 * server, or the server dropping its tag, takes it off without anybody having
 * to remember to.
 */
export const profileJoins = `
  LEFT JOIN memberships tm ON tm.server_id = a.tag_server_id AND tm.account_id = a.id
  LEFT JOIN communities tc ON tc.id = tm.server_id AND tc.tag_text IS NOT NULL`;

export interface ProfileRow {
  id: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  bio: string;
  bannerId: string | null;
  themePrimary: string | null;
  themeAccent: string | null;
  tagServerId: string | null;
  tagServerName: string | null;
  tagText: string | null;
  tagBadge: TagBadge | null;
  tagColour: string | null;
}

/** The columns that exist only to be folded into `theme` and `tag`. */
type Folded = 'bannerId' | 'themePrimary' | 'themeAccent' | 'tagServerId' | 'tagServerName' | 'tagText' | 'tagBadge' | 'tagColour';

/** Turns the flat row back into the shape the clients read. */
export function toAccount<T extends ProfileRow>(row: T): Account & Omit<T, Folded> {
  const {
    bannerId,
    themePrimary,
    themeAccent,
    tagServerId,
    tagServerName,
    tagText,
    tagBadge,
    tagColour,
    ...rest
  } = row;
  return {
    ...rest,
    bannerId: bannerId ?? null,
    theme: themePrimary && themeAccent ? { primary: themePrimary, accent: themeAccent } : null,
    tag:
      tagServerId && tagServerName && tagText && tagBadge && tagColour
        ? { serverId: tagServerId, serverName: tagServerName, text: tagText, badge: tagBadge, colour: tagColour }
        : null,
  };
}
