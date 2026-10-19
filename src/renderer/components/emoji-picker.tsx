import { useMemo, useState } from 'react';
import { Search, SmilePlus } from 'lucide-react';
import { emojiGroups } from '../../shared/chat';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const emojis = emojiGroups.flatMap((group) =>
  group.items.map(([emoji, keywords]) => ({ emoji, keywords, group: group.name })),
);

export function EmojiPicker({
  label = 'Add emoji',
  disabled,
  className = '',
  onSelect,
}: {
  label?: string;
  disabled?: boolean;
  className?: string;
  onSelect(emoji: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const matches = useMemo(
    () =>
      emojis.filter(
        (item) =>
          (group === 'All' || item.group === group) &&
          `${item.emoji} ${item.keywords}`.includes(query.trim().toLowerCase()),
      ),
    [group, query],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`emoji-trigger ${className}`} aria-label={label} disabled={disabled}>
          <SmilePlus size={18} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="emoji-picker" side="top" align="end" aria-label="Emoji picker">
        <header>
          <strong>Choose an emoji</strong>
          <span>{matches.length}</span>
        </header>
        <label className="emoji-search">
          <Search size={14} aria-hidden="true" />
          <input
            placeholder="Search emojis"
            aria-label="Search emojis"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        </label>
        <div className="emoji-categories" role="group" aria-label="Emoji categories">
          {['All', ...emojiGroups.map((item) => item.name)].map((name) => (
            <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="emoji-grid">
          {matches.map(({ emoji, keywords }) => (
            <button
              type="button"
              key={emoji}
              aria-label={`${emoji} ${keywords}`}
              title={keywords}
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        {!matches.length && <p className="emoji-empty">No emojis found. Try another word.</p>}
      </PopoverContent>
    </Popover>
  );
}
