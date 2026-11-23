import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';

test('a message can be answered with a quote and its own text corrected in place', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-replies-e2e-'));
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
  const password = 'Testing replies and edits!';
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
  const register = (username: string, displayName: string) =>
    request('/api/auth/register', undefined, { username, displayName, password }) as Promise<AccountSession>;
  const owner = await register('owner', 'Owner');
  const friend = await register('ana', 'Ana Clara');
  const server = await request('/api/servers', owner.token, { name: 'Studio' });
  const invite = await request(`/api/servers/${server.id}/invites`, owner.token, { maxUses: 2, hours: 1 });
  await request('/api/invites/join', friend.token, { code: invite.code });
  const detail = (await request(`/api/servers/${server.id}`, owner.token)) as CommunityDetail;
  const channel = detail.channels.find((each) => each.type === 'text')!;
  const say = (content: string, replyTo?: string) =>
    request(`/api/channels/${channel.id}/messages`, friend.token, {
      content,
      ...(replyTo ? { replyTo } : {}),
    });
  await say('who is up for ranked tonight? I can play after 9');
  await say('also, the new map is out');

  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(dataDir, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: path.join(dataDir, 'profile'),
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const errors: string[] = [];
    window.on('pageerror', (error) => errors.push(error.message));
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    const composer = window.getByRole('textbox', { name: 'Message', exact: true });
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // Reply: the bar says to whom, the answered message keeps a mark.
    const question = window.locator('.chat-message:not(.has-reply)', { hasText: 'who is up for ranked' });
    await question.hover();
    await question.getByRole('button', { name: 'Reply to Ana Clara' }).click();
    await expect(window.locator('.composer-reply')).toContainText('Replying to Ana Clara');
    await expect(question).toHaveClass(/is-replying/);
    await expect(composer).toBeFocused();
    await composer.pressSequentially('me! I will be on at 9:30');
    await window.waitForTimeout(400);
    await window.screenshot({ path: 'test-results/replies-composing.png' });
    await composer.press('Enter');
    await expect(window.locator('.composer-reply')).toHaveCount(0);
    await expect
      .poll(async () =>
        (
          (await request(`/api/channels/${channel.id}/messages`, owner.token)).messages as {
            content: string;
          }[]
        ).some((each) => each.content.includes('9:30')),
      )
      .toBe(true);
    const mine = await request(`/api/channels/${channel.id}/messages`, owner.token);
    const answerId = (mine.messages as { id: string; content: string }[]).find((each) =>
      each.content.includes('9:30'),
    )!.id;
    const answer = window.locator(`#message-${answerId}`);
    await expect(
      answer.getByRole('button', { name: /^Replying to Ana Clara: who is up for ranked/ }),
    ).toBeVisible();

    // Ana answers back, which lights the message up for the owner.
    await say('perfect, see you there', answerId);
    const back = window.locator('.chat-message', { hasText: 'perfect, see you there' });
    await expect(back).toHaveClass(/is-mentioning-me/, { timeout: 10_000 });

    // Up in the empty box edits the last thing written; Enter saves.
    await composer.click();
    await composer.press('ArrowUp');
    const editor = answer.getByRole('textbox', { name: 'Edit message' });
    await expect(editor).toHaveValue('me! I will be on at 9:30');
    await editor.fill('me! I will be on at 10 instead');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/replies-editing.png' });
    await editor.press('Enter');
    await expect(answer).toContainText('me! I will be on at 10 instead');
    await expect(answer.locator('.message-edited')).toHaveText('(edited)');
    // The quote under Ana's answer follows the new words.
    await expect(back.locator('.message-reply')).toContainText('10 instead', { timeout: 10_000 });

    // The quote goes back to what it answers.
    await answer.locator('.message-reply').click();
    await expect(question).toHaveClass(/is-revealed/);
    await window.mouse.move(700, 40);
    await window.waitForTimeout(1_800);
    await window.screenshot({ path: 'test-results/replies-thread.png' });
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
