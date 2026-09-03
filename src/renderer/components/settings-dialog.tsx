import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { noiseGateThresholdDb } from '../domain/conference';
import { MicrophoneMeter } from './microphone-meter';
import type { UserSettings } from '../application/ports/settings-repository';
import type { AvailableMediaDevices } from '../infrastructure/media/media-devices-service';
import type { UpdateStatus } from '../../shared/desktop-api';

interface SettingsDialogProps {
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
    <div className="dialog-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><h2 id="settings-title">Voice and video</h2><p>Tune what your friends hear and what you hear.</p></div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close"><X size={19} /></button>
        </header>

        <div className="settings-body">
          <label className="field-label">
            Display name
            <input value={settings.displayName} onChange={(event) => setSettings({ ...settings, displayName: event.target.value })} />
          </label>
          <label className="field-label">
            Room name
            <input value={settings.roomId} onChange={(event) => setSettings({ ...settings, roomId: event.target.value })} />
          </label>
          <label className="field-label field-span">
            Microphone
            <select value={settings.microphoneDeviceId ?? ''} onChange={(event) => setSettings({ ...settings, microphoneDeviceId: event.target.value || undefined })}>
              <option value="">System default</option>
              {props.devices.microphones.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
            </select>
          </label>
          <label className="field-label field-span">
            Speakers
            <select value={settings.speakerDeviceId ?? ''} onChange={(event) => setSettings({ ...settings, speakerDeviceId: event.target.value || undefined })}>
              <option value="">System default</option>
              {props.devices.speakers.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
            </select>
          </label>
          <div className="mic-status field-span" role="status">
            <span className={props.microphoneLive ? 'is-live' : 'is-off'} />
            {props.microphoneLive
              ? 'Your microphone is live in the room.'
              : props.microphoneProblem ?? 'Your microphone is not publishing.'}
          </div>

          <MicrophoneMeter
            deviceId={settings.microphoneDeviceId}
            gateThresholdDb={noiseGateThresholdDb(settings.noiseGate)}
          />

          <label className="field-label field-span gain-field">
            <span>Microphone gain <strong>{settings.microphoneGain}%</strong></span>
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

          <label className="field-label field-span gain-field">
            <span>Noise gate <strong>{settings.noiseGate}%</strong></span>
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

          <div className="toggle-block field-span">
            <Toggle label="Noise suppression" detail="Filtering from the browser audio engine." checked={settings.noiseSuppression} onChange={(checked) => setSettings({ ...settings, noiseSuppression: checked })} />
            <Toggle label="Echo cancellation" detail="Prevent speaker output from returning through your mic." checked={settings.echoCancellation} onChange={(checked) => setSettings({ ...settings, echoCancellation: checked })} />
            <Toggle label="Automatic gain" detail="Keep quiet and loud speech at a stable level." checked={settings.autoGainControl} onChange={(checked) => setSettings({ ...settings, autoGainControl: checked })} />
            <Toggle label="Expand screen levels" detail="Restores true black when a shared screen looks washed out." checked={settings.expandScreenLevels} onChange={(checked) => setSettings({ ...settings, expandScreenLevels: checked })} />
          </div>

          <fieldset className="quality-field field-span">
            <legend>Screen quality</legend>
            <QualityOption id="efficient" label="Efficient" detail="720p · 30 fps · up to 2.5 Mbps" selected={settings.screenSharePreset === 'efficient'} onSelect={() => setSettings({ ...settings, screenSharePreset: 'efficient' })} />
            <QualityOption id="balanced" label="Balanced" detail="1080p · 30 fps · up to 4.5 Mbps" selected={settings.screenSharePreset === 'balanced'} onSelect={() => setSettings({ ...settings, screenSharePreset: 'balanced' })} />
            <QualityOption id="motion" label="Motion" detail="1080p · 60 fps · up to 7 Mbps" selected={settings.screenSharePreset === 'motion'} onSelect={() => setSettings({ ...settings, screenSharePreset: 'motion' })} />
          </fieldset>

          <div className="update-row field-span">
            <div><strong>Application updates</strong><span>{updateCopy}</span></div>
            {props.updateStatus.state === 'downloaded' ? (
              <button type="button" onClick={props.onInstallUpdate}>Restart and update</button>
            ) : (
              <button type="button" onClick={props.onCheckUpdates} disabled={props.updateStatus.state === 'checking' || props.updateStatus.state === 'downloading'}>
                <RefreshCw size={15} className={props.updateStatus.state === 'checking' ? 'spin' : ''} /> Check now
              </button>
            )}
          </div>
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={props.onClose}>Cancel</button>
          <button className="primary-button" type="button" onClick={() => props.onSave(settings)} disabled={!settings.displayName.trim() || !settings.roomId.trim()}>Save changes</button>
        </footer>
      </section>
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong><small>{detail}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function QualityOption({ id, label, detail, selected, onSelect }: { id: string; label: string; detail: string; selected: boolean; onSelect(): void }) {
  return (
    <label className={`quality-option${selected ? ' is-selected' : ''}`} htmlFor={`quality-${id}`}>
      <input id={`quality-${id}`} type="radio" name="quality" checked={selected} onChange={onSelect} />
      <strong>{label}</strong><span>{detail}</span>
    </label>
  );
}

function getUpdateCopy(status: UpdateStatus, version: string): string {
  switch (status.state) {
    case 'checking': return 'Checking for a newer version…';
    case 'available': return `Version ${status.version} is available.`;
    case 'downloading': return `Downloading update · ${status.percent}%`;
    case 'downloaded': return `Version ${status.version} is ready to install.`;
    case 'error': return status.message;
    case 'not-available': return `Pulse Room ${status.version} is current.`;
    default: return `Pulse Room ${version}`;
  }
}
