// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TestDatabase } from '../helpers/database';
import { migrate } from '../../server/database';
import { AccountService } from '../../server/account-service';
import { CommunityService } from '../../server/community-service';

it('keeps accounts, sessions, memberships, channels and messages across database restarts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-db-test-'));
  let db = new TestDatabase(directory);
  try {
    await migrate(db);
    const session = await new AccountService(db).register(
      'persisted',
      'Persisted',
      'A durable test password!',
    );
    const service = new CommunityService(db);
    const community = await service.create(session.user.id, 'Private circle');
    const detail = await service.detail(session.user.id, community.id);
    const text = detail.channels.find((c) => c.type === 'text')!;
    await service.sendMessage(session.user.id, text.id, 'Still here after a restart.');
    await db.close();
    db = new TestDatabase(directory);
    await migrate(db);
    expect((await new AccountService(db).authenticate(session.token)).id).toBe(session.user.id);
    const restored = new CommunityService(db);
    expect((await restored.detail(session.user.id, community.id)).channels).toHaveLength(2);
    expect((await restored.messages(session.user.id, text.id))[0].content).toBe(
      'Still here after a restart.',
    );
    // Ownership transfer is atomic and the old owner may then leave.
    const other = await new AccountService(db).register(
      'successor',
      'Successor',
      'A second durable password!',
    );
    const invite = await restored.invite(session.user.id, community.id, 1, 1);
    await restored.join(other.user.id, invite.code);
    await restored.transfer(session.user.id, community.id, other.user.id);
    expect(await restored.role(other.user.id, community.id)).toBe('owner');
    expect(await restored.role(session.user.id, community.id)).toBe('admin');
    await restored.setMember(session.user.id, community.id, session.user.id, null);
    expect(await restored.list(session.user.id)).toHaveLength(0);
    await restored.deleteServer(other.user.id, community.id);
    expect((await db.query('SELECT id FROM messages WHERE channel_id=$1', [text.id])).rows).toHaveLength(0);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
