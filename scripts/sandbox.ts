/**
 * A whole Pulse Room to look at, with nothing to install.
 *
 *   npm run sandbox
 *
 * Starts the real token server on a PostgreSQL that lives in memory (PGlite,
 * the same engine the tests use), fills it with people, servers, channels,
 * conversations and invitations in every state, then opens the desktop client
 * pointed at it.
 *
 * The window keeps its own profile folder, so a Pulse Room installed on this
 * machine — its sign-in and its single-instance lock — is never touched.
 * Everything disappears when this process stops. Voice will not connect: the
 * LiveKit values are placeholders, exactly as in the end-to-end tests.
 *
 * The password below is a fixture for this throwaway database only.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { crc32, deflateSync } from 'node:zlib';
import { createServer } from '../server/app';
import { TestDatabase } from '../tests/helpers/database';
import type { AccountSession, CommunityDetail } from '../src/shared/community';

const password = 'Pulse sandbox only!';
const root = process.cwd();

// ------------------------------------------------------------------ pictures

const chunk = (tag: string, payload: Buffer) => {
  const body = Buffer.concat([Buffer.from(tag, 'latin1'), payload]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};
type Rgb = [number, number, number];
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;

/** A real PNG: a diagonal blend with a soft light, so faces are not flat tiles. */
function picture(width: number, height: number, from: string, to: string, glow = 0.35): Buffer {
  const [a, b] = [hex(from), hex(to)];
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const dx = x / width - 0.3;
      const dy = y / height - 0.25;
      const light = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6) * glow;
      for (let c = 0; c < 3; c += 1) {
        const base = a[c] + (b[c] - a[c]) * t;
        raw[row + 1 + x * 3 + c] = Math.min(255, Math.round(base + (255 - base) * light));
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- the world

interface Person {
  username: string;
  displayName: string;
  bio?: string;
  colours: [string, string];
  theme?: { primary: string; accent: string };
  banner?: boolean;
}

const people: Person[] = [
  {
    username: 'you',
    displayName: 'You',
    bio: 'Testing every corner of this place.',
    colours: ['#2b2b2b', '#9a9a9a'],
    banner: true,
  },
  {
    username: 'whoisbabi',
    displayName: 'babi',
    bio: 'Night owl. Ranked at 2am, regrets at 9.',
    colours: ['#3b1d5c', '#e06aa8'],
    theme: { primary: '#7c3aed', accent: '#ec4899' },
    banner: true,
  },
  {
    username: 'maya',
    displayName: 'Maya',
    bio: 'Sound designer. Will judge your microphone.',
    colours: ['#0f3d3e', '#4fd1c5'],
    theme: { primary: '#14b8a6', accent: '#0ea5e9' },
    banner: true,
  },
  { username: 'noah', displayName: 'Noah', colours: ['#3a2a12', '#f2b544'] },
  { username: 'leo', displayName: 'Leo', bio: 'Mostly lurking.', colours: ['#13233f', '#5b8def'] },
  { username: 'jules', displayName: 'Jules', colours: ['#3f1313', '#ef5b5b'], banner: true },
  { username: 'nova', displayName: 'Nova', bio: 'New here. Say hi.', colours: ['#1a1a1a', '#e5e5e5'] },
];

async function freePort(from: number): Promise<number> {
  for (let port = from; port < from + 50; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createNetServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free port near ${from}.`);
}

async function main() {
  const database = new TestDatabase();
  const backend = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://sandbox.invalid',
      LIVEKIT_API_KEY: 'sandbox',
      LIVEKIT_API_SECRET: 'sandbox',
    },
    { read: async () => [] },
    database,
  );
  const apiPort = await freePort(3301);
  await backend.listen({ port: apiPort, host: '127.0.0.1' });
  const api = `http://127.0.0.1:${apiPort}`;

  // Every request looks like it came from somewhere new, so seeding a busy
  // world never trips the rate limits meant for real people.
  let address = 1;
  const call = async <T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    session?: AccountSession,
    payload?: unknown,
    contentType?: string,
  ): Promise<T> => {
    const response = await backend.inject({
      method,
      url,
      payload: payload as never,
      headers: {
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(contentType ? { 'content-type': contentType } : {}),
        'x-forwarded-for': `10.77.${Math.floor(address / 250)}.${(address++ % 250) + 1}`,
      },
    });
    if (response.statusCode >= 400) throw new Error(`${method} ${url}: ${response.statusCode} ${response.body}`);
    return response.json() as T;
  };

  console.log('Seeding the sandbox…');
  const sessions = new Map<string, AccountSession>();
  for (const person of people) {
    const session = await call<AccountSession>('POST', '/api/auth/register', undefined, {
      username: person.username,
      displayName: person.displayName,
      password,
    });
    sessions.set(person.username, session);
    await call('POST', '/api/account/avatar', session, picture(256, 256, ...person.colours), 'image/png');
    if (person.banner)
      await call(
        'POST',
        '/api/account/banner',
        session,
        picture(1000, 400, person.colours[1], person.colours[0], 0.5),
        'image/png',
      );
    if (person.bio) await call('PATCH', '/api/account/profile', session, { bio: person.bio });
    if (person.theme) await call('PATCH', '/api/account/theme', session, { theme: person.theme });
  }
  const as = (username: string) => sessions.get(username)!;
  const idOf = (username: string) => as(username).user.id;

  /** A server, its icon, and a code everybody listed uses to come in. */
  const server = async (owner: string, name: string, colours: [string, string], members: string[]) => {
    const { id } = await call<{ id: string }>('POST', '/api/servers', as(owner), { name });
    await call('POST', `/api/servers/${id}/icon`, as(owner), picture(256, 256, ...colours, 0.45), 'image/png');
    if (members.length) {
      const { code } = await call<{ code: string }>('POST', `/api/servers/${id}/invites`, as(owner), {
        hours: 24,
        maxUses: 100,
      });
      for (const member of members) await call('POST', '/api/invites/join', as(member), { code });
    }
    return id;
  };
  const textChannel = async (owner: string, serverId: string) =>
    (await call<CommunityDetail>('GET', `/api/servers/${serverId}`, as(owner))).channels.find(
      (channel) => channel.type === 'text',
    )!.id;
  const say = (username: string, channelId: string, content: string) =>
    call('POST', `/api/channels/${channelId}/messages`, as(username), { content });

  // Late nights: yours, busy, with a moderator and a second voice room.
  const lateNights = await server('you', 'Late nights', ['#1d1d1d', '#6b7280'], [
    'whoisbabi',
    'maya',
    'noah',
    'leo',
    'jules',
  ]);
  await call('POST', `/api/servers/${lateNights}/channels`, as('you'), {
    name: 'clips-and-chaos',
    type: 'text',
    private: false,
    memberIds: [],
    allowSpeak: true,
    allowShare: true,
    readOnly: false,
  });
  await call('POST', `/api/servers/${lateNights}/channels`, as('you'), {
    name: 'Game room',
    type: 'voice',
    private: false,
    memberIds: [],
    allowSpeak: true,
    allowShare: true,
    readOnly: false,
  });
  const moderator = await call<{ id: string }>('POST', `/api/servers/${lateNights}/roles`, as('you'), {
    name: 'Moderator',
    colour: '#a78bfa',
    permissions: 0b111111111,
    hoist: true,
    description: 'Keeps the peace after midnight.',
  });
  await call('PATCH', `/api/servers/${lateNights}/roles/${moderator.id}/members`, as('you'), {
    addUserIds: [idOf('maya')],
    removeUserIds: [],
  }).catch(() => undefined);
  const general = await textChannel('you', lateNights);
  const lines: [string, string][] = [
    ['whoisbabi', 'anyone up for ranked tonight?'],
    ['maya', 'only if someone fixes their mic first 👀'],
    ['noah', 'that was one time'],
    ['leo', 'it was three times'],
    ['you', 'lounge in ten, bring snacks'],
    ['jules', 'I made a clip of noah missing every shot, posting it in #clips-and-chaos'],
    ['whoisbabi', 'perfect. queueing now'],
  ];
  for (const [who, line] of lines) await say(who, general, line);

  // Studio: babi's, where you are a guest.
  const studio = await server('whoisbabi', 'Studio', ['#3b1d5c', '#e06aa8'], ['you', 'maya']);
  await say('whoisbabi', await textChannel('whoisbabi', studio), 'moodboard for the new cover is up');
  await say('maya', await textChannel('whoisbabi', studio), 'the second one, easily');

  // Servers you are invited to but not in yet.
  const corner = await server('whoisbabi', "babi's corner", ['#1f1235', '#c084fc'], ['maya']);
  const arcade = await server('leo', 'Arcade', ['#0b1d3a', '#60a5fa'], ['noah']);
  const quiet = await server('jules', 'Quiet hours', ['#2a0f0f', '#f87171'], []);

  // ---------------------------------------------------------- direct messages
  const open = async (from: string, to: string) =>
    (await call<{ conversation: { id: string } }>('POST', '/api/directs', as(from), { username: to })).conversation.id;
  const dm = (from: string, conversationId: string, content: string) =>
    call('POST', `/api/directs/${conversationId}/messages`, as(from), { content });
  const invite = (from: string, serverId: string, to: string, note = '') =>
    call<{ conversationId: string; message: { invite?: { id: string } } }>(
      'POST',
      `/api/servers/${serverId}/invites/direct`,
      as(from),
      { username: to, ...(note ? { note } : {}) },
    );

  // babi: a long history over several days, then an invitation waiting for you.
  const withBabi = await open('whoisbabi', 'you');
  const babiHistory: [string, string][] = [
    ['whoisbabi', 'did you see the patch notes?'],
    ['you', 'yeah, they nerfed everything I play'],
    ['whoisbabi', 'classic'],
    ['whoisbabi', 'ok new idea: we stop playing that game'],
    ['you', 'and do what, sleep?'],
    ['whoisbabi', 'never'],
    ['you', 'send me that moodboard when you can'],
    ['whoisbabi', 'it is in Studio already'],
  ];
  for (const [who, line] of babiHistory) await dm(who, withBabi, line);
  await invite('whoisbabi', corner, 'you', 'made a little place for the late crew, come in');
  await dm('whoisbabi', withBabi, 'no pressure but there are snacks');

  // Maya: unread messages waiting.
  const withMaya = await open('maya', 'you');
  await dm('you', withMaya, 'is the new mic any good?');
  await dm('maya', withMaya, 'it is incredible');
  await dm('maya', withMaya, 'I can hear my own heartbeat');
  await dm('maya', withMaya, 'come test it in the Lounge tonight');

  // Leo: an invitation you declined, then one that expired.
  await invite('leo', arcade, 'you', 'retro night every friday');
  const withLeo = (await call<{ conversations: { id: string; peer: { username: string } }[] }>(
    'GET',
    '/api/directs',
    as('you'),
  )).conversations.find((conversation) => conversation.peer.username === 'leo')!.id;
  const leoCard = (await call<{ messages: { invite?: { id: string } }[] }>(
    'GET',
    `/api/directs/${withLeo}/messages`,
    as('you'),
  )).messages.find((message) => message.invite)!.invite!.id;
  await call('POST', `/api/direct-invites/${leoCard}/decline`, as('you'));
  await dm('you', withLeo, 'sorry, fridays are ranked night');
  await dm('leo', withLeo, 'fair. offer stands');
  await invite('jules', quiet, 'you', 'a calm server for focus sessions');

  // Nova: somebody new you invited, still waiting.
  await invite('you', lateNights, 'nova', 'welcome! this is where we hang out');
  const withNova = await open('you', 'nova');
  await dm('nova', withNova, 'hi! thanks for the invite, joining after dinner');

  // Noah: a fresh conversation you opened but nobody wrote in yet.
  await open('you', 'noah');

  // Time travel: spread history across days and expire Jules' invitation.
  await database.query(
    `UPDATE direct_messages m SET created_at = now() - ((x.total - x.position) * interval '7 hours')
    FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position, count(*) OVER () AS total
      FROM direct_messages WHERE conversation_id = $1) x
    WHERE m.id = x.id`,
    [withBabi],
  );
  await database.query(
    `UPDATE direct_invites SET expires_at = now() - interval '1 day' WHERE server_id = $1`,
    [quiet],
  );

  console.log(`Sandbox API on ${api}`);
  console.log('');
  console.log('  Sign in with any of these, password for all of them:');
  console.log(`    ${password}`);
  for (const person of people) console.log(`    ${person.username.padEnd(10)} ${person.displayName}`);
  console.log('');
  console.log('  "you" owns Late nights, is a guest in Studio, and has DMs with');
  console.log('  a pending invite (babi), unread messages (Maya), a declined and');
  console.log('  an expired invite (Leo, Jules) and one you sent (Nova).');
  console.log('');

  // ------------------------------------------------------------ the client
  if (process.argv.includes('--server-only')) return;
  const children: ChildProcess[] = [];
  const run = (command: string, args: string[], env: Record<string, string> = {}) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
    children.push(child);
    return child;
  };
  const stop = () => {
    children.forEach((child) => child.kill());
    void backend.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const vitePort = await freePort(5301);
  run('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { VITE_API_URL: api });
  await new Promise<void>((resolve) => {
    const build = run('npx', ['tsc', '-p', 'tsconfig.electron.json']);
    build.on('exit', () => resolve());
  });
  const url = `http://127.0.0.1:${vitePort}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const up = await fetch(url).then(
      () => true,
      () => false,
    );
    if (up) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const profile = path.join(root, 'coverage', 'sandbox-profile');
  mkdirSync(profile, { recursive: true });
  const window = run('npx', ['electron', '.'], {
    NODE_ENV: 'test',
    PULSE_TEST_USER_DATA: profile,
    VITE_DEV_SERVER_URL: url,
  });
  window.on('exit', stop);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
