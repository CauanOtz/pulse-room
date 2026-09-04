import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { noiseGateThresholdDb } from '../domain/conference';
import { MicrophoneMeter } from './microphone-meter';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';
import type { UserSettings } from '../application/ports/settings-repository';
import type {
  AvailableMediaDevices,
  MediaDeviceOption,
} from '../infrastructure/media/media-devices-service';
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
  onClose(): void;
  onSave(settings: UserSettings): void;
  onCheckUpdates(): void;
  onInstallUpdate(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [settings, setSettings] = useState(props.initialSettings);

  useEffect(() => setSettings(props.initialSettings), [props.initialSettings, props.open]);
  if (!props.open) return null;

  const updateCopy = getUpdateCopy(props.updateStatus, props.version);

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={props.onClose}>
      <section
        className="dialog settings-dialog flex max-h-[min(90vh,44rem)] w-[min(38rem,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="settings-title" className="text-lg font-semibold">
              Voice and video
            </h2>
            <p className="text-xs text-muted-foreground">Tune what your friends hear and what you hear.</p>
          </div>
          <button
            className="icon-button grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={props.onClose}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </header>

        <div className="settings-body grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto px-5 py-5">
          {!props.managedAccount && (
            <>
              <label className="field-label flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                Display name
                <input
                  value={settings.displayName}
                  onChange={(event) => setSettings({ ...settings, displayName: event.target.value })}
                />
              </label>
              <label className="field-label flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                Room name
                <input
                  value={settings.roomId}
                  onChange={(event) => setSettings({ ...settings, roomId: event.target.value })}
                />
              </label>
            </>
          )}
          <DeviceField
            label="Microphone"
            value={settings.microphoneDeviceId}
            devices={props.devices.microphones}
            onChange={(deviceId) => setSettings({ ...settings, microphoneDeviceId: deviceId })}
          />
          <DeviceField
            label="Speakers"
            value={settings.speakerDeviceId}
            devices={props.devices.speakers}
            onChange={(deviceId) => setSettings({ ...settings, speakerDeviceId: deviceId })}
          />
          <div className="mic-status field-span col-span-2 flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3.5 py-2.5 text-xs" role="status">
            <span
              className={
                props.microphoneLive
                  ? 'is-live size-2 shrink-0 rounded-full bg-success shadow-[0_0_0_4px] shadow-success/20'
                  : 'is-off size-2 shrink-0 rounded-full bg-destructive shadow-[0_0_0_4px] shadow-destructive/20'
              }
            />
            {props.microphoneLive
              ? 'Your microphone is live in the room.'
              : (props.microphoneProblem ?? 'Your microphone is not publishing.')}
          </div>

          <MicrophoneMeter
            deviceId={settings.microphoneDeviceId}
            gateThresholdDb={noiseGateThresholdDb(settings.noiseGate)}
          />

          <label className="field-label field-span gain-field col-span-2 flex flex-col gap-2 text-xs font-medium text-muted-foreground">
            <span>
              Microphone gain <strong>{settings.microphoneGain}%</strong>
            </span>
            <input
              aria-label="Microphone gain"
              type="range"
              min="0"
              max="150"
              value={settings.microphoneGain}
              onChange={(event) => setSettings({ ...settings, microphoneGain: Number(event.target.value) })}
            />
            <small>A limiter protects the signal when gain goes above 100%.</small>
          </label>

          <label className="field-label field-span gain-field col-span-2 flex flex-col gap-2 text-xs font-medium text-muted-foreground">
            <span>
              Noise gate <strong>{settings.noiseGate}%</strong>
            </span>
            <input
              aria-label="Noise gate"
              type="range"
              min="0"
              max="100"
              value={settings.noiseGate}
              onChange={(event) => setSettings({ ...settings, noiseGate: Number(event.target.value) })}
            />
            <small>Silences fans and keyboards between words. Lower it if your voice gets clipped.</small>
          </label>

          <div className="toggle-block field-span col-span-2 flex flex-col gap-1 rounded-xl border border-border bg-background/60 p-2">
            <Toggle
              label="Noise suppression"
              detail="Filtering from the browser audio engine."
              checked={settings.noiseSuppression}
              onChange={(checked) => setSettings({ ...settings, noiseSuppression: checked })}
            />
            <Toggle
              label="Echo cancellation"
              detail="Prevent speaker output from returning through your mic."
              checked={settings.echoCancellation}
              onChange={(checked) => setSettings({ ...settings, echoCancellation: checked })}
            />
            <Toggle
              label="Automatic gain"
              detail="Keep quiet and loud speech at a stable level."
              checked={settings.autoGainControl}
              onChange={(checked) => setSettings({ ...settings, autoGainControl: checked })}
            />
            <Toggle
              label="Room sounds"
              detail="Short cues for arrivals, muting, and screens going live."
              checked={settings.roomSounds}
              onChange={(checked) => setSettings({ ...settings, roomSounds: checked })}
            />
            <Toggle
              label="Expand screen levels"
              detail="Restores true black when a shared screen looks washed out."
              checked={settings.expandScreenLevels}
              onChange={(checked) => setSettings({ ...settings, expandScreenLevels: checked })}
            />
          </div>

          <fieldset className="quality-field field-span col-span-2 flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Screen quality</legend>
            <QualityOption
              id="efficient"
              label="Efficient"
              detail="720p · 30 fps · up to 2.5 Mbps"
              selected={settings.screenSharePreset === 'efficient'}
              onSelect={() => setSettings({ ...settings, screenSharePreset: 'efficient' })}
            />
            <QualityOption
              id="balanced"
              label="Balanced"
              detail="1080p · 30 fps · up to 4.5 Mbps"
              selected={settings.screenSharePreset === 'balanced'}
              onSelect={() => setSettings({ ...settings, screenSharePreset: 'balanced' })}
            />
            <QualityOption
              id="motion"
              label="Motion"
              detail="1080p · 60 fps · up to 7 Mbps"
              selected={settings.screenSharePreset === 'motion'}
              onSelect={() => setSettings({ ...settings, screenSharePreset: 'motion' })}
            />
          </fieldset>

          <div className="update-row field-span col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className="text-[13px] font-semibold text-foreground">Application updates</strong>
              <span className="text-[11px] text-muted-foreground">{updateCopy}</span>
            </div>
            {props.updateStatus.state === 'downloaded' ? (
              <button
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                type="button"
                onClick={props.onInstallUpdate}
              >
                Restart and update
              </button>
            ) : (
              <button
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                type="button"
                onClick={props.onCheckUpdates}
                disabled={
                  props.updateStatus.state === 'checking' || props.updateStatus.state === 'downloading'
                }
              >
                <RefreshCw
                  size={15}
                  className={props.updateStatus.state === 'checking' ? 'animate-spin' : ''}
                />
                Check now
              </button>
            )}
          </div>
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            className="secondary-button inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            type="button"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
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
  return (
    <div className="field-label field-span col-span-2 flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      <span id={`device-${label}`}>{label}</span>
      <Select value={value ?? 'system'} onValueChange={(next) => onChange(next === 'system' ? undefined : next)}>
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
    <label className="toggle-row flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm">
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px] font-semibold text-foreground">{label}</strong>
        <small className="text-[11px] font-normal text-muted-foreground">{detail}</small>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function QualityOption({
  id,
  label,
  detail,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  detail: string;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <label
      className={cn(
        'quality-option flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        selected ? 'is-selected border-primary bg-primary/10' : 'border-border hover:bg-accent',
      )}
      htmlFor={`quality-${id}`}
    >
      <input
        id={`quality-${id}`}
        className="peer sr-only"
        type="radio"
        name="quality"
        checked={selected}
        onChange={onSelect}
      />
      <span
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-full border',
          selected ? 'border-primary' : 'border-input',
        )}
      >
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px] font-semibold text-foreground">{label}</strong>
        <span className="text-[11px] text-muted-foreground">{detail}</span>
      </span>
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
