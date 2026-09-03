import type { ChannelOccupancy } from '../../domain/roster';

export interface PresenceClientConfiguration {
  apiUrl: string;
  accessCode: string;
}

/** Asks the service who is sitting in the voice channels nobody here joined. */
export class PresenceClient {
  public constructor(private readonly configuration?: PresenceClientConfiguration) {}

  public get available(): boolean {
    return Boolean(this.configuration);
  }

  public async read(): Promise<ChannelOccupancy[]> {
    if (!this.configuration) return [];

    try {
      const response = await fetch(`${this.configuration.apiUrl}/api/presence`, {
        headers: { authorization: `Bearer ${this.configuration.accessCode}` },
      });
      if (!response.ok) return [];
      const body = (await response.json()) as { rooms?: ChannelOccupancy[] };
      return body.rooms ?? [];
    } catch {
      return [];
    }
  }
}
