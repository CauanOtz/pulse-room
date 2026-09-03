import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { canManage } from '../src/shared/community.js';
import type { CommunityChannel, MemberRole } from '../src/shared/community.js';
import { selectLiveKitConnection, type ServerConfiguration } from './config.js';
import type { Database } from './database.js';
import { CommunityService } from './community-service.js';
import { HttpError } from './security.js';

export const voiceRoomName = (id: string): string => `channel_${id}`;
export function publishSources(channel: CommunityChannel, role: MemberRole): TrackSource[] {
  return [
    ...(channel.allowSpeak || canManage(role) ? [TrackSource.MICROPHONE] : []),
    ...(channel.allowShare || canManage(role)
      ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : []),
  ];
}
export interface VoiceAdministration {
  listRooms(): Promise<{ name: string }[]>;
  listParticipants(room: string): Promise<{ identity: string }[]>;
  removeParticipant(room: string, identity: string): Promise<unknown>;
  updateParticipant(
    room: string,
    identity: string,
    metadata?: string,
    permission?: {
      canSubscribe: boolean;
      canPublish: boolean;
      canPublishData: boolean;
      canPublishSources: TrackSource[];
    },
  ): Promise<unknown>;
}

/** Self-hosted tokens cannot be revoked. Reconcile live access too, including
 * malicious reconnects with a previously issued token, every ten seconds. */
export class VoiceAccessService {
  private running?: Promise<void>;
  readonly client: VoiceAdministration;
  constructor(
    private readonly db: Database,
    private readonly communities: CommunityService,
    config: ServerConfiguration,
    client?: VoiceAdministration,
  ) {
    const connection = selectLiveKitConnection(config);
    this.client =
      client ??
      new RoomServiceClient(
        connection.url.replace('wss:', 'https:'),
        connection.apiKey,
        connection.apiSecret,
      );
  }
  reconcile(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.check().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async check(): Promise<void> {
    for (const room of await this.client.listRooms()) {
      for (const person of await this.client.listParticipants(room.name)) {
        const [userId, sessionId] = person.identity.split(':');
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (
          !room.name.startsWith('channel_') ||
          !uuid.test(room.name.slice(8)) ||
          !uuid.test(userId ?? '') ||
          !uuid.test(sessionId ?? '')
        ) {
          await this.client.removeParticipant(room.name, person.identity);
          continue;
        }
        const session = await this.db.query(
          'SELECT id FROM sessions WHERE id=$1 AND account_id=$2 AND expires_at>now()',
          [sessionId, userId],
        );
        if (!session.rows.length) {
          await this.client.removeParticipant(room.name, person.identity);
          continue;
        }
        try {
          const { channel, role } = await this.communities.channel(userId, room.name.slice(8));
          if (channel.type !== 'voice') throw new HttpError(404, 'Not a voice channel');
          const sources = publishSources(channel, role);
          await this.client.updateParticipant(room.name, person.identity, undefined, {
            canPublish: sources.length > 0,
            canSubscribe: true,
            canPublishData: false,
            canPublishSources: sources,
          });
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          await this.client.removeParticipant(room.name, person.identity);
        }
      }
    }
  }
}
