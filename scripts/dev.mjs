/**
 * Runs the application against a development server.
 *
 * The port is found rather than assumed. Another project holding 5173 used to
 * mean the window opened that project instead of this one, since the address
 * was written down in three places and only the server noticed the clash.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import process from 'node:process';

const firstFreePort = async (from) => {
  for (let port = from; port < from + 40; port += 1) {
    const free = await new Promise((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free port near ${from}.`);
};

const children = [];
const run = (command, args, env) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  children.push(child);
  child.on('exit', (code) => {
    if (code) stop(code);
  });
  return child;
};

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const port = await firstFreePort(Number(process.env.PULSE_DEV_PORT) || 5173);
const url = `http://localhost:${port}`;
console.log(`Pulse Room development server on ${url}`);

// Asked over HTTP rather than by opening a socket: the server answers on
// whichever address 'localhost' means on this machine, which is not always the
// one a raw connection would pick.
const reachable = async () => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
};

const ready = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync('dist-electron/main/index.js') && (await reachable())) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
};

run('npx', ['vite', '--port', String(port), '--strictPort']);
run('npx', ['tsc', '-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput']);

if (!(await ready())) {
  console.error('The development server or the main process never came up.');
  stop(1);
}
// The window is told the same address the server was given, which is the whole
// point of finding it here.
run('npx', ['electron', '.'], { VITE_DEV_SERVER_URL: url });
