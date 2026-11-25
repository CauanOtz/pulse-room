import { RoomServiceClient } from 'livekit-server-sdk';
import { selectLiveKitConnection, type ServerConfiguration } from './config.js';

export interface RoomOccupant {
  identity: string;
  name: string;
  /** When they joined, in milliseconds since the epoch, as the voice server saw it. */
  joinedAt?: number;
}

export interface RoomOccupancy {
  roomId: string;
  occupants: RoomOccupant[];
}

export interface PresenceSource {
  read(): Promise<RoomOccupancy[]>;
}

/** The slice of the LiveKit admin API this needs, so it can be substituted. */
export interface RoomAdminClient {
  listRooms(): Promise<{ name: string }[]>;
  listParticipants(
    room: string,
  ): Promise<{ identity: string; name: string; joinedAt?: bigint | number; joinedAtMs?: bigint | number }[]>;
}

/**
 * Reads who is sitting in every voice room.
 *
 * A client only ever sees the room it joined, so the answer has to come from
 * the service side. Answers are cached briefly because every open application
 * asks for this on a timer, and the rooms change far more slowly than that.
 */
export class LiveKitPresenceSource implements PresenceSource {
  private readonly client: RoomAdminClient;
  private cached?: { at: number; rooms: RoomOccupancy[] };
  private reading?: Promise<RoomOccupancy[]>;

  public constructor(
    configuration: ServerConfiguration,
    client?: RoomAdminClient,
    private readonly cacheMilliseconds = 2_000,
    private readonly now: () => number = Date.now,
  ) {
    const connection = selectLiveKitConnection(configuration);
    this.client =
      client ??
      new RoomServiceClient(
        connection.url.replace(/^wss:/, 'https:'),
        connection.apiKey,
        connection.apiSecret,
      );
  }

  public async read(): Promise<RoomOccupancy[]> {
    const cached = this.cached;
    if (cached && this.now() - cached.at < this.cacheMilliseconds) return cached.rooms;

    // All open clients can reach an expired cache together. Share the lookup
    // until it settles, including failures, instead of multiplying LiveKit work.
    this.reading ??= this.readOccupancy().finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  private async readOccupancy(): Promise<RoomOccupancy[]> {
    const rooms = await this.client.listRooms();
    const occupancy = await Promise.all(
      rooms.map(async (room) => {
        try {
          const participants = await this.client.listParticipants(room.name);
          return {
            roomId: room.name,
            occupants: participants.map((participant) => ({
              identity: participant.identity,
              name: participant.name || participant.identity,
              ...joinedOf(participant),
            })),
          };
        } catch {
          // An empty room is torn down moments after the last person leaves,
          // and one room disappearing must not blank out all the others.
          return { roomId: room.name, occupants: [] };
        }
      }),
    );

    this.cached = { at: this.now(), rooms: occupancy };
    return occupancy;
  }
}

/** The moment somebody joined, from whichever field this LiveKit version fills. */
function joinedOf(participant: { joinedAt?: bigint | number; joinedAtMs?: bigint | number }): {
  joinedAt?: number;
} {
  const milliseconds = Number(participant.joinedAtMs ?? 0) || Number(participant.joinedAt ?? 0) * 1000;
  return milliseconds > 0 ? { joinedAt: milliseconds } : {};
}
