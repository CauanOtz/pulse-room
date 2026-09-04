import { useRef, useState } from 'react';
import { ImageUp, Trash2, UserRound } from 'lucide-react';
import type { Account } from '../../shared/community';
import { toSquareImage } from '../infrastructure/square-image';
import { Avatar } from './avatar';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface ProfileCardProps {
  user: Account;
  canEditPicture: boolean;
  onChoosePicture(image: Blob): Promise<void>;
  onRemovePicture(): Promise<void>;
  onOpenAccount?(): void;
}

/** Who somebody is, and for your own card, the way to change your picture. */
export function ProfileCard({
  user,
  canEditPicture,
  onChoosePicture,
  onRemovePicture,
  onOpenAccount,
}: ProfileCardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That picture could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const picture = (
    <Avatar
      className="grid size-20 place-items-center rounded-full bg-secondary text-xl font-bold text-secondary-foreground"
      name={user.displayName}
      imageId={user.avatarId}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {canEditPicture ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full ring-offset-2 ring-offset-popover transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                aria-label="Your picture"
                disabled={busy}
              >
                {picture}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuItem onSelect={() => input.current?.click()}>
                <ImageUp className="size-4" />
                {user.avatarId ? 'Change photo' : 'Add photo'}
              </DropdownMenuItem>
              {user.avatarId && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => void run(onRemovePicture)}
                >
                  <Trash2 className="size-4" />
                  Remove photo
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          picture
        )}

        <div className="flex min-w-0 flex-col">
          <strong className="truncate text-base font-semibold" title={user.displayName}>
            {user.displayName}
          </strong>
          <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
        </div>
      </div>

      {problem && <p className="text-xs text-destructive">{problem}</p>}

      {onOpenAccount && (
        <Button variant="secondary" size="sm" className="w-full" onClick={onOpenAccount}>
          <UserRound className="size-4" />
          Account settings
        </Button>
      )}

      <input
        ref={input}
        className="picture-input pointer-events-none absolute size-px opacity-0"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Profile picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(async () => onChoosePicture(await toSquareImage(file)));
        }}
      />
    </div>
  );
}
