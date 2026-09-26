import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { has, Permission } from '../src/shared/permissions.js';
import { selectLiveKitConnection, type ServerConfiguration } from './config.js';
import type { Database } from './database.js';
import { CommunityService } from './community-service.js';
import { HttpError } from './security.js';

export const voiceRoomName = (id: string): string => `channel_${id}`;
/** What somebody may send into a call, from what they may do in its channel. */
export function publishSources(permissions: number): TrackSource[] {
  return [
    ...(has(permissions, Permission.Speak) ? [TrackSource.MICROPHONE] : []),
    ...(has(permissions, Permission.ShareScreen) ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
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
  /** Takes one person out of whichever calls they are in. */
  async disconnect(userId: string): Promise<void> {
    for (const room of await this.client.listRooms())
      for (const person of await this.client.listParticipants(room.name))
        if (person.identity.startsWith(`${userId}:`)) await this.client.removeParticipant(room.name, person.identity);
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
          const { channel, permissions, access } = await this.communities.channel(userId, room.name.slice(8));
          if (channel.type !== 'voice') throw new HttpError(404, 'Not a voice channel');
          if (!has(permissions, Permission.Connect)) throw new HttpError(403, 'Not allowed in this call');
          const sources = publishSources(permissions);
          await this.client.updateParticipant(room.name, person.identity, undefined, {
            canPublish: sources.length > 0,
            canSubscribe: !access.deafened,
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
