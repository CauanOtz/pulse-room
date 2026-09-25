/**
 * Fills a local development server with the room the end-to-end test builds.
 *
 * The test constructs a whole world — two servers, channels, an invitation, a
 * conversation — and then throws it away, because it runs against a database
 * that only exists in memory for the length of the run. That was fine for the
 * test and useless for looking at the application, which is how a development
 * database ends up empty and everybody wonders where the servers went.
 *
 * The accounts and the password are the ones written into
 * tests/e2e/community.spec.ts. They are fixtures rather than secrets: they
 * exist only in a Postgres container on a developer's own machine, and
 * publishing them here is the point, so nobody has to guess.
 *
 *   npm run dev:seed
 *
 * It is safe to run twice. Accounts and servers that already exist are left
 * alone rather than duplicated.
 */
import process from 'node:process';

const api = process.env.PULSE_DEV_API ?? 'http://localhost:3101';
const password = 'Testing private communities!';

const people = [
  { username: 'owner', displayName: 'Owner' },
  { username: 'friend', displayName: 'Friend' },
  { username: 'neighbour', displayName: 'Neighbour' },
];

async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const error = new Error(payload?.error ?? `${method} ${path} answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Registers somebody, or signs them in if this has been run before. */
async function account({ username, displayName }) {
  try {
    const session = await call('/api/auth/register', {
      method: 'POST',
      body: { username, displayName, password },
    });
    console.log(`  created ${username}`);
    return session;
  } catch (error) {
    if (error.status !== 409) throw error;
    console.log(`  ${username} was already here`);
    return call('/api/auth/login', { method: 'POST', body: { username, password } });
  }
}

/** Creates a server for somebody, or finds the one they already have. */
async function server(session, name) {
  const { servers } = await call('/api/servers', { token: session.token });
  const existing = servers.find((entry) => entry.name === name);
  if (existing) {
    console.log(`  ${name} was already here`);
    return existing;
  }
  const created = await call('/api/servers', { method: 'POST', token: session.token, body: { name } });
  console.log(`  created ${name}`);
  return created;
}

async function channel(session, serverId, channel) {
  const detail = await call(`/api/servers/${serverId}`, { token: session.token });
  const existing = detail.channels.find((entry) => entry.name === channel.name);
  if (existing) return existing;
  const { id } = await call(`/api/servers/${serverId}/channels`, {
    method: 'POST',
    token: session.token,
    body: { private: false, memberIds: [], allowSpeak: true, allowShare: true, readOnly: false, ...channel },
  });
  console.log(`  created #${channel.name}`);
  return { id, ...channel };
}

async function seed() {
  console.log(`Seeding ${api}\n`);

  console.log('People');
  const sessions = {};
  for (const person of people) sessions[person.username] = await account(person);

  console.log('\nServers');
  const justUs = await server(sessions.owner, 'Just us');
  const friends = await server(sessions.owner, 'Friends');

  console.log('\nChannels');
  const detail = await call(`/api/servers/${justUs.id}`, { token: sessions.owner.token });
  const general = detail.channels.find((entry) => entry.type === 'text');
  await channel(sessions.owner, friends.id, { name: 'Game room', type: 'voice' });
  await channel(sessions.owner, friends.id, { name: 'clips-and-chaos', type: 'text' });

  console.log('\nA conversation');
  if (general) {
    const { messages } = await call(`/api/channels/${general.id}/messages`, {
      token: sessions.owner.token,
    });
    if (messages.length === 0) {
      for (const content of [
        'Only our little circle.',
        'Anybody up for something tonight?',
        'Give me twenty minutes and I am there.',
      ]) {
        await call(`/api/channels/${general.id}/messages`, {
          method: 'POST',
          token: sessions.owner.token,
          body: { content },
        });
      }
      console.log(`  wrote three messages in #${general.name}`);
    } else {
      console.log(`  #${general.name} already had something to say`);
    }
  }

  console.log('\nInvitations');
  for (const guest of ['friend', 'neighbour']) {
    const { servers } = await call('/api/servers', { token: sessions[guest].token });
    if (servers.some((entry) => entry.id === friends.id)) {
      console.log(`  ${guest} was already in Friends`);
      continue;
    }
    const invite = await call(`/api/servers/${friends.id}/invites`, {
      method: 'POST',
      token: sessions.owner.token,
      body: { maxUses: 2, hours: 168 },
    });
    await call('/api/invites/join', {
      method: 'POST',
      token: sessions[guest].token,
      body: { code: invite.code },
    });
    console.log(`  ${guest} joined Friends`);
  }

  console.log(`\nSign in as any of: ${people.map((person) => person.username).join(', ')}`);
  console.log(`Password for all of them: ${password}`);
}

seed().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}`);
  console.error(`Is the local server running on ${api}?`);
  process.exit(1);
});
