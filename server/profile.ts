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
  st.text AS "tagText", st.badge AS "tagBadge", st.colour AS "tagColour"`;

/**
 * The tag somebody wears is one per server, so it is read in the light of one:
 * `server` is the SQL for that server's id, usually a parameter. Without one,
 * as for your own account outside any server, nobody wears anything.
 *
 * A tag is only ever stored while it can be worn, so what is found is shown:
 * leaving the server, losing the role it needs or the tag being taken away
 * removes the row rather than hiding it.
 */
export const profileJoins = (server = 'NULL::uuid') => `
  LEFT JOIN member_tags mt ON mt.server_id = ${server} AND mt.account_id = a.id
  LEFT JOIN server_tags st ON st.id = mt.tag_id
  LEFT JOIN communities tc ON tc.id = st.server_id`;

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
