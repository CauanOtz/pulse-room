// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectActivity, findGame, gameOf, musicOf } from '../../src/main/application/activity-detection';

const program = (ProcessName: string, Path: string | null = null, MainWindowTitle = '') => ({
  ProcessName,
  Path,
  MainWindowTitle,
});

describe('what this computer is playing', () => {
  it('names a store game by its folder, ignoring the helpers beside it', () => {
    expect(
      gameOf([
        program(
          'UnityCrashHandler64',
          String.raw`C:\Steam\steamapps\common\Lethal Company\UnityCrashHandler64.exe`,
          'x',
        ),
        program(
          'Lethal Company',
          String.raw`C:\Steam\steamapps\common\Lethal Company\Lethal Company.exe`,
          'Lethal Company',
        ),
      ]),
    ).toBe('Lethal Company');
    expect(gameOf([program('Hades2', String.raw`D:\Epic Games\Hades_II\Ship\Hades2.exe`, 'Hades II')])).toBe(
      'Hades II',
    );
  });

  it('knows the big games by their program, and leaves launchers and services alone', () => {
    expect(
      gameOf([program('VALORANT-Win64-Shipping'), program('Steam', String.raw`C:\Steam\steam.exe`, 'Steam')]),
    ).toBe('VALORANT');
    expect(
      gameOf([
        program('RiotClientServices', String.raw`C:\Riot Games\Riot Client\RiotClientServices.exe`, 'Riot'),
      ]),
    ).toBeNull();
    expect(
      gameOf([
        program('wallpaper64', String.raw`C:\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe`, 'W'),
      ]),
    ).toBeNull();
    // A program in a game folder with no window of its own is not the game.
    expect(gameOf([program('Server', String.raw`C:\Steam\steamapps\common\Rust\Server.exe`, '')])).toBeNull();
    expect(gameOf([program('javaw', String.raw`C:\Java\javaw.exe`, 'Minecraft 1.21.4')])).toBe('Minecraft');
  });

  it('keeps where the game runs from, so its picture can be found', () => {
    const exe = String.raw`C:\Steam\steamapps\common\Hades II\Ship\Hades2.exe`;
    expect(findGame([program('Hades2', exe, 'Hades II')])).toEqual({ name: 'Hades II', path: exe });
    expect(findGame([program('VALORANT-Win64-Shipping')])).toEqual({ name: 'VALORANT' });
  });

  it('reads the song from Spotify only while it plays', () => {
    expect(musicOf([program('Spotify', null, 'Frank Ocean - Nights')])).toEqual({
      artist: 'Frank Ocean',
      title: 'Nights',
    });
    expect(musicOf([program('Spotify', null, 'Spotify Premium'), program('Spotify', null, '')])).toBeNull();
    expect(musicOf([program('Spotify', null, 'Daft Punk - Harder, Better, Faster - Live')])).toEqual({
      artist: 'Daft Punk',
      title: 'Harder, Better, Faster - Live',
    });
    expect(detectActivity([])).toEqual({ game: null, music: null });
  });
});

describe('the song clock', () => {
  it('reads like a player', async () => {
    const { songClock } = await import('../../src/renderer/components/profile-activity');
    expect([songClock(0), songClock(52.9), songClock(346), songClock(3_765)]).toEqual([
      '0:00',
      '0:52',
      '5:46',
      '1:02:45',
    ]);
  });
});

describe('finding a game in a store by its name', () => {
  it('takes the game itself, not its coins, its sequel or its spin-off', async () => {
    const { sameGame } = await import('../../src/main/application/game-art');
    expect(sameGame("Tom Clancy's Rainbow Six® Siege", 'Rainbow Six Siege')).toBe(true);
    expect(sameGame('Roblox - Xbox', 'Roblox')).toBe(true);
    expect(sameGame('Roblox - Windows', 'Roblox')).toBe(true);
    expect(sameGame('VALORANT PC', 'VALORANT')).toBe(true);
    expect(sameGame('Hades II', 'Hades II')).toBe(true);
    expect(sameGame('22,500 Robux for Xbox', 'Roblox')).toBe(false);
    expect(sameGame('Minecraft Legends', 'Minecraft')).toBe(false);
    expect(sameGame('Hades', 'Hades II')).toBe(false);
    expect(sameGame("Tom Clancy's Rainbow Six® Siege - Ultra HD Texture Pack", 'Rainbow Six Siege')).toBe(
      false,
    );
  });
});

describe('reading the media controls', () => {
  it('asks PowerShell for UTF-8, so accented titles arrive whole', async () => {
    const { mediaSessionCommand, utf8Output } = await import('../../src/main/application/media-session');
    const args = mediaSessionCommand('Coração|Diva Depressão');
    const script = Buffer.from(args[args.length - 1]!, 'base64').toString('utf16le');
    expect(script).toContain(utf8Output);
    expect(script.indexOf(utf8Output)).toBeLessThan(script.indexOf('ConvertTo-Json'));
    expect(script).toContain("$Known = 'Coração|Diva Depressão'");
  });
});
