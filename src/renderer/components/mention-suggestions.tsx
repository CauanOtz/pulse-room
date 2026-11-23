import { AnimatePresence, motion } from 'motion/react';
import type { CommunityMember } from '../../shared/community';
import { Avatar } from './avatar';
import { cn } from './ui/utils';

/** Up to six people whose name or username begins with what was typed after the @. */
export function suggestionsFor(members: readonly CommunityMember[], query: string): CommunityMember[] {
  const typed = query.toLowerCase();
  const score = (member: CommunityMember) => {
    const username = member.username.toLowerCase();
    const name = member.displayName.toLowerCase();
    if (username.startsWith(typed) || name.startsWith(typed)) return 0;
    if (name.split(/\s+/).some((word) => word.startsWith(typed))) return 1;
    if (username.includes(typed) || name.includes(typed)) return 2;
    return undefined;
  };
  return members
    .map((member) => ({ member, rank: score(member) }))
    .filter((entry): entry is { member: CommunityMember; rank: number } => entry.rank !== undefined)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(b.member.online ?? false) - Number(a.member.online ?? false) ||
        a.member.displayName.localeCompare(b.member.displayName),
    )
    .slice(0, 6)
    .map((entry) => entry.member);
}

/**
 * The people an @ can name, over the composer. The keys move through them and
 * Enter or Tab names one; the pointer works too, without taking the caret away.
 */
export function MentionSuggestions({
  people,
  activeIndex,
  avatars,
  onPick,
  onHover,
}: {
  people: readonly CommunityMember[];
  activeIndex: number;
  avatars?: ReadonlyMap<string, string | null | undefined>;
  onPick(member: CommunityMember): void;
  onHover(index: number): void;
}) {
  return (
    <AnimatePresence>
      {people.length > 0 && (
        <motion.div
          className="mention-suggestions"
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mention-suggestions-title">Members</p>
          <ul id="mention-suggestions" role="listbox" aria-label="People to mention">
            {people.map((member, index) => (
              <li
                key={member.id}
                id={`mention-option-${member.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn('mention-option', index === activeIndex && 'is-active')}
                // The caret stays in the message while somebody is picked.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHover(index)}
                onClick={() => onPick(member)}
              >
                {index === activeIndex && (
                  <motion.span
                    layoutId="mention-highlight"
                    className="mention-option-highlight"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 640, damping: 44 }}
                  />
                )}
                <Avatar
                  className="mention-option-avatar"
                  name={member.displayName}
                  imageId={avatars?.get(member.id) ?? member.avatarId}
                />
                <span className="mention-option-name">{member.displayName}</span>
                <span className="mention-option-username">@{member.username}</span>
              </li>
            ))}
          </ul>
          <p className="mention-suggestions-hint" aria-hidden="true">
            <kbd>↑</kbd>
            <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to mention · <kbd>Esc</kbd> to close
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
