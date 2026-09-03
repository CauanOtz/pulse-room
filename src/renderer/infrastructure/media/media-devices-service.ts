export interface MediaDeviceOption {
  id: string;
  label: string;
}

export interface AvailableMediaDevices {
  microphones: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
}

export class MediaDevicesService {
  public async list(): Promise<AvailableMediaDevices> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { microphones: [], speakers: [] };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      microphones: this.mapDevices(devices, 'audioinput', 'Microphone'),
      speakers: this.mapDevices(devices, 'audiooutput', 'Speaker'),
    };
  }

  private mapDevices(
    devices: MediaDeviceInfo[],
    kind: MediaDeviceKind,
    fallbackName: string,
  ): MediaDeviceOption[] {
    return devices
      .filter((device) => device.kind === kind)
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `${fallbackName} ${index + 1}`,
      }));
  }
}
