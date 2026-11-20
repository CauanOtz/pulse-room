import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, transformWithOxc } from 'vite';

test('live offers remain visible and screen previews stay usable in the room', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-live-preview-'));
  const artifacts = process.env.PULSE_LIVE_ARTIFACTS ?? 'test-results';
  await mkdir(artifacts, { recursive: true });
  const vite = await createServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(directory, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'isolated-live-preview',
        transformIndexHtml: {
          order: 'pre',
          handler: () =>
            '<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/__live-preview.tsx"></script></body></html>',
        },
        resolveId: (id) => (id === '/__live-preview.tsx' ? '\0live-preview.tsx' : undefined),
        async load(id) {
          if (
            process.env.PULSE_LIVE_PHASE === 'before' &&
            id.replaceAll('\\', '/').endsWith('/components/participant-tiles.tsx')
          )
            return execFileSync('git', ['show', 'HEAD:src/renderer/components/participant-tiles.tsx'], {
              encoding: 'utf8',
            });
          if (id !== '\0live-preview.tsx') return;
          const source = `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {Stage} from '/src/renderer/components/stage.tsx'; import {TooltipProvider} from '/src/renderer/components/ui/tooltip.tsx';
      import {CallControls} from '/src/renderer/components/call-controls.tsx';
      import '/src/renderer/theme.css'; import '@fontsource-variable/schibsted-grotesk';
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
      const context=canvas.getContext('2d');const background=context.createLinearGradient(0,0,960,540);background.addColorStop(0,'#263536');background.addColorStop(1,'#0b1011');
      context.fillStyle=background;context.fillRect(0,0,960,540);context.fillStyle='#bdc8b9';context.fillRect(120,95,270,350);context.fillStyle='#738078';context.fillRect(430,170,410,275);
      context.fillStyle='#edf1e8';context.font='28px sans-serif';context.fillText('Shared screen · test video',120,490);
      const stream=canvas.captureStream(1);setInterval(()=>context.fillRect(0,0,1,1),1000);
      function Preview(){const[watching,setWatching]=useState(['babi']);const[compact,setCompact]=useState(false);const[multiple,setMultiple]=useState(false);
        const people=[{id:'you',name:'merge',initials:'ME',accent:'#687878',isLocal:true,isMuted:false,isSpeaking:false,isBroadcasting:false,volume:100,locallyMuted:false},
        {id:'babi',name:'babi',initials:'BA',accent:'#727b7e',isLocal:false,isMuted:false,isSpeaking:false,isBroadcasting:true,screenStream:stream,volume:100,locallyMuted:false},
        ...(multiple?[{id:'maya',name:'Maya with a very long display name',initials:'MA',accent:'#727b7e',isLocal:false,isMuted:true,isSpeaking:false,isBroadcasting:true,screenStream:stream,volume:100,locallyMuted:false},
        {id:'jules',name:'Jules',initials:'JU',accent:'#727b7e',isLocal:false,isMuted:false,isSpeaking:false,isBroadcasting:true,volume:100,locallyMuted:false}]:[])];
        return <TooltipProvider><div style={{height:'100vh',padding:16,display:'flex',flexDirection:'column',gap:12,background:'#101416'}}><nav style={{display:'flex',gap:16,fontSize:12,color:'#c1cbcf'}}><button onClick={()=>setCompact(!compact)}>Toggle compact layout</button><button onClick={()=>setMultiple(!multiple)}>Toggle multiple screens</button><button onClick={()=>setWatching([])}>Stop receiving</button></nav><div className={compact?'voice-surface-compact':'preview-room'} style={{height:compact?(innerHeight<740?260:330):undefined,flex:compact?'none':1,minHeight:0}}><Stage participants={people} joined watching={watching} onWatch={(id,on)=>setWatching(current=>on?[...current,id]:current.filter(value=>value!==id))}><CallControls microphoneEnabled deafened={false} screenSharing={false} quality="balanced" busy={false} onToggleMicrophone={()=>{}} onToggleDeafen={()=>{}} onShare={()=>{}} onSelectQuality={()=>{}} onOpenSettings={()=>{}} onLeave={()=>{}}/></Stage></div></div></TooltipProvider>;
      }createRoot(document.getElementById('root')).render(<Preview/>);`;
          return (await transformWithOxc(source, '/live-preview.tsx', { jsx: { runtime: 'automatic' } }))
            .code;
        },
      },
    ],
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: path.join(directory, 'profile'),
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const errors: string[] = [];
    window.on('pageerror', (error) => errors.push(error.message));
    window.on('console', (message) => {
      if (message.type() === 'error') process.stdout.write(`Preview console: ${message.text()}\n`);
    });
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setMinimumSize(500, 500);
      BrowserWindow.getAllWindows()[0].setContentSize(1232, 983);
    });
    await window.locator('.stage-live').screenshot({
      path: path.join(artifacts, `live-player-${process.env.PULSE_PLAYER_PHASE ?? 'after'}.png`),
    });
    await window.getByRole('button', { name: 'Back to the room', exact: true }).click();
    await expect(window.locator('.tile-video')).toBeVisible();
    await window.locator('.stage-room').screenshot({
      path: path.join(artifacts, `live-preview-${process.env.PULSE_LIVE_PHASE ?? 'after'}.png`),
    });
    if (process.env.PULSE_LIVE_PHASE === 'before') return;
    if (process.env.PULSE_LIVE_ARTIFACTS) {
      const before = (await readFile(path.join(artifacts, 'live-preview-before.png'))).toString('base64');
      const after = (await readFile(path.join(artifacts, 'live-preview-after.png'))).toString('base64');
      const comparison = path.join(path.resolve(artifacts), 'live-preview-comparison.html');
      await writeFile(
        comparison,
        `<html><head><meta charset="UTF-8"><style>body{margin:0;background:#101416;color:#dae1e6;font:13px 'Segoe UI',sans-serif}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}header{padding:15px;background:#20282c}img{display:block;width:100%}</style></head><body><div class="pair"><section><header>Antes · 0.13.0</header><img src="data:image/png;base64,${before}"></section><section><header>Depois · correção local · vídeo de teste</header><img src="data:image/png;base64,${after}"></section></div></body></html>`,
      );
      const reviewing = application.waitForEvent('window');
      await application.evaluate(async ({ BrowserWindow }, file) => {
        const review = new BrowserWindow({
          show: false,
          width: 1600,
          height: 670,
          frame: false,
          webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
          },
        });
        await review.loadFile(file);
      }, comparison);
      const review = await reviewing;
      await review
        .locator('img')
        .evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
      await review.screenshot({ path: path.join(artifacts, 'live-preview-comparison.png') });
      await review.close();
    }
    const preview = window.locator('.broadcast-card');
    await expect(preview).toHaveCount(1);
    expect(await preview.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(350);
    await expect(preview.getByText('Live', { exact: true })).toBeVisible();
    await expect(preview.getByText('Open stream', { exact: true })).toBeVisible();
    await preview.click();
    await expect(window.getByText('Live from babi', { exact: true })).toBeVisible();
    expect(await window.locator('video').count()).toBe(1);
    expect(await window.locator('.live-player-footer video').count()).toBe(0);
    const videoBox = await window.locator('.live-surface').boundingBox();
    const dockBox = await window.locator('.call-dock').boundingBox();
    expect(videoBox!.y + videoBox!.height).toBeLessThanOrEqual(dockBox!.y);
    await window.getByRole('button', { name: 'Toggle multiple screens', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Watch Jules', exact: true })).toBeVisible();
    await window
      .getByRole('button', { name: 'Watch Maya with a very long display name', exact: true })
      .click();
    await expect(
      window.getByText('Live from Maya with a very long display name', { exact: true }),
    ).toBeVisible();
    expect(await window.locator('video').count()).toBe(2);
    await window.locator('.stage-live').screenshot({ path: path.join(artifacts, 'live-player-mixed.png') });
    for (const width of [840, 600]) {
      await application.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 760),
        width,
      );
      await expect(window.getByRole('button', { name: 'Watch Jules', exact: true })).toBeVisible();
      expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await window.locator('.stage-live').hover();
      await window.locator('.live-toolbar').hover();
      await window.screenshot({ path: path.join(artifacts, `live-player-mixed-${width}.png`) });
    }
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await window.locator('.stage-live').hover();
    await window.locator('.live-toolbar').hover();
    await window.screenshot({ path: path.join(artifacts, 'live-player-mixed-compact.png') });
    await expect(window.locator('.screen-video')).toBeInViewport();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(600, 680),
    );
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await window.locator('.stage-live').hover();
    await window.locator('.live-toolbar').hover();
    expect(
      await window.locator('.live-surface').evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(70);
    expect(
      await window
        .locator('.call-dock')
        .evaluate(
          (element) =>
            element.getBoundingClientRect().bottom <=
            element.closest('.stage')!.getBoundingClientRect().bottom,
        ),
    ).toBe(true);
    await window.screenshot({ path: path.join(artifacts, 'live-player-mixed-compact-short.png') });
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1232, 983),
    );
    await window.getByRole('button', { name: 'Stop watching babi', exact: true }).click();
    expect(await window.locator('video').count()).toBe(1);
    await window.getByRole('button', { name: 'Watch babi', exact: true }).click();
    await window.getByRole('button', { name: 'Back to the room', exact: true }).click();
    await expect(window.locator('.broadcast-watching')).toHaveCount(2);
    await window.locator('.stage-room').screenshot({ path: path.join(artifacts, 'live-room-mixed.png') });
    await window.getByRole('button', { name: 'Stop receiving', exact: true }).click();
    await expect(preview.getByText('Watch stream', { exact: true })).toHaveCount(3);
    await expect(preview.locator('video')).toHaveCount(0);
    await expect(preview).toHaveCount(3);
    await window.screenshot({ path: path.join(artifacts, 'live-preview-multiple.png') });
    for (const width of [840, 600]) {
      await application.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 760),
        width,
      );
      await window.screenshot({ path: path.join(artifacts, `live-preview-${width}.png`) });
      // The stage intentionally bleeds its blurred background beyond its box.
      // Check the actual content scroller and page, not that decorative layer.
      expect(
        await window
          .locator('.voice-ensemble')
          .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(window.getByRole('button', { name: 'Watch babi', exact: true })).toBeVisible();
      await window.screenshot({ path: path.join(artifacts, `live-preview-${width}.png`) });
    }
    await window.getByRole('button', { name: 'Toggle multiple screens', exact: true }).click();
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await expect(preview.getByText('Watch stream', { exact: true })).toBeVisible();
    await window.screenshot({ path: path.join(artifacts, 'live-preview-compact.png') });
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(600, 680),
    );
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await window.getByRole('button', { name: 'Toggle compact layout', exact: true }).click();
    await expect(preview.getByText('Watch stream', { exact: true })).toBeInViewport();
    expect(
      await window
        .locator('.broadcast-card')
        .evaluate(
          (element) =>
            element.getBoundingClientRect().bottom <=
            document.querySelector('.call-dock')!.getBoundingClientRect().top,
        ),
    ).toBe(true);
    await window.screenshot({ path: path.join(artifacts, 'live-preview-compact-short.png') });
    expect(errors).toEqual([]);
  } finally {
    await application
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
      .catch(() => undefined);
    await application.close();
    await vite.close();
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('pulse-live-preview-')
    )
      throw new Error('Unsafe test directory');
    await rm(directory, { recursive: true, force: true });
  }
});
