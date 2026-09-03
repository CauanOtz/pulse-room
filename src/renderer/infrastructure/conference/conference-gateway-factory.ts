import type { ConferenceGateway } from '../../application/ports/conference-gateway';
import { DemoConferenceGateway } from './demo-conference-gateway';
import { LiveKitConferenceGateway } from './livekit-conference-gateway';

export class ConferenceGatewayFactory {
  public static create(configuration?: { apiUrl: string; accessCode: string }): ConferenceGateway {
    const service = configuration;
    return service ? new LiveKitConferenceGateway(service) : new DemoConferenceGateway();
  }
}
