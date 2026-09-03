import type { ConferenceGateway } from '../../application/ports/conference-gateway';
import { DemoConferenceGateway } from './demo-conference-gateway';
import { LiveKitConferenceGateway } from './livekit-conference-gateway';
import { PresenceClient } from './presence-client';

function roomService(): { apiUrl: string; accessCode: string } | undefined {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const accessCode = import.meta.env.VITE_ROOM_ACCESS_CODE as string | undefined;
  if (!apiUrl || !accessCode) return undefined;
  return { apiUrl: apiUrl.replace(/\/$/, ''), accessCode };
}

export class ConferenceGatewayFactory {
  public static create(): ConferenceGateway {
    const service = roomService();
    return service ? new LiveKitConferenceGateway(service) : new DemoConferenceGateway();
  }

  public static createPresenceClient(): PresenceClient {
    return new PresenceClient(roomService());
  }
}
