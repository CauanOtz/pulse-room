import { useEffect, useRef } from 'react';
import { cn } from './ui/utils';

/**
 * Glowing field lines over a churning, domain-warped fluid. Most lines sit
 * just above the ground; a slow mask lets a few of them flare. The pointer is
 * a magnet: lines near it brighten and curl around it.
 *
 * Plain WebGL2 and one fragment shader, so it costs no dependency. It renders
 * at a reduced resolution, caps its frame rate, stops while the window is
 * hidden, and draws one still frame for people who asked for less motion.
 */

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMagnet;
uniform vec3 uInk;
uniform vec3 uGround;
uniform float uIntensity;
uniform float uDensity;
out vec4 color;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.55;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    sum += amplitude * noise(p);
    p = turn * p;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.055;
  vec2 p = uv * 1.45;

  // The magnet: a swirl that fades with distance from the pointer.
  vec2 m = ((uMouse - 0.5 * uRes) / uRes.y) * 1.45;
  vec2 d = p - m;
  float pull = uMagnet * exp(-dot(d, d) * 4.0);
  float angle = pull * 2.4;
  p = m + mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * d;

  // Two rounds of domain warping make the fluid churn rather than drift.
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 w = vec2(
    fbm(p + 1.9 * q + vec2(1.7, 9.2) + 0.8 * t),
    fbm(p + 1.9 * q + vec2(8.3, 2.8) - 0.6 * t));
  float field = fbm(p + 2.3 * w);

  float v = field * uDensity;
  float distanceToLine = abs(fract(v) - 0.5);
  float perPixel = max(fwidth(v), 0.0015);
  float px = distanceToLine / perPixel;

  // Which stretches of line are lit right now.
  float flare = fbm(p * 0.8 + w * 0.9 + vec2(t * 1.4, -t * 0.9));
  float lit = smoothstep(0.04, 0.44, flare + 0.09);
  lit = clamp(lit * lit + pull * 1.2, 0.0, 1.0);

  float width = mix(0.5, 3.4, lit);
  float core = 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.1, px);
  float halo = exp(-px / (width * 2.6)) * 0.6 * lit;
  float faint = 0.1 + 0.9 * lit;
  float light = clamp((core * faint + halo) * uIntensity, 0.0, 1.0);

  color = vec4(mix(uGround, uInk, light), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log ?? 'Shader did not compile.');
  }
  return shader;
}

const channels = (value: string, fallback: [number, number, number]): [number, number, number] => {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return parts.length >= 3 && parts.every((part) => Number.isFinite(part))
    ? [parts[0] / 255, parts[1] / 255, parts[2] / 255]
    : fallback;
};

export function FluxField({
  className,
  intensity = 1,
  density = 6,
  resolution = 0.75,
  fps = 60,
  interactive = true,
}: {
  className?: string;
  /** How bright the lines are, from 0 (ground only) to about 1.4. */
  intensity?: number;
  /** How many lines cross the field. */
  density?: number;
  /** Fraction of the device pixel ratio to render at. */
  resolution?: number;
  fps?: number;
  interactive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ intensity, density });
  settings.current = { intensity, density };

  useEffect(() => {
    const canvas = canvasRef.current;
    // Test DOMs have no GPU; the ground colour behind the canvas stands in.
    if (!canvas || /jsdom/i.test(navigator.userAgent)) return;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) {
      canvas.dataset.unsupported = 'true';
      return;
    }

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? '');
    } catch (problem) {
      console.warn('The flux field could not start.', problem);
      canvas.dataset.unsupported = 'true';
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uRes = uniform('uRes');
    const uTime = uniform('uTime');
    const uMouse = uniform('uMouse');
    const uMagnet = uniform('uMagnet');
    const uInk = uniform('uInk');
    const uGround = uniform('uGround');
    const uIntensity = uniform('uIntensity');
    const uDensity = uniform('uDensity');

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, 2) * resolution;
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    const observer = new ResizeObserver(() => {
      resize();
      if (still) draw(performance.now());
    });
    observer.observe(canvas);
    resize();

    // The colours come from the theme, so the field inverts with it.
    const readColours = () => {
      const style = getComputedStyle(canvas);
      gl.uniform3fv(uInk, channels(style.getPropertyValue('--ink'), [1, 1, 1]));
      gl.uniform3fv(uGround, channels(style.getPropertyValue('--ground'), [0, 0, 0]));
    };
    readColours();
    const themeWatch = new MutationObserver(() => {
      readColours();
      if (still) draw(performance.now());
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const target = { x: canvas.clientWidth * 0.62, y: canvas.clientHeight * 0.45, on: 0 };
    const mouse = { ...target };
    const move = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      target.x = event.clientX - box.left;
      target.y = event.clientY - box.top;
      target.on = 1;
    };
    const leave = () => {
      target.on = 0;
    };
    if (interactive) {
      window.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('pointerleave', leave);
      window.addEventListener('blur', leave);
    }

    const origin = performance.now() - 40_000 * Math.random();
    let frame = 0;
    let last = 0;
    const interval = 1000 / fps;

    function draw(now: number) {
      // The pointer is followed, never jumped to: the field has weight.
      mouse.x += (target.x - mouse.x) * 0.08;
      mouse.y += (target.y - mouse.y) * 0.08;
      mouse.on += (target.on - mouse.on) * 0.05;
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, (now - origin) / 1000);
      gl!.uniform2f(uMouse, mouse.x * scale, (canvas!.clientHeight - mouse.y) * scale);
      gl!.uniform1f(uMagnet, mouse.on);
      gl!.uniform1f(uIntensity, settings.current.intensity);
      gl!.uniform1f(uDensity, settings.current.density);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden || now - last < interval - 1) return;
      last = now;
      draw(now);
    };
    if (still) draw(origin + 60_000);
    else frame = requestAnimationFrame(loop);
    canvas.dataset.ready = 'true';

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeWatch.disconnect();
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [resolution, fps, interactive]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('flux-field', className)} />;
}
