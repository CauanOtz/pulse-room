import type { Database } from './database.js';

/**
 * Rules that apply to the whole of Pulse Room rather than to one server, set
 * from the operator's dashboard: whether new accounts can be made, and how
 * much a shared screen may cost the voice server.
 */
export type RegistrationMode = 'open' | 'invite' | 'closed';
export type ScreenShareCeiling = 'efficient' | 'balanced' | 'motion';

const registrationModes: RegistrationMode[] = ['open', 'invite', 'closed'];
const ceilings: ScreenShareCeiling[] = ['efficient', 'balanced', 'motion'];

async function read(db: Database, key: string): Promise<Record<string, unknown>> {
  const {
    rows: [row],
  } = await db.query<{ value: Record<string, unknown> }>('SELECT value FROM platform_settings WHERE key=$1', [
    key,
  ]);
  return row?.value ?? {};
}

/** Open unless the operator said otherwise: an unknown value never locks anybody out. */
export async function registrationMode(db: Database): Promise<RegistrationMode> {
  const { mode } = await read(db, 'registration');
  return registrationModes.find((known) => known === mode) ?? 'open';
}

/** The best a screen may be shared at, or nothing when there is no limit. */
export async function screenShareCeiling(db: Database): Promise<ScreenShareCeiling | null> {
  const { maxPreset } = await read(db, 'screenShare');
  return ceilings.find((known) => known === maxPreset) ?? null;
}
