import { nativeImage, net, type NativeImage } from 'electron';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FoundGame } from './activity-detection';

/** Small enough to travel with every report, large enough for a profile. */
export function shrink(image: NativeImage, edge: number): string {
  const { width, height } = image.getSize();
  const scale = edge / Math.max(width, height);
  const sized =
    scale < 1
      ? image.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          quality: 'good',
        })
      : image;
  return `data:image/jpeg;base64,${sized.toJPEG(82).toString('base64')}`;
}

type Source = { steam: number } | { store: string };

/**
 * Where the cover of each well-known game is: its Steam store number, or for
 * the games Steam does not sell, its Microsoft Store product. A search by name
 * would find most of these too, but not always the game itself rather than a
 * spin-off or a pack of coins.
 */
const sources: Record<string, Source> = {
  'Counter-Strike 2': { steam: 730 },
  'Counter-Strike: Global Offensive': { steam: 730 },
  'Dota 2': { steam: 570 },
  'Apex Legends': { steam: 1172470 },
  'Overwatch 2': { steam: 2357570 },
  'Grand Theft Auto V': { steam: 271590 },
  'Rocket League': { steam: 252950 },
  'Rainbow Six Siege': { steam: 359550 },
  'PUBG: Battlegrounds': { steam: 578080 },
  'Destiny 2': { steam: 1085660 },
  'Elden Ring': { steam: 1245620 },
  'Cyberpunk 2077': { steam: 1091500 },
  Rust: { steam: 252490 },
  'Marvel Rivals': { steam: 2767030 },
  'HELLDIVERS 2': { steam: 553850 },
  'EA SPORTS FC 25': { steam: 2669320 },
  'Among Us': { steam: 945360 },
  Terraria: { steam: 105600 },
  'Stardew Valley': { steam: 413150 },
  Roblox: { store: '9PMF91N3LZ3M' },
  VALORANT: { store: '9N1NLJK9SKRN' },
  'League of Legends': { store: '9PB301R051CQ' },
  Fortnite: { store: 'BT5P2X999VH2' },
  Minecraft: { store: '9NXP44L49SHJ' },
  'Genshin Impact': { store: '9N7TFFRRZCC9' },
};

/** The covers' own size: tall box art, a little over twice the size it is drawn at. */
const edge = 168;
/** How long one step of finding a cover may take before it is given up. */
const stepMs = 8_000;
/** A game whose cover could not be found is tried again after this long. */
const retryMs = 10 * 60_000;

const pictures = new Map<string, Promise<string | null>>();

/**
 * A picture for the game being played: its cover, from the store that sells
 * it. Found once per game and kept while the app runs; a game with no cover
 * anywhere keeps its symbol rather than a blurry program icon.
 */
export function gameArt(game: FoundGame): Promise<string | null> {
  let picture = pictures.get(game.name);
  if (!picture) {
    picture = withLimit(find(game), 3 * stepMs).catch(() => null);
    pictures.set(game.name, picture);
    void picture.then((found) => {
      if (!found) setTimeout(() => pictures.delete(game.name), retryMs).unref?.();
    });
  }
  return picture;
}

async function find(game: FoundGame): Promise<string | null> {
  const known = sources[game.name];
  if (known) return 'steam' in known ? steamCover(known.steam) : storeCover(known.store);
  const installed = game.path ? await steamInstall(game.path).catch(() => null) : null;
  if (installed) return steamCover(installed);
  const listed = await steamSearch(game.name).catch(() => null);
  if (listed) return steamCover(listed);
  const product = await storeSearch(game.name).catch(() => null);
  return product ? storeCover(product) : null;
}

/** Names compared the way people read them: no marks, no punctuation, no case. */
export function plainName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™©'’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Whether a store's title is this game, and not its sequel, its soundtrack or
 * its coins: the same name, give or take a publisher before it ("Tom Clancy's")
 * or the platform after it ("- Windows").
 */
export function sameGame(title: string, name: string): boolean {
  const wanted = plainName(name);
  const offered = plainName(title)
    .replace(/\s+(for\s+)?(windows( 10)?|xbox|pc)$/, '')
    .trim();
  if (!wanted) return false;
  if (offered === wanted) return true;
  // A publisher's name in front, for a name long enough not to be a common word.
  return (
    wanted.includes(' ') &&
    offered.endsWith(` ${wanted}`) &&
    offered.split(' ').length - wanted.split(' ').length <= 2
  );
}

/**
 * Steam keeps a manifest per installed game beside the games themselves,
 * naming the folder and the store number.
 */
async function steamInstall(program: string): Promise<number | null> {
  const place = /^(.*\\steamapps)\\common\\([^\\]+)\\/i.exec(program);
  if (!place) return null;
  const [, library, folder] = place;
  const manifests = (await readdir(library!)).filter((file) => /^appmanifest_\d+\.acf$/i.test(file));
  for (const manifest of manifests) {
    const text = await readFile(path.join(library!, manifest), 'utf8');
    const installed = /"installdir"\s+"([^"]+)"/i.exec(text)?.[1];
    if (installed?.toLowerCase() !== folder!.toLowerCase()) continue;
    const appId = /"appid"\s+"(\d+)"/i.exec(text)?.[1];
    return appId ? Number(appId) : null;
  }
  return null;
}

async function steamSearch(name: string): Promise<number | null> {
  const found = await json<{ items?: { id: number; name: string; type?: string }[] }>(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`,
  );
  return found.items?.find((item) => (item.type ?? 'app') === 'app' && sameGame(item.name, name))?.id ?? null;
}

async function storeSearch(name: string): Promise<string | null> {
  const found = await json<{
    Results?: { Products?: { ProductId: string; Type: string; Title: string }[] }[];
  }>(
    `https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?market=US&languages=en-us&productFamilyNames=games&query=${encodeURIComponent(name)}`,
  );
  const products = (found.Results ?? []).flatMap((result) => result.Products ?? []);
  return (
    products.find((product) => product.Type === 'Game' && sameGame(product.Title, name))?.ProductId ?? null
  );
}

async function steamCover(appId: number): Promise<string | null> {
  // The tall box art first, the wide banner when a game has none.
  for (const file of ['library_600x900.jpg', 'header.jpg']) {
    const picture = await image(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`);
    if (picture) return picture;
  }
  return null;
}

async function storeCover(productId: string): Promise<string | null> {
  const found = await json<{
    Products?: { LocalizedProperties?: { Images?: { ImagePurpose: string; Uri: string }[] }[] }[];
  }>(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${productId}&market=US&languages=en-us`);
  const images = found.Products?.[0]?.LocalizedProperties?.[0]?.Images ?? [];
  // The poster is tall like Steam's box art; the square box art when there is none.
  const chosen = ['Poster', 'BoxArt']
    .map((kind) => images.find((entry) => entry.ImagePurpose === kind))
    .find(Boolean);
  if (!chosen) return null;
  const address = chosen.Uri.startsWith('//') ? `https:${chosen.Uri}` : chosen.Uri;
  // The image server makes it small before it travels.
  return image(`${address}?w=${edge}&h=${Math.round(edge * 1.5)}`);
}

async function json<Result>(address: string): Promise<Result> {
  const response = await net.fetch(address, { signal: AbortSignal.timeout(stepMs) });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as Result;
}

async function image(address: string): Promise<string | null> {
  const response = await net.fetch(address, { signal: AbortSignal.timeout(stepMs) });
  if (!response.ok) return null;
  const picture = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
  return picture.isEmpty() ? null : shrink(picture, edge);
}

function withLimit<Value>(work: Promise<Value>, ms: number): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('too slow')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (problem: unknown) => {
        clearTimeout(timer);
        reject(problem instanceof Error ? problem : new Error(String(problem)));
      },
    );
  });
}
