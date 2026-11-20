/**
 * Live screens popped out into windows of their own.
 *
 * The window is a blank page opened by this one, so it shares this renderer:
 * the received MediaStream is handed straight to a video element there, with
 * no second subscription and no second decoder for the network to feed. Sound
 * stays with the room, which already plays every screen's audio, so the
 * popped-out picture is always muted.
 */

interface LiveWindow {
  window: Window;
  video: HTMLVideoElement;
  title: HTMLElement;
}

const open = new Map<string, LiveWindow>();
const listeners = new Set<() => void>();
// One array per change, so a subscriber comparing snapshots sees a stable value.
let snapshot: string[] = [];
const announce = () => {
  snapshot = [...open.keys()];
  listeners.forEach((listener) => listener());
};

const frameName = (id: string) => `pulse-live-${id.replace(/[^\w-]/g, '_').slice(0, 96)}`;

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Pulse Room live</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#000;color:#f5f5f5;overflow:hidden;
font:500 13px/1.4 'Schibsted Grotesk Variable','Segoe UI',system-ui,sans-serif}
video{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
header{position:fixed;left:16px;top:14px;display:flex;align-items:center;gap:10px;padding:7px 12px 7px 10px;
border-radius:999px;background:rgb(0 0 0/.55);box-shadow:inset 0 0 0 1px rgb(255 255 255/.14);
backdrop-filter:blur(14px);transition:opacity .4s cubic-bezier(.16,1,.3,1),transform .4s cubic-bezier(.16,1,.3,1)}
body.idle header{opacity:0;transform:translateY(-6px)}body.idle{cursor:none}
i{width:7px;height:7px;border-radius:50%;background:#ff5c6c;box-shadow:0 0 10px #ff5c6c;animation:p 1.8s ease-in-out infinite}
@keyframes p{50%{opacity:.35}}small{color:rgb(255 255 255/.55);font-size:11px}
p{position:fixed;inset:0;display:none;place-items:center;margin:0;color:rgb(255 255 255/.55)}
body.ended p{display:grid}body.ended video{opacity:.25}
</style></head><body><video autoplay playsinline muted></video><header><i></i><span></span><small>Double-click for full screen</small></header>
<p>This live has ended.</p></body></html>`;

function build(target: Window, name: string): LiveWindow {
  const doc = target.document;
  doc.open();
  doc.write(page);
  doc.close();
  const video = doc.querySelector('video')!;
  const title = doc.querySelector('header span') as HTMLElement;
  title.textContent = name;
  doc.title = `${name} · Pulse Room`;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    doc.body.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => doc.body.classList.add('idle'), 2200);
  };
  doc.addEventListener('mousemove', wake);
  wake();
  doc.addEventListener('dblclick', () => {
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
    else void doc.documentElement.requestFullscreen().catch(() => undefined);
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !doc.fullscreenElement) target.close();
  });
  return { window: target, video, title };
}

/** Opens (or brings forward) the window for one person's screen. */
export function openLiveWindow(id: string, name: string, stream: MediaStream): boolean {
  const existing = open.get(id);
  if (existing && !existing.window.closed) {
    updateLiveWindow(id, name, stream);
    existing.window.focus();
    return true;
  }
  const target = window.open('about:blank', frameName(id), 'popup,width=1280,height=760');
  if (!target) return false;
  const entry = build(target, name);
  entry.video.srcObject = stream;
  void Promise.resolve(entry.video.play()).catch(() => undefined);
  open.set(id, entry);
  target.addEventListener('beforeunload', () => {
    if (open.get(id)?.window === target) {
      open.delete(id);
      announce();
    }
  });
  announce();
  return true;
}

/** Keeps an open window on the person's current stream and name. */
export function updateLiveWindow(id: string, name: string, stream: MediaStream | undefined): void {
  const entry = open.get(id);
  if (!entry || entry.window.closed) return;
  entry.title.textContent = name;
  entry.window.document.body.classList.toggle('ended', !stream);
  if (stream && entry.video.srcObject !== stream) {
    entry.video.srcObject = stream;
    void Promise.resolve(entry.video.play()).catch(() => undefined);
  }
}

export function closeLiveWindow(id: string): void {
  const entry = open.get(id);
  open.delete(id);
  if (entry && !entry.window.closed) entry.window.close();
  announce();
}

export function openLiveWindowIds(): string[] {
  return snapshot;
}

export function subscribeLiveWindows(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The windows belong to this one; they go when it does.
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', () => [...open.keys()].forEach(closeLiveWindow));
