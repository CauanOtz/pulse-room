import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  Headphones,
  Mic2,
  MonitorUp,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import { noiseGateThresholdDb, type ParticipantHealth } from '../domain/conference';
import { CallHealth } from './call-health';
import { MicrophoneMeter } from './microphone-meter';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';
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

const navigation: Array<{ id: SettingsSection; label: string; icon: typeof Mic2 }> = [
  { id: 'input', label: 'Input & output', icon: Mic2 },
  { id: 'processing', label: 'Voice processing', icon: AudioLines },
  { id: 'screen', label: 'Screen share', icon: MonitorUp },
  { id: 'connection', label: 'Connection', icon: Activity },
  { id: 'application', label: 'Application', icon: Settings2 },
];

export function SettingsDialog(props: SettingsDialogProps) {
  const [settings, setSettings] = useState(props.initialSettings);
  const [activeSection, setActiveSection] = useState<SettingsSection>('input');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSettings(props.initialSettings), [props.initialSettings, props.open]);
  if (!props.open) return null;

  const updateCopy = getUpdateCopy(props.updateStatus, props.version);
  const goToSection = (id: SettingsSection) => {
    setActiveSection(id);
    bodyRef.current?.querySelector<HTMLElement>(`#voice-settings-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const updateActiveSection = () => {
    const body = bodyRef.current;
    if (!body) return;
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) {
      setActiveSection('application');
      return;
    }
    const marker = body.getBoundingClientRect().top + 80;
    const visible = navigation.reduce<SettingsSection>((current, item) => {
      const section = body.querySelector<HTMLElement>(`#voice-settings-${item.id}`);
      return section && section.getBoundingClientRect().top <= marker ? item.id : current;
    }, 'input');
    setActiveSection(visible);
  };

  return (
    <div
      className="dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <section
        className="dialog settings-dialog flex h-[min(88vh,48rem)] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[4.5rem] flex-none items-center gap-4 border-b border-border px-6">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"
            aria-hidden="true"
          >
            <SlidersHorizontal className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="settings-title" className="text-[17px] font-semibold tracking-[-0.015em]">
              Voice and video
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shape your voice, playback, and screen share.
            </p>
          </div>
          <button
            className="icon-button grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={props.onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[11.5rem_minmax(0,1fr)] max-[720px]:grid-cols-1">
          <aside className="settings-nav flex min-h-0 flex-col border-r border-border bg-background/55 px-3 py-4 max-[720px]:hidden">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Audio settings
            </p>
            <nav className="space-y-0.5" aria-label="Voice settings sections">
              {navigation.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeSection === id
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  )}
                  type="button"
                  aria-current={activeSection === id ? 'location' : undefined}
                  onClick={() => goToSection(id)}
                >
                  <Icon className="size-[15px] shrink-0" strokeWidth={1.9} />
                  {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto border-t border-border px-2 pt-3">
              <p className="text-[11px] leading-4 text-muted-foreground">
                Changes take effect when you save. Device choices apply to your next connection.
              </p>
            </div>
          </aside>

          <div
            ref={bodyRef}
            className="settings-body min-h-0 overflow-y-auto scroll-smooth"
            onScroll={updateActiveSection}
          >
            <div className="mx-auto flex w-full max-w-[43rem] flex-col gap-8 px-7 py-6 max-[720px]:px-5">
              <SettingsGroup
                id="input"
                icon={<Headphones className="size-4" />}
                title="Input & output"
                description="Choose what you speak through and where the room plays."
              >
                {!props.managedAccount && (
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <TextField
                      label="Display name"
                      value={settings.displayName}
                      onChange={(displayName) => setSettings({ ...settings, displayName })}
                    />
                    <TextField
                      label="Room name"
                      value={settings.roomId}
                      onChange={(roomId) => setSettings({ ...settings, roomId })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  <DeviceField
                    label="Microphone"
                    value={settings.microphoneDeviceId}
                    devices={props.devices.microphones}
                    onChange={(microphoneDeviceId) => setSettings({ ...settings, microphoneDeviceId })}
                  />
                  <DeviceField
                    label="Speakers"
                    value={settings.speakerDeviceId}
                    devices={props.devices.speakers}
                    onChange={(speakerDeviceId) => setSettings({ ...settings, speakerDeviceId })}
                  />
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-background/45">
                  <div
                    className="mic-status flex items-center gap-3 border-b border-border px-4 py-3 text-xs"
                    role="status"
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full shadow-[0_0_0_4px]',
                        props.microphoneLive
                          ? 'is-live bg-success shadow-success/15'
                          : 'is-off bg-destructive shadow-destructive/15',
                      )}
                    />
                    <span className="font-medium text-foreground">
                      {props.microphoneLive
                        ? 'Your microphone is live in the room.'
                        : (props.microphoneProblem ?? 'Your microphone is not publishing.')}
                    </span>
                  </div>
                  <div className="px-4 py-4">
                    <MicrophoneMeter
                      deviceId={settings.microphoneDeviceId}
                      gateThresholdDb={noiseGateThresholdDb(settings.noiseGate)}
                    />
                  </div>
                </div>
              </SettingsGroup>

              <SettingsGroup
                id="processing"
                icon={<AudioLines className="size-4" />}
                title="Voice processing"
                description="Keep speech clear without flattening the way your voice sounds."
              >
                <div className="overflow-hidden rounded-lg border border-border bg-background/45">
                  <RangeControl
                    label="Microphone gain"
                    value={settings.microphoneGain}
                    min={0}
                    max={150}
                    suffix="%"
                    description="A limiter protects the signal when gain goes above 100%."
                    onChange={(microphoneGain) => setSettings({ ...settings, microphoneGain })}
                  />
                  <RangeControl
                    label="Noise gate"
                    value={settings.noiseGate}
                    min={0}
                    max={100}
                    suffix="%"
                    description="Silences fans and keyboards between words. Lower it if your voice gets clipped."
                    onChange={(noiseGate) => setSettings({ ...settings, noiseGate })}
                  />
                </div>
                <div className="toggle-block overflow-hidden rounded-lg border border-border bg-background/45">
                  <Toggle
                    label="Noise suppression"
                    detail="Filters steady background noise through the browser audio engine."
                    checked={settings.noiseSuppression}
                    onChange={(noiseSuppression) => setSettings({ ...settings, noiseSuppression })}
                  />
                  <Toggle
                    label="Echo cancellation"
                    detail="Prevents speaker audio from returning through your microphone. Turn it off on headphones for lower delay."
                    checked={settings.echoCancellation}
                    onChange={(echoCancellation) => setSettings({ ...settings, echoCancellation })}
                  />
                  <Toggle
                    label="Automatic gain"
                    detail="Keeps quiet and loud speech at a stable level."
                    checked={settings.autoGainControl}
                    onChange={(autoGainControl) => setSettings({ ...settings, autoGainControl })}
                  />
                  <Toggle
                    label="Room sounds"
                    detail="Plays short cues for arrivals, muting, and screens going live."
                    checked={settings.roomSounds}
                    onChange={(roomSounds) => setSettings({ ...settings, roomSounds })}
                  />
                </div>
              </SettingsGroup>

              <SettingsGroup
                id="screen"
                icon={<MonitorUp className="size-4" />}
                title="Screen share"
                description="Balance detail, motion, and bandwidth for everyone watching."
              >
                <div
                  className="grid grid-cols-3 gap-2 max-[620px]:grid-cols-1"
                  role="radiogroup"
                  aria-label="Screen quality"
                >
                  <QualityOption
                    id="efficient"
                    label="Efficient"
                    detail="720p · 30 fps"
                    meta="Up to 2.5 Mbps"
                    selected={settings.screenSharePreset === 'efficient'}
                    onSelect={() => setSettings({ ...settings, screenSharePreset: 'efficient' })}
                  />
                  <QualityOption
                    id="balanced"
                    label="Balanced"
                    detail="1080p · 30 fps"
                    meta="Up to 4.5 Mbps"
                    selected={settings.screenSharePreset === 'balanced'}
                    onSelect={() => setSettings({ ...settings, screenSharePreset: 'balanced' })}
                  />
                  <QualityOption
                    id="motion"
                    label="Motion"
                    detail="1080p · 60 fps"
                    meta="Up to 7 Mbps"
                    selected={settings.screenSharePreset === 'motion'}
                    onSelect={() => setSettings({ ...settings, screenSharePreset: 'motion' })}
                  />
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-background/45">
                  <Toggle
                    label="Expand screen levels"
                    detail="Restores true black when a shared screen looks washed out."
                    checked={settings.expandScreenLevels}
                    onChange={(expandScreenLevels) => setSettings({ ...settings, expandScreenLevels })}
                  />
                </div>
              </SettingsGroup>

              <SettingsGroup
                id="connection"
                icon={<Activity className="size-4" />}
                title="Connection"
                description="Choose how aggressively Pulse Room trades stability for lower delay."
              >
                <div
                  className="grid grid-cols-3 gap-2 max-[620px]:grid-cols-1"
                  role="radiogroup"
                  aria-label="Voice delay"
                >
                  <QualityOption
                    id="lowest"
                    group="delay"
                    label="Lowest delay"
                    detail="~69 ms here"
                    meta="Best on a cable"
                    selected={settings.voiceDelay === 'lowest'}
                    onSelect={() => setSettings({ ...settings, voiceDelay: 'lowest' })}
                  />
                  <QualityOption
                    id="balanced"
                    group="delay"
                    label="Balanced"
                    detail="~110 ms here"
                    meta="Survives a hiccup"
                    selected={settings.voiceDelay === 'balanced'}
                    onSelect={() => setSettings({ ...settings, voiceDelay: 'balanced' })}
                  />
                  <QualityOption
                    id="smooth"
                    group="delay"
                    label="Smoothest"
                    detail="~230 ms here"
                    meta="For unstable lines"
                    selected={settings.voiceDelay === 'smooth'}
                    onSelect={() => setSettings({ ...settings, voiceDelay: 'smooth' })}
                  />
                </div>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Lower delay leaves less room for a computer or connection that briefly stalls. Changes apply
                  on the next call.
                </p>
                {props.readHealth && (
                  <div className="settings-health">
                    <CallHealth read={props.readHealth} />
                  </div>
                )}
              </SettingsGroup>

              <SettingsGroup
                id="application"
                icon={<Settings2 className="size-4" />}
                title="Application"
                description="Keep Pulse Room current."
              >
                <div className="update-row flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/45 px-4 py-3.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <strong className="text-[13px] font-semibold text-foreground">Application updates</strong>
                    <span className="text-[11px] text-muted-foreground">{updateCopy}</span>
                  </div>
                  {props.updateStatus.state === 'downloaded' ? (
                    <button
                      className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      type="button"
                      onClick={props.onInstallUpdate}
                    >
                      Restart and update
                    </button>
                  ) : (
                    <button
                      className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                      type="button"
                      onClick={props.onCheckUpdates}
                      disabled={
                        props.updateStatus.state === 'checking' || props.updateStatus.state === 'downloading'
                      }
                    >
                      <RefreshCw
                        size={14}
                        className={props.updateStatus.state === 'checking' ? 'animate-spin' : ''}
                      />{' '}
                      Check now
                    </button>
                  )}
                </div>
              </SettingsGroup>
            </div>
          </div>
        </div>

        <footer className="flex h-[4.25rem] flex-none items-center justify-end gap-2 border-t border-border bg-background/35 px-6">
          <button
            className="secondary-button inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            type="button"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            type="button"
            onClick={() => props.onSave(settings)}
            disabled={!settings.displayName.trim() || (!props.managedAccount && !settings.roomId.trim())}
          >
            Save changes
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsGroup({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: SettingsSection;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={`voice-settings-${id}`} className="settings-section scroll-mt-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="space-y-3 pl-10 max-[620px]:pl-0">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className="field-label flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** A sound device, named in full on its own line rather than clipped. */
function DeviceField({
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
  const Icon = label === 'Microphone' ? Mic2 : Volume2;
  return (
    <div className="field-label flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      <span id={`device-${label}`} className="flex items-center gap-1.5">
        <Icon className="size-3.5" /> {label}
      </span>
      <Select
        value={value ?? 'system'}
        onValueChange={(next) => onChange(next === 'system' ? undefined : next)}
      >
        <SelectTrigger aria-labelledby={`device-${label}`}>
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
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix,
  description,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  description: string;
  onChange(value: number): void;
}) {
  const inputId = `setting-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div className="range-row flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0">
      <span className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        <output className="min-w-11 rounded-md bg-secondary px-2 py-1 text-center font-mono text-[11px] tabular-nums text-secondary-foreground">
          {value}
          {suffix}
        </output>
      </span>
      <input
        id={inputId}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <small>{description}</small>
    </div>
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
  return (
    <label className="toggle-row flex cursor-pointer items-center justify-between gap-4 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/35">
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px] font-medium text-foreground">{label}</strong>
        <small className="max-w-[31rem] leading-4">{detail}</small>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function QualityOption({
  id,
  group = 'quality',
  label,
  detail,
  meta,
  selected,
  onSelect,
}: {
  id: string;
  group?: string;
  label: string;
  detail: string;
  meta: string;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <label
      className={cn(
        'quality-option relative flex min-h-[5.75rem] cursor-pointer flex-col rounded-lg border px-3.5 py-3 transition-colors',
        selected
          ? 'is-selected border-foreground/35 bg-accent text-foreground'
          : 'border-border bg-background/45 text-muted-foreground hover:border-foreground/20 hover:bg-accent/55 hover:text-foreground',
      )}
      htmlFor={`${group}-${id}`}
    >
      <input
        id={`${group}-${id}`}
        className="peer sr-only"
        type="radio"
        name={group}
        checked={selected}
        onChange={onSelect}
      />
      <span className="flex items-center justify-between gap-2">
        <strong className="text-[13px] font-semibold">{label}</strong>
        <span
          className={cn(
            'grid size-3.5 shrink-0 place-items-center rounded-full border',
            selected ? 'border-[4px] border-primary bg-primary-foreground' : 'border-input',
          )}
          aria-hidden="true"
        />
      </span>
      <span className="mt-auto text-[11px] font-medium text-foreground/90">{detail}</span>
      <span className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">{meta}</span>
    </label>
  );
}

function getUpdateCopy(status: UpdateStatus, version: string): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for a newer version…';
    case 'available':
      return `Version ${status.version} is available.`;
    case 'downloading':
      return `Downloading update · ${status.percent}%`;
    case 'downloaded':
      return `Version ${status.version} is ready to install.`;
    case 'error':
      return status.message;
    case 'not-available':
      return `Pulse Room ${status.version} is current.`;
    default:
      return `Pulse Room ${version}`;
  }
}
