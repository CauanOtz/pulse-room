import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import type { LiveEvent } from '../../src/shared/live';

test('messages, typing and server changes arrive without waiting for a timer', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-live-e2e-'));
  const backend = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
    },
    { read: async () => [] },
    new TestDatabase(),
  );
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const port = (backend.server.address() as { port: number }).port;
  const api = `http://127.0.0.1:${port}`;
  const password = 'Testing live conversations!';
  const request = async (route: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${api}${route}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return response.json();
  };
  const register = (username: string) =>
    request('/api/auth/register', undefined, {
      username,
      displayName: username[0].toUpperCase() + username.slice(1),
      password,
    }) as Promise<AccountSession>;
  const owner = await register('owner');
  const friend = await register('friend');
  // Joins and never opens the application again.
  const sleeper = await register('sleeper');
  const server = await request('/api/servers', owner.token, { name: 'Studio' });
  const invite = await request(`/api/servers/${server.id}/invites`, owner.token, { maxUses: 3, hours: 1 });
  await request('/api/invites/join', friend.token, { code: invite.code });
  await request('/api/invites/join', sleeper.token, { code: invite.code });
  const detail = (await request(`/api/servers/${server.id}`, owner.token)) as CommunityDetail;
  const channel = detail.channels.find((item) => item.type === 'text')!;

  // The friend is a bare socket: what another copy of the application sends.
  const heard: LiveEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/live`);
  socket.on('message', (data) => heard.push(JSON.parse(String(data)) as LiveEvent));
  await new Promise<void>((resolve) => socket.once('open', () => resolve()));
  socket.send(JSON.stringify({ type: 'auth', token: friend.token }));
  socket.send(JSON.stringify({ type: 'watch', channelId: channel.id }));

  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: dataDir,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const errors: string[] = [];
    window.on('pageerror', (error) => errors.push(error.message));
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    // The password check alone can take seconds on a CI runner.
    await expect(window.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible({ timeout: 15_000 });
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );

    // Once the window is connected and watching, the friend's typing shows.
    const typing = window.locator('.typing-line-body', { hasText: 'Friend is typing' });
    await expect(async () => {
      socket.send(JSON.stringify({ type: 'typing', channelId: channel.id }));
      await expect(typing).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(window.locator('.typing-line-body')).toContainText('Friend is typing');
    await window.waitForTimeout(500);
    await window.screenshot({ path: 'test-results/live-typing.png' });

    // The message lands at once (the timer is thirty seconds while connected)
    // and the typing line goes with it.
    await request(`/api/channels/${channel.id}/messages`, friend.token, { content: 'Right on time' });
    await expect(window.getByText('Right on time')).toBeVisible({ timeout: 2_000 });
    await expect(window.locator('.typing-line-body')).toHaveCount(0, { timeout: 2_000 });

    // Typing here reaches the friend, under the name they know.
    await window.getByRole('textbox', { name: 'Message', exact: true }).pressSequentially('on my way');
    await expect
      .poll(() => heard.find((event) => event.type === 'typing'), { timeout: 3_000 })
      .toMatchObject({ type: 'typing', channelId: channel.id, userId: owner.user.id, name: 'Owner' });
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(() => heard.find((event) => event.type === 'channel' && event.authorId === owner.user.id), {
        timeout: 3_000,
      })
      .toEqual({ type: 'channel', channelId: channel.id, authorId: owner.user.id });

    // A change made elsewhere to the server shows without a reload.
    await request(`/api/servers/${server.id}`, owner.token, { name: 'Night shift' }, 'PATCH');
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText(
      'Night shift',
      { timeout: 2_000 },
    );

    // Here and away: the friend's socket is open, the sleeper has been silent.
    const members = window.getByRole('complementary', { name: 'Members' });
    const entry = (name: string) => members.locator('.member-entry', { hasText: name });
    await expect(entry('Friend').getByRole('img', { name: 'Online' })).toBeVisible();
    await expect(entry('Sleeper').getByRole('img', { name: 'Offline' })).toBeVisible({ timeout: 60_000 });
    await expect(members.getByText('Offline — 1')).toBeVisible();
    await window.waitForTimeout(400);
    await window.screenshot({ path: 'test-results/live-status.png' });
    // Closing the friend's only connection takes them away, after the grace period.
    socket.close();
    await expect(entry('Friend').getByRole('img', { name: 'Offline' })).toBeVisible({ timeout: 30_000 });
    await expect(members.getByText('Offline — 2')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    socket.terminate();
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
