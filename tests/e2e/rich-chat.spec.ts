import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import { png } from '../helpers/images';
import type { AccountSession, ChatMessage, CommunityDetail } from '../../src/shared/community';

function wave() {
  const data = Buffer.alloc(44 + 1600);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(1600, 40);
  return data;
}

test('uploads media, inserts emojis, reacts, browses shared tabs and removes attachment access with a message', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-rich-chat-'));
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
  const api = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const password = 'Testing rich chat end to end!';
  const request = async (route: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${api}${route}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.ok).toBe(true);
    return response.json();
  };
  const register = (username: string) =>
    request('/api/auth/register', undefined, {
      username,
      displayName: username === 'owner' ? 'Owner' : 'Friend',
      password,
    }) as Promise<AccountSession>;
  const owner = await register('owner');
  const friend = await register('friend');
  const server = await request('/api/servers', owner.token, { name: 'Studio' });
  const invite = await request(`/api/servers/${server.id}/invites`, owner.token, { maxUses: 2, hours: 1 });
  await request('/api/invites/join', friend.token, { code: invite.code });
  const detail = (await request(`/api/servers/${server.id}`, owner.token)) as CommunityDetail;
  const channel = detail.channels.find((channel) => channel.type === 'text')!;
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
    await expect(window.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1572, 870),
    );

    // A genuine WebM made by Chromium; no fabricated file that only has a header.
    const video = Buffer.from(
      await window.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#30373b';
        context.fillRect(0, 0, 160, 90);
        const stream = canvas.captureStream(20);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const chunks: BlobPart[] = [];
        const result = new Promise<number[]>((resolve) => {
          recorder.ondataavailable = (event) => chunks.push(event.data);
          recorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
          };
        });
        recorder.start();
        const draw = setInterval(() => {
          context.fillStyle = `rgb(${Math.floor(Math.random() * 80)}, 55, 60)`;
          context.fillRect(0, 0, 160, 90);
        }, 50);
        await new Promise((resolve) => setTimeout(resolve, 650));
        clearInterval(draw);
        recorder.stop();
        return result;
      }),
    );
    await window
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('A studio take and a moodboard. https://example.com/studio ');
    await window.getByRole('button', { name: 'Add emoji', exact: true }).click();
    await window.getByRole('textbox', { name: 'Search emojis' }).fill('headphones');
    await window.getByRole('button', { name: '🎧 headphones music', exact: true }).click();
    await expect(window.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/🎧/);
    await window.getByLabel('Choose attachments', { exact: true }).setInputFiles([
      { name: 'moodboard.png', mimeType: 'image/png', buffer: png(480, 91, 102, 108, 300) },
      { name: 'studio-take.wav', mimeType: 'audio/wav', buffer: wave() },
      { name: 'session-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') },
      { name: 'studio-clip.webm', mimeType: 'video/webm', buffer: video },
    ]);
    await expect(window.locator('.pending-attachment')).toHaveCount(4);
    await window.getByRole('button', { name: 'Remove session-notes.pdf' }).click();
    await expect(window.locator('.pending-attachment')).toHaveCount(3);
    await window
      .getByLabel('Choose attachments', { exact: true })
      .setInputFiles([
        { name: 'session-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') },
      ]);
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    const message = window.locator('.chat-message').filter({ hasText: 'A studio take and a moodboard.' });
    await expect(message.locator('.chat-attachment')).toHaveCount(4);
    await expect(window.locator('.pending-attachment')).toHaveCount(0);
    await expect(
      message.getByRole('link', { name: 'https://example.com/studio', exact: true }),
    ).toHaveAttribute('target', '_blank');
    await expect(async () =>
      expect(await message.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(
        480,
      ),
    ).toPass();

    await message.hover();
    await message.getByRole('button', { name: 'React to message from Owner' }).click();
    await window.getByRole('textbox', { name: 'Search emojis' }).fill('thumbs up');
    await window.getByRole('button', { name: '👍 thumbs up like', exact: true }).click();
    await expect(message.getByRole('button', { name: '👍, 1 reaction, including you' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const saved = (await request(`/api/channels/${channel.id}/messages`, owner.token))
      .messages[0] as ChatMessage;
    await request(
      `/api/channels/${channel.id}/messages/${saved.id}/reactions`,
      friend.token,
      { emoji: '👍' },
      'PUT',
    );
    await expect(message.getByRole('button', { name: '👍, 2 reactions, including you' })).toBeVisible();
    await message.getByRole('button', { name: '👍, 2 reactions, including you' }).click();
    await expect(message.getByRole('button', { name: '👍, 1 reaction', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await window.getByRole('tab', { name: /Members/, exact: false }).click();
    await window.getByRole('button', { name: 'Add emoji', exact: true }).hover();
    await window.screenshot({ path: 'test-results/rich-chat-conversation.png' });
    await application.evaluate(({ shell }) => {
      (globalThis as { richChatOpened?: string[] }).richChatOpened = [];
      shell.openExternal = async (url) => {
        (globalThis as { richChatOpened?: string[] }).richChatOpened!.push(url);
      };
    });
    await message.getByRole('link', { name: 'https://example.com/studio', exact: true }).click();
    await expect
      .poll(() => application.evaluate(() => (globalThis as { richChatOpened?: string[] }).richChatOpened))
      .toEqual(['https://example.com/studio']);

    await message.getByRole('button', { name: 'Open moodboard.png', exact: true }).click();
    await expect(window.getByRole('dialog', { name: 'moodboard.png' })).toBeVisible();
    await window.getByRole('button', { name: 'Close media preview' }).click();
    await message.getByRole('button', { name: 'Play studio-take.wav' }).click();
    await expect(async () =>
      expect(
        await message.locator('audio').evaluate((media) => (media as HTMLMediaElement).readyState),
      ).toBeGreaterThan(0),
    ).toPass();
    await message.getByRole('button', { name: 'Play studio-clip.webm' }).click();
    await expect
      .poll(
        () =>
          message.locator('video').evaluate((media) => ({
            ready: (media as HTMLMediaElement).readyState > 0,
            error: (media as HTMLMediaElement).error?.message,
            network: (media as HTMLMediaElement).networkState,
            source: (media as HTMLMediaElement).currentSrc,
          })),
        { timeout: 15000 },
      )
      .toMatchObject({ ready: true });
    await message.locator('video').evaluate(async (element) => {
      const video = element as HTMLVideoElement;
      await video.play();
      video.pause();
    });
    const downloadPath = path.join(dataDir, 'session-notes.pdf');
    await application.evaluate(({ BrowserWindow }, destination) => {
      BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
        item.setSavePath(destination);
      });
    }, downloadPath);
    await message.getByRole('button', { name: 'Download session-notes.pdf', exact: true }).last().click();
    await expect.poll(async () => readFile(downloadPath, 'utf8').catch(() => '')).toBe('%PDF-1.4\n%%EOF\n');
    await window.getByRole('tab', { name: 'Media', exact: true }).click();
    await expect(
      window.getByRole('complementary', { name: 'Media', exact: true }).locator('.chat-attachment'),
    ).toHaveCount(4);
    const library = window.getByRole('complementary', { name: 'Media', exact: true });
    await expect(library.locator('.resource-gallery .chat-attachment')).toHaveCount(2);
    await expect(
      library.getByRole('region', { name: 'Files', exact: true }).locator('.chat-attachment'),
    ).toHaveCount(2);
    await library.getByRole('button', { name: 'Open studio-clip.webm', exact: true }).click();
    const videoPreview = window.getByRole('dialog', { name: 'studio-clip.webm', exact: true });
    await expect(videoPreview).toBeVisible();
    await expect
      .poll(() => videoPreview.locator('video').evaluate((video) => (video as HTMLVideoElement).videoWidth))
      .toBe(160);
    await window.getByRole('button', { name: 'Close media preview' }).click();
    await window.screenshot({ path: 'test-results/rich-chat-media.png' });
    await window.getByRole('tab', { name: 'Links', exact: true }).click();
    await expect(
      window.getByRole('complementary', { name: 'Links', exact: true }).getByRole('link'),
    ).toHaveAttribute('href', 'https://example.com/studio');
    await window.screenshot({ path: 'test-results/rich-chat-links.png' });
    await window.reload();
    await expect(window.getByRole('button', { name: '👍, 1 reaction', exact: true })).toBeVisible();
    await window.getByRole('tab', { name: 'Media', exact: true }).click();
    await expect(
      window.getByRole('complementary', { name: 'Media', exact: true }).locator('.chat-attachment'),
    ).toHaveCount(4);
    await message.hover();
    await message.getByRole('button', { name: 'Delete message from Owner' }).click();
    await expect(message).toHaveCount(0);
    await expect(
      window.getByRole('complementary', { name: 'Media', exact: true }).getByText('No media yet'),
    ).toBeVisible();
    const removed = await fetch(`${api}/api/channels/${channel.id}/attachments/${saved.attachments![0].id}`, {
      headers: { authorization: `Bearer ${friend.token}` },
    });
    expect(removed.status).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
