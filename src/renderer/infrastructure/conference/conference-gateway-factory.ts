import type { ConferenceGateway } from '../../application/ports/conference-gateway';
import { DemoConferenceGateway } from './demo-conference-gateway';
import { LiveKitConferenceGateway } from './livekit-conference-gateway';

export class ConferenceGatewayFactory {
  public static create(): ConferenceGateway {
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    const accessCode = import.meta.env.VITE_ROOM_ACCESS_CODE as string | undefined;

    if (apiUrl && accessCode) {
      return new LiveKitConferenceGateway({ apiUrl: apiUrl.replace(/\/$/, ''), accessCode });
    }

    return new DemoConferenceGateway();
  }
}
