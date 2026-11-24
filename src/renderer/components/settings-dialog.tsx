import { useEffect, useState, type CSSProperties } from 'react';
import {
  Activity,
  AudioLines,
  Check,
  Mic2,
  MonitorUp,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { noiseGateThresholdDb, type ParticipantHealth } from '../domain/conference';
import { CallHealth } from './call-health';
import { MicrophoneMeter } from './microphone-meter';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';
import { PanelDialog, PanelGroup, PanelHeading, PanelRow, type PanelSection } from './ui/panel-dialog';
import type { UserSettings } from '../application/ports/settings-repository';
import type { AvailableMediaDevices, MediaDeviceOption } from '../infrastructure/media/media-devices-service';
import type { UpdateStatus } from '../../shared/desktop-api';

interface SettingsDialogProps {
  managedAccount?: boolean;
  open: boolean;
  initialSettings: UserSettings;
  devices: AvailableMediaDevices;
  version: string;
  updateStatus: UpdateStatus;
  microphoneLive: boolean;
  microphoneProblem?: string;
  /** Absent outside a call, where there is nothing to report on. */
  readHealth?(): Promise<ParticipantHealth[]>;
  onClose(): void;
  onSave(settings: UserSettings): void;
  onCheckUpdates(): void;
  onInstallUpdate(): void;
}

type SettingsSection = 'input' | 'processing' | 'screen' | 'connection' | 'application';

const screenPresets = [
  { id: 'efficient', label: 'Efficient', spec: '720p · 30 fps', note: 'Up to 2.5 Mbps' },
  { id: 'balanced', label: 'Balanced', spec: '1080p · 30 fps', note: 'Up to 4.5 Mbps' },
  { id: 'motion', label: 'Motion', spec: '1080p · 60 fps', note: 'Up to 7 Mbps' },
] as const;

const delayPresets = [
  { id: 'lowest', label: 'Lowest delay', spec: '~69 ms here', note: 'Best on a cable' },
  { id: 'balanced', label: 'Balanced', spec: '~110 ms here', note: 'Survives a hiccup' },
  { id: 'smooth', label: 'Smoothest', spec: '~230 ms here', note: 'For unstable lines' },
] as const;

/**
 * Everything about how this machine sounds and shares, as a console: each
 * section on the left says what is in force, the open one on the right is a
 * column of settings, and nothing is kept until the bar at the bottom says so.
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const [settings, setSettings] = useState(props.initialSettings);
  const [active, setActive] = useState<SettingsSection>('input');
  useEffect(() => setSettings(props.initialSettings), [props.initialSettings, props.open]);
  if (!props.open) return null;

  const set = <Key extends keyof UserSettings>(key: Key, value: UserSettings[Key]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(props.initialSettings);
  const updateReady =
    props.updateStatus.state === 'downloaded' ||
    props.updateStatus.state === 'available' ||
    props.updateStatus.state === 'downloading';

  const sections: PanelSection<SettingsSection>[] = [
    {
      id: 'input',
      label: 'Input & output',
      icon: Mic2,
      status: props.microphoneLive ? 'Mic live' : 'Not in a call',
      tone: props.microphoneLive ? 'live' : undefined,
    },
    {
      id: 'processing',
      label: 'Voice processing',
      icon: AudioLines,
      status: settings.voiceIsolation
        ? 'Voice isolation'
        : settings.noiseSuppression
          ? 'Noise suppression'
          : 'Unfiltered',
    },
    {
      id: 'screen',
      label: 'Screen share',
      icon: MonitorUp,
      status: screenPresets.find((preset) => preset.id === settings.screenSharePreset)?.spec,
    },
    {
      id: 'connection',
      label: 'Connection',
      icon: Activity,
      status: delayPresets.find((preset) => preset.id === settings.voiceDelay)?.label,
    },
    {
      id: 'application',
      label: 'Application',
      icon: Settings2,
      status: updateReady ? 'Update ready' : `v${props.version}`,
      tone: updateReady ? 'attention' : undefined,
    },
  ];

  return (
    <PanelDialog<SettingsSection>
      title="Voice and video"
      description="Your voice, playback and screen share."
      icon={SlidersHorizontal}
      className="settings-dialog"
      sections={sections}
      active={active}
      onSelect={setActive}
      dirty={dirty}
      saveDisabled={!settings.displayName.trim() || (!props.managedAccount && !settings.roomId.trim())}
      onSave={() => props.onSave(settings)}
      onReset={() => setSettings(props.initialSettings)}
      onClose={props.onClose}
    >
      {active === 'input' && (
        <>
          <PanelHeading
            title="Input & output"
            description="What you speak through and where the room plays."
          />
          {/* The microphone, heard before anything else is decided about it. */}
          <div className={cn('mic-stage', props.microphoneLive ? 'is-live' : 'is-off')} role="status">
            <span className="mic-stage-state">
              <i aria-hidden="true" />
              {props.microphoneLive
                ? 'Your microphone is live in the room'
                : (props.microphoneProblem ?? 'Not publishing: join a voice channel to go live')}
            </span>
            <MicrophoneMeter
              deviceId={settings.microphoneDeviceId}
              gateThresholdDb={noiseGateThresholdDb(settings.noiseGate)}
            />
          </div>
          <PanelGroup title="Devices">
            <PanelRow
              stacked
              label={
                <span className="inline-flex items-center gap-2">
                  <Mic2 className="size-3.5 text-muted-foreground" aria-hidden="true" /> Microphone
                </span>
              }
            >
              <DeviceSelect
                label="Microphone"
                value={settings.microphoneDeviceId}
                devices={props.devices.microphones}
                onChange={(id) => set('microphoneDeviceId', id)}
              />
            </PanelRow>
            <PanelRow
              stacked
              label={
                <span className="inline-flex items-center gap-2">
                  <Volume2 className="size-3.5 text-muted-foreground" aria-hidden="true" /> Speakers
                </span>
              }
              detail="Device changes apply the next time you join."
            >
              <DeviceSelect
                label="Speakers"
                value={settings.speakerDeviceId}
                devices={props.devices.speakers}
                onChange={(id) => set('speakerDeviceId', id)}
              />
            </PanelRow>
          </PanelGroup>
          {!props.managedAccount && (
            <PanelGroup title="Identity">
              <PanelRow stacked label="Display name" htmlFor="settings-display-name">
                <input
                  id="settings-display-name"
                  value={settings.displayName}
                  onChange={(event) => set('displayName', event.target.value)}
                />
              </PanelRow>
              <PanelRow stacked label="Room name" htmlFor="settings-room">
                <input
                  id="settings-room"
                  value={settings.roomId}
                  onChange={(event) => set('roomId', event.target.value)}
                />
              </PanelRow>
            </PanelGroup>
          )}
        </>
      )}

      {active === 'processing' && (
        <>
          <PanelHeading
            title="Voice processing"
            description="Speech kept clear, without flattening the way your voice sounds."
          />
          <PanelGroup title="Levels">
            <Range
              label="Microphone gain"
              value={settings.microphoneGain}
              min={0}
              max={150}
              suffix="%"
              detail="A limiter protects the signal above 100%."
              onChange={(value) => set('microphoneGain', value)}
            />
            <Range
              label="Noise gate"
              value={settings.noiseGate}
              min={0}
              max={100}
              suffix="%"
              detail="Silences fans and keys between words. Lower it if your words get clipped."
              onChange={(value) => set('noiseGate', value)}
            />
          </PanelGroup>
          <PanelGroup title="Filters">
            <Toggle
              label="Voice isolation"
              detail="Krisp removes fans, keyboards and other voices before anyone hears them; RNNoise stands in where the server cannot run it. Replaces noise suppression while on."
              checked={settings.voiceIsolation}
              onChange={(value) => set('voiceIsolation', value)}
            />
            <Toggle
              label="Noise suppression"
              detail="The browser's own filter for steady background noise."
              checked={settings.noiseSuppression}
              onChange={(value) => set('noiseSuppression', value)}
            />
            <Toggle
              label="Echo cancellation"
              detail="Stops the room from coming back through your microphone. Off on headphones for less delay."
              checked={settings.echoCancellation}
              onChange={(value) => set('echoCancellation', value)}
            />
            <Toggle
              label="Automatic gain"
              detail="Keeps quiet and loud speech at one level."
              checked={settings.autoGainControl}
              onChange={(value) => set('autoGainControl', value)}
            />
          </PanelGroup>
          <PanelGroup title="Room">
            <Toggle
              label="Room sounds"
              detail="Short cues for arrivals, muting and screens going live."
              checked={settings.roomSounds}
              onChange={(value) => set('roomSounds', value)}
            />
          </PanelGroup>
        </>
      )}

      {active === 'screen' && (
        <>
          <PanelHeading
            title="Screen share"
            description="Detail, motion and bandwidth, for everyone watching."
          />
          <Choices
            name="quality"
            label="Screen quality"
            options={screenPresets}
            value={settings.screenSharePreset}
            onChange={(value) => set('screenSharePreset', value)}
          />
          <PanelGroup title="Picture" className="mt-7">
            <Toggle
              label="Expand screen levels"
              detail="Restores true black when a shared screen looks washed out."
              checked={settings.expandScreenLevels}
              onChange={(value) => set('expandScreenLevels', value)}
            />
          </PanelGroup>
        </>
      )}

      {active === 'connection' && (
        <>
          <PanelHeading
            title="Connection"
            description="How much delay to trade for a voice that never stutters."
          />
          <Choices
            name="delay"
            label="Voice delay"
            options={delayPresets}
            value={settings.voiceDelay}
            onChange={(value) => set('voiceDelay', value)}
          />
          <p className="panel-note">
            Less delay leaves less room for a computer or a line that briefly stalls. Applies on the next
            call.
          </p>
          {props.readHealth && (
            <div className="settings-health mt-7">
              <CallHealth read={props.readHealth} />
            </div>
          )}
        </>
      )}

      {active === 'application' && (
        <>
          <PanelHeading title="Application" />
          <div className="app-stage">
            <span className="app-stage-name">Pulse Room</span>
            <span className="app-stage-version">v{props.version}</span>
            <span className="app-stage-state">{updateCopy(props.updateStatus, props.version)}</span>
            {updateReady ? (
              <button className="app-stage-action is-primary" type="button" onClick={props.onInstallUpdate}>
                {props.updateStatus.state === 'downloaded' ? 'Restart and update' : 'Update now'}
              </button>
            ) : (
              <button
                className="app-stage-action"
                type="button"
                onClick={props.onCheckUpdates}
                disabled={props.updateStatus.state === 'checking'}
              >
                <RefreshCw
                  size={14}
                  className={props.updateStatus.state === 'checking' ? 'animate-spin' : ''}
                />
                Check now
              </button>
            )}
          </div>
          <p className="panel-note">
            New versions arrive by themselves: a notice says when one is ready, and it installs on restart.
          </p>
        </>
      )}
    </PanelDialog>
  );
}

/** A sound device, named in full rather than clipped. */
function DeviceSelect({
  label,
  value,
  devices,
  onChange,
}: {
  label: string;
  value?: string;
  devices: MediaDeviceOption[];
  onChange(deviceId?: string): void;
}) {
  return (
    <Select
      value={value ?? 'system'}
      onValueChange={(next) => onChange(next === 'system' ? undefined : next)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">System default</SelectItem>
        {devices.map((device) => (
          <SelectItem key={device.id} value={device.id} title={device.label}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Range({
  label,
  value,
  min,
  max,
  suffix,
  detail,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  detail: string;
  onChange(value: number): void;
}) {
  const id = `setting-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <PanelRow stacked label={label} htmlFor={id} value={`${value}${suffix}`} detail={detail}>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </PanelRow>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  const id = `toggle-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <PanelRow
      label={label}
      htmlFor={id}
      detail={detail}
      control={<Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />}
    />
  );
}

/** Three ways to do one thing, side by side, the chosen one filled. */
function Choices<Value extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: readonly { id: Value; label: string; spec: string; note: string }[];
  value: Value;
  onChange(value: Value): void;
}) {
  return (
    <div className="panel-choices" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <label key={option.id} className={cn('panel-choice', selected && 'is-selected')}>
            <input
              className="sr-only"
              type="radio"
              name={name}
              checked={selected}
              onChange={() => onChange(option.id)}
            />
            <strong>{option.label}</strong>
            <span className="panel-choice-mark" aria-hidden="true">
              {selected && <Check size={10} strokeWidth={3.2} />}
            </span>
            <span className="panel-choice-spec">{option.spec}</span>
            <span className="panel-choice-note">{option.note}</span>
          </label>
        );
      })}
    </div>
  );
}

function updateCopy(status: UpdateStatus, version: string): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for a newer version…';
    case 'available':
      return `Version ${status.version} is available.`;
    case 'downloading':
      return `Downloading ${status.version ?? 'the update'} · ${status.percent}%`;
    case 'downloaded':
      return `Version ${status.version} is ready to install.`;
    case 'error':
      return status.message;
    case 'not-available':
      return `Pulse Room ${status.version} is current.`;
    default:
      return `Installed: ${version}`;
  }
}
