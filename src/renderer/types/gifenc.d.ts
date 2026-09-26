/**
 * The part of gifenc this application uses. The package ships no types of its
 * own; these follow its README and source.
 */
declare module 'gifenc' {
  /** A palette of [r, g, b] or [r, g, b, a] entries. */
  export type Palette = number[][];

  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface QuantizeOptions {
    format?: PaletteFormat;
    /** Snap alpha to fully opaque or fully clear, as GIF can only do one bit. */
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: QuantizeOptions): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: PaletteFormat,
  ): Uint8Array;

  export interface FrameOptions {
    palette?: Palette;
    /** Milliseconds this frame stays on screen. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    /** 0 plays forever, -1 plays once. Only read from the first frame. */
    repeat?: number;
    first?: boolean;
    dispose?: number;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    /** A copy of what has been written, in a buffer of its own. */
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array<ArrayBuffer>;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;
}
