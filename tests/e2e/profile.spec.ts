import { _electron as electron, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { inspectImage } from '../../server/image-service';
import { TestDatabase } from '../helpers/database';
import { animatedGif, png } from '../helpers/images';
import type { Account } from '../../src/shared/community';

/**
 * A profile made the way a person would make one: an animated picture chosen
 * from disk and framed in the crop dialog, a banner, two colours, and a server
 * tag worn beside the name. What the service ends up holding is then read back
 * directly, so the test knows the GIF was really cropped frame by frame by the
 * real ImageDecoder in Electron and not flattened on the way.
 */
test('an animated picture, a banner, colours and a server tag, end to end', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-profile-e2e-'));
  const database = new TestDatabase();
  const backend = await createServer(
    { PORT: 0, HOST: '127.0.0.1', LIVEKIT_URL: 'wss://example.invalid', LIVEKIT_API_KEY: 'test', LIVEKIT_API_SECRET: 'test' },
    { read: async () => [] },
    database,
    {
      listRooms: async () => [],
      listParticipants: async () => [],
      removeParticipant: async () => {},
      updateParticipant: async () => {},
    },
  );
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const api = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const frontend = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;

  // Real files on disk, bigger than what they become, so the crop is real.
  const faceGif = path.join(dataDir, 'face.gif');
  const bannerGif = path.join(dataDir, 'banner.gif');
  const bannerPng = path.join(dataDir, 'banner.png');
  await writeFile(faceGif, animatedGif(400, 300, 8));
  await writeFile(bannerGif, animatedGif(1000, 400, 6));
  await writeFile(bannerPng, png(1200, 40, 90, 160, 480));

  const password = 'Testing profiles end to end!';
  let token = '';
  const read = async <T>(url: string): Promise<T> => {
    const response = await fetch(`${api}${url}`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.ok).toBe(true);
    return (await response.json()) as T;
  };
  const picture = async (id: string) => {
    const response = await fetch(`${api}/api/images/${id}`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.ok).toBe(true);
    return { type: response.headers.get('content-type'), bytes: Buffer.from(await response.arrayBuffer()) };
  };
  const me = async () => (await read<{ user: Account }>('/api/auth/me')).user;

  const application = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, NODE_ENV: 'test', PULSE_TEST_USER_DATA: dataDir, VITE_DEV_SERVER_URL: frontend },
  });
  try {
    const window = await application.firstWindow();
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 60_000 });
    await window.getByRole('button', { name: 'Create an account', exact: true }).click();
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Display name', { exact: true }).fill('Owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Create account', exact: true }).click();
    await window.getByRole('button', { name: 'I saved my recovery code' }).click();
    await window.getByRole('button', { name: 'Create or join a server' }).click();
    await window.getByLabel('Server name', { exact: true }).fill('Clube');
    await window.getByRole('button', { name: 'Create server', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText('Clube');

    // A second session for reading back what the service holds.
    const login = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password }),
    });
    token = ((await login.json()) as { token: string }).token;

    // ------------------------------------------------ the server's tag
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    const tagEditor = window.locator('.server-tag-editor');
    await expect(tagEditor).toBeVisible();
    await tagEditor.getByLabel('Tag', { exact: true }).fill('club!');
    // Only letters and digits survive typing: the exclamation mark is gone.
    await expect(tagEditor.getByLabel('Tag', { exact: true })).toHaveValue('club');
    await tagEditor.getByRole('radio', { name: 'Flame' }).click();
    await tagEditor.getByRole('button', { name: 'Colour: #e8508a' }).click();
    await tagEditor.getByRole('button', { name: 'Save tag' }).click();
    await expect(tagEditor.getByRole('status')).toHaveText('Tag saved.');
    await tagEditor.scrollIntoViewIfNeeded();
    await window.screenshot({ path: 'test-results/profile-server-tag.png' });
    await window.getByRole('button', { name: 'Close dialog' }).click();

    // ------------------------------------------------ an animated face
    await window.getByRole('button', { name: 'Your profile' }).click();
    await window.getByRole('button', { name: 'Account settings' }).click();
    const account = window.getByRole('dialog', { name: 'Your account' });
    await account.getByLabel('Profile picture').setInputFiles(faceGif);
    const faceCrop = window.getByRole('dialog', { name: 'Add profile picture' });
    await expect(faceCrop).toContainText('This one moves');
    await faceCrop.getByRole('button', { name: 'Zoom in' }).click();
    await faceCrop.getByRole('button', { name: 'Save picture' }).click();
    await expect(faceCrop).toHaveCount(0, { timeout: 30_000 });

    const face = await picture((await me()).avatarId!);
    expect(face.type).toBe('image/gif');
    // Every frame survived the crop, at the size a face is kept at.
    expect(inspectImage(face.bytes, 'avatar')).toEqual({ mime: 'image/gif', width: 256, height: 256, frames: 8 });

    // ------------------------------------------------ a still banner, then a moving one
    await account.getByLabel('Choose a banner').setInputFiles(bannerPng);
    const bannerCrop = window.getByRole('dialog', { name: 'Add banner' });
    await expect(bannerCrop).not.toContainText('This one moves');
    await bannerCrop.getByRole('button', { name: 'Save banner' }).click();
    await expect(bannerCrop).toHaveCount(0, { timeout: 30_000 });
    const still = await picture((await me()).bannerId!);
    expect(inspectImage(still.bytes, 'banner')).toMatchObject({ width: 900, height: 360, frames: 1 });

    await account.getByLabel('Choose a banner').setInputFiles(bannerGif);
    await expect(bannerCrop).toContainText('This one moves');
    await window.screenshot({ path: 'test-results/profile-banner-crop.png' });
    // The zoom reads as one line: caption, slider, value, side by side.
    const zoom = bannerCrop.getByRole('slider', { name: 'Zoom image' });
    const caption = bannerCrop.getByText('Zoom', { exact: true });
    const [slider, label] = [await zoom.boundingBox(), await caption.boundingBox()];
    expect(Math.abs(slider!.y + slider!.height / 2 - (label!.y + label!.height / 2))).toBeLessThan(6);
    expect(slider!.width).toBeGreaterThan(200);
    await bannerCrop.getByRole('button', { name: 'Save banner' }).click();
    await expect(bannerCrop).toHaveCount(0, { timeout: 60_000 });
    const moving = await picture((await me()).bannerId!);
    expect(moving.type).toBe('image/gif');
    expect(inspectImage(moving.bytes, 'banner')).toEqual({ mime: 'image/gif', width: 600, height: 240, frames: 6 });
    await expect(account.locator('.banner-field .profile-banner')).toHaveAttribute('data-banner', 'picture');

    // ------------------------------------------------ colours, in their own section
    await account.getByRole('button', { name: /^Personalization/ }).click();
    const preview = account.getByRole('img', { name: 'Profile preview' });
    await expect(preview).not.toHaveAttribute('data-themed', 'true');
    await account.getByLabel('Use my own colours').check();
    // The preview changes before anything is saved: trying a colour is free.
    await expect(preview).toHaveAttribute('data-themed', 'true');
    await account.getByRole('button', { name: 'Primary: #2bb5a8' }).click();
    await account.getByRole('button', { name: 'Accent: #6a5acd' }).click();
    expect((await me()).theme).toBeNull();

    // A bio written in another section waits in the same bar as the colours.
    await account.getByRole('button', { name: /^Profile/ }).click();
    await account.getByLabel('Bio').fill('Still here at three in the morning.');
    const pending = account.getByRole('region', { name: 'Unsaved changes' });
    await expect(pending).toBeVisible();
    await window.screenshot({ path: 'test-results/profile-account-pending.png' });
    await pending.getByRole('button', { name: 'Save changes' }).click();
    await expect(pending.getByRole('status')).toHaveText('Changes saved.');
    expect((await me()).theme).toEqual({ primary: '#2bb5a8', accent: '#6a5acd' });
    expect((await me()).bio).toBe('Still here at three in the morning.');

    // ------------------------------------------------ wearing the tag
    await account.getByRole('radio', { name: 'Wear the club tag of Clube' }).check();
    await expect(preview.locator('.server-tag')).toHaveText('club');
    expect((await me()).tag).toMatchObject({ text: 'club', badge: 'flame', colour: '#e8508a', serverName: 'Clube' });
    await window.screenshot({ path: 'test-results/profile-account.png' });
    await window.getByRole('button', { name: 'Close dialog' }).click();

    // ------------------------------------------------ worn everywhere a name is
    const members = window.getByRole('complementary', { name: 'Members' });
    await expect(members.locator('.server-tag')).toHaveText('club');
    await window.getByLabel('Message', { exact: true }).fill('A profile of my own.');
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(window.locator('.chat-message .server-tag').first()).toHaveText('club');

    // A face in a list stays still until the pointer reaches its row.
    const memberFace = members.locator('.member-entry .avatar').first();
    await expect(memberFace).toHaveAttribute('data-animated', 'still');
    await members.locator('.member-entry').first().hover();
    await expect(memberFace).toHaveAttribute('data-animated', 'playing');

    // ------------------------------------------------ the card itself
    await members.getByRole('button', { name: "View Owner's profile" }).click();
    const card = window.getByRole('dialog', { name: 'Owner profile' });
    await expect(card).toHaveAttribute('data-themed', 'true');
    await expect(card.locator('.profile-banner')).toHaveAttribute('data-banner', 'picture');
    await expect(card.locator('.server-tag')).toHaveText('club');
    await expect(card.locator('.avatar')).toHaveAttribute('data-animated', 'playing');
    const bannerShape = await card.locator('.profile-banner').boundingBox();
    expect(bannerShape!.width / bannerShape!.height).toBeCloseTo(2.5, 1);
    await window.screenshot({ path: 'test-results/profile-card.png' });
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
