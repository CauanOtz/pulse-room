import { Headphones, Mic, MicOff, Settings } from 'lucide-react';
import type { Account } from '../../shared/community';
import type { AvailableMediaDevices } from '../infrastructure/media/media-devices-service';
import { AppearanceChoice } from './appearance-choice';
import { Avatar } from './avatar';
import { DeviceMenu } from './device-menu';
import { ProfileCard } from './profile-card';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface ProfileBarProps {
  displayName: string;
  avatarId?: string | null;
  user?: Account;
  onChoosePicture?(image: Blob): Promise<void>;
  onRemovePicture?(): Promise<void>;
  joined: boolean;
  busy: boolean;
  microphoneEnabled: boolean;
  deafened: boolean;
  devices: AvailableMediaDevices;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
  onToggleMicrophone(): void;
  onToggleDeafen(): void;
  onSelectMicrophone(deviceId?: string): void;
  onSelectSpeaker(deviceId?: string): void;
  onOpenAccount?(): void;
  onOpenSettings(): void;
}

/**
 * Who you are and how you sound, along the foot of the window.
 *
 * It spans the rail and the channel list rather than hiding in the narrow
 * column, which is what a name and a row of controls need to be readable.
 */
export function ProfileBar(props: ProfileBarProps) {
  const person = props.user ?? {
    id: 'local',
    username: props.displayName,
    displayName: props.displayName,
    avatarId: props.avatarId,
  };

  return (
    <div className="profile-strip col-span-3 col-start-1 row-start-2 flex items-center gap-2 border-t border-border bg-sidebar px-3 py-2">
      {/* The picture opens the person; the name opens what the person can set. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="rounded-xl transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label="Your profile"
            title="Your profile"
          >
            <Avatar
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-[11px] font-bold text-secondary-foreground"
              name={props.displayName}
              imageId={props.avatarId}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top">
          <ProfileCard
            user={person}
            canEditPicture={Boolean(props.onChoosePicture)}
            onChoosePicture={async (image) => props.onChoosePicture?.(image)}
            onRemovePicture={async () => props.onRemovePicture?.()}
            onOpenAccount={props.onOpenAccount}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex min-w-0 max-w-64 flex-col rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label="Your settings"
          >
            <strong className="truncate text-[13px] font-semibold" title={props.displayName}>
              {props.displayName}
            </strong>
            <small className="truncate text-[11px] text-muted-foreground">
              {props.joined ? 'In voice' : 'Ready'}
            </small>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top">
          <AppearanceChoice />
        </PopoverContent>
      </Popover>

      <span className="device-control ml-2 flex items-center rounded-lg bg-secondary/70">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-r-none"
          disabled={!props.joined || props.busy}
          aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={props.onToggleMicrophone}
        >
          {props.joined && !props.microphoneEnabled ? (
            <MicOff className="size-4 text-destructive" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>
        <DeviceMenu
          title="Microphone"
          label="Choose microphone"
          devices={props.devices.microphones}
          selectedId={props.microphoneDeviceId}
          onSelect={props.onSelectMicrophone}
        />
      </span>

      <span className="device-control flex items-center rounded-lg bg-secondary/70">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-r-none"
          disabled={!props.joined || props.busy}
          aria-label="Toggle deafen"
          onClick={props.onToggleDeafen}
        >
          <Headphones className={props.deafened ? 'size-4 text-destructive' : 'size-4'} />
        </Button>
        <DeviceMenu
          title="Speakers"
          label="Choose speakers"
          devices={props.devices.speakers}
          selectedId={props.speakerDeviceId}
          onSelect={props.onSelectSpeaker}
        />
      </span>

      <span className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="Open audio settings"
          onClick={props.onOpenSettings}
        >
          <Settings className="size-4" />
        </Button>
      </span>
    </div>
  );
}
