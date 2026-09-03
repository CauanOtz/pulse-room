import { AccessToken } from 'livekit-server-sdk';
import { selectLiveKitConnection, type ServerConfiguration } from './config.js';

export interface RoomTokenRequest {
  roomId: string;
  participantName: string;
  identity: string;
  sources: number[];
}

export interface RoomTokenResponse {
  serverUrl: string;
  token: string;
}

export class TokenService {
  public constructor(private readonly configuration: ServerConfiguration) {}

  public async issueRoomToken(request: RoomTokenRequest): Promise<RoomTokenResponse> {
    const connection = selectLiveKitConnection(this.configuration);
    const token = new AccessToken(connection.apiKey, connection.apiSecret, {
      identity: request.identity,
      name: request.participantName,
      ttl: '60s',
    });

    token.addGrant({
      room: request.roomId,
      roomJoin: true,
      canPublish: request.sources.length > 0,
      canPublishSources: request.sources,
      canSubscribe: true,
      canPublishData: false,
    });

    return {
      serverUrl: connection.url,
      token: await token.toJwt(),
    };
  }
}
