import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { selectLiveKitConnection, type ServerConfiguration } from './config.js';

export interface RoomTokenRequest {
  roomId: string;
  participantName: string;
}

export interface RoomTokenResponse {
  serverUrl: string;
  token: string;
}

export class TokenService {
  public constructor(private readonly configuration: ServerConfiguration) {}

  public async issueRoomToken(request: RoomTokenRequest): Promise<RoomTokenResponse> {
    const connection = selectLiveKitConnection(this.configuration);
    const identity = `${this.slugify(request.participantName)}-${randomUUID().slice(0, 8)}`;
    const token = new AccessToken(
      connection.apiKey,
      connection.apiSecret,
      {
        identity,
        name: request.participantName,
        ttl: '6h',
      },
    );

    token.addGrant({
      room: request.roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      serverUrl: connection.url,
      token: await token.toJwt(),
    };
  }

  private slugify(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'friend';
  }
}
