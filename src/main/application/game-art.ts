import { app, nativeImage, net, type NativeImage } from 'electron';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FoundGame } from './activity-detection';

/** Small enough to travel with every report, large enough for a profile. */
export function shrink(image: NativeImage, edge: number): string {
  const { width, height } = image.getSize();
  const scale = edge / Math.max(width, height);
  const sized =
    scale < 1
      ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' })
      : image;
  return `data:image/jpeg;base64,${sized.toJPEG(82).toString('base64')}`;
}

const pictures = new Map<string, Promise<string | null>>();

/**
 * A picture for the game being played: its cover from the Steam store when
 * Steam installed it, and otherwise the icon of its own program. Found once
 * per game and kept for as long as the app runs.
 */
export function gameArt(game: FoundGame): Promise<string | null> {
  let picture = pictures.get(game.name);
  if (!picture) {
    picture = find(game).catch(() => null);
    pictures.set(game.name, picture);
  }
  return picture;
}

async function find(game: FoundGame): Promise<string | null> {
  if (!game.path) return null;
  const cover = await steamCover(game.path).catch(() => null);
  if (cover) return cover;
  const icon = await app.getFileIcon(game.path, { size: 'large' });
  return icon.isEmpty() ? null : `data:image/png;base64,${icon.toPNG().toString('base64')}`;
}

/**
 * Steam keeps a manifest per installed game beside the games themselves,
 * naming the folder and the store number; the number leads to the cover on
 * Steam's public image servers.
 */
async function steamCover(program: string): Promise<string | null> {
  const place = /^(.*\\steamapps)\\common\\([^\\]+)\\/i.exec(program);
  if (!place) return null;
  const [, library, folder] = place;
  const manifests = (await readdir(library!)).filter((file) => /^appmanifest_\d+\.acf$/i.test(file));
  for (const manifest of manifests) {
    const text = await readFile(path.join(library!, manifest), 'utf8');
    const installed = /"installdir"\s+"([^"]+)"/i.exec(text)?.[1];
    if (installed?.toLowerCase() !== folder!.toLowerCase()) continue;
    const appId = /"appid"\s+"(\d+)"/i.exec(text)?.[1];
    return appId ? storeCover(appId) : null;
  }
  return null;
}

async function storeCover(appId: string): Promise<string | null> {
  // The tall box art first, the wide banner when a game has none.
  for (const file of ['library_600x900.jpg', 'header.jpg']) {
    const response = await net.fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`);
    if (!response.ok) continue;
    const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
    if (!image.isEmpty()) return shrink(image, 168);
  }
  return null;
}
