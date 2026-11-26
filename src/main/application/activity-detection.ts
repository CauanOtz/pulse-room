/**
 * What this computer is playing and listening to, read from the programs that
 * are running. No game is registered anywhere: a game is recognised by the
 * folder its store installed it in, or by a short list of well-known names,
 * and Spotify by the title of its window, which names the song while it plays.
 */

export interface RunningProcess {
  ProcessName: string;
  Path?: string | null;
  MainWindowTitle?: string | null;
}

export interface DetectedActivity {
  game: string | null;
  music: { title: string; artist: string } | null;
}

/** Games known by the program they run, for those installed outside a store library. */
const knownGames: Record<string, string> = {
  'valorant-win64-shipping': 'VALORANT',
  'league of legends': 'League of Legends',
  cs2: 'Counter-Strike 2',
  csgo: 'Counter-Strike: Global Offensive',
  'fortniteclient-win64-shipping': 'Fortnite',
  r5apex: 'Apex Legends',
  r5apex_dx12: 'Apex Legends',
  dota2: 'Dota 2',
  overwatch: 'Overwatch 2',
  robloxplayerbeta: 'Roblox',
  'minecraft.windows': 'Minecraft',
  gta5: 'Grand Theft Auto V',
  gta5_enhanced: 'Grand Theft Auto V',
  rocketleague: 'Rocket League',
  rainbowsix: 'Rainbow Six Siege',
  rainbowsix_be: 'Rainbow Six Siege',
  tslgame: 'PUBG: Battlegrounds',
  destiny2: 'Destiny 2',
  eldenring: 'Elden Ring',
  cyberpunk2077: 'Cyberpunk 2077',
  genshinimpact: 'Genshin Impact',
  rustclient: 'Rust',
  'marvel-win64-shipping': 'Marvel Rivals',
  helldivers2: 'HELLDIVERS 2',
  fc25: 'EA SPORTS FC 25',
  fc26: 'EA SPORTS FC 26',
  'among us': 'Among Us',
  terraria: 'Terraria',
  'stardew valley': 'Stardew Valley',
};

/** Store libraries: the folder right after one of these is the game's own. */
const libraries: { marker: RegExp; skip: RegExp }[] = [
  {
    marker: /\\steamapps\\common\\([^\\]+)\\/i,
    skip: /^(steamworks shared|steamvr|steam controller configs|wallpaper_engine)$/i,
  },
  { marker: /\\Epic Games\\([^\\]+)\\/i, skip: /^(launcher|epic online services)$/i },
  { marker: /\\Riot Games\\([^\\]+)\\/i, skip: /^(riot client|vanguard)$/i },
  { marker: /\\XboxGames\\([^\\]+)\\/i, skip: /^gameSave$/i },
  { marker: /\\EA Games\\([^\\]+)\\/i, skip: /^$/ },
  { marker: /\\Ubisoft Game Launcher\\games\\([^\\]+)\\/i, skip: /^$/ },
];

/** Helpers that live in a game's folder without being the game. */
const helpers = /(crash|report|anticheat|easyanticheat|battleye|launcher|updater|helper|setup|redist|unins)/i;

/** Spotify's title while nothing plays, in any of its editions. */
const idleSpotify = /^(spotify|spotify premium|spotify free|advertisement|spotify\s*-\s*web player)$/i;

const tidy = (name: string) => name.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A game found running: its name, and where its program is, for its picture. */
export interface FoundGame {
  name: string;
  path?: string;
}

export function findGame(processes: readonly RunningProcess[]): FoundGame | null {
  for (const process of processes) {
    const known = knownGames[process.ProcessName.toLowerCase()];
    if (known) return { name: known, ...(process.Path ? { path: process.Path } : {}) };
  }
  for (const process of processes) {
    // A game has a window of its own; a service or a helper beside it does not.
    if (!process.Path || !process.MainWindowTitle?.trim() || helpers.test(process.ProcessName)) continue;
    for (const library of libraries) {
      const folder = library.marker.exec(process.Path)?.[1];
      if (folder && !library.skip.test(folder)) return { name: tidy(folder), path: process.Path };
    }
  }
  // Minecraft Java runs as Java; its window says what it is.
  const java = processes.find(
    (process) => /^javaw?$/i.test(process.ProcessName) && /minecraft/i.test(process.MainWindowTitle ?? ''),
  );
  return java ? { name: 'Minecraft' } : null;
}

export function gameOf(processes: readonly RunningProcess[]): string | null {
  return findGame(processes)?.name ?? null;
}

export function musicOf(processes: readonly RunningProcess[]): DetectedActivity['music'] {
  for (const process of processes) {
    if (process.ProcessName.toLowerCase() !== 'spotify') continue;
    const title = process.MainWindowTitle?.trim();
    if (!title || idleSpotify.test(title)) continue;
    const split = title.indexOf(' - ');
    if (split <= 0) continue;
    return { artist: title.slice(0, split).trim(), title: title.slice(split + 3).trim() };
  }
  return null;
}

export function detectActivity(processes: readonly RunningProcess[]): DetectedActivity {
  return { game: gameOf(processes), music: musicOf(processes) };
}
