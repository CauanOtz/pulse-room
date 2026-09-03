import type { DesktopCapturerSource, Session } from 'electron';
import { desktopCapturer } from 'electron';
import type { CaptureSource } from '../../shared/desktop-api';

const trustedOrigins = new Set(['file://', 'http://localhost:5173', 'http://127.0.0.1:5173']);

export class ScreenCaptureService {
  private preferredSourceId: string | undefined;

  public install(targetSession: Session): void {
    targetSession.setDisplayMediaRequestHandler(async (request, callback) => {
      if (!this.isTrustedOrigin(request.securityOrigin)) {
        callback({});
        return;
      }

      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const selectedSource = this.findSelectedSource(sources);

      if (!selectedSource) {
        callback({});
        return;
      }

      callback({
        video: selectedSource,
        audio: process.platform === 'win32' ? 'loopback' : undefined,
      });
    });
  }

  public async listScreens(): Promise<CaptureSource[]> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: false,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      displayId: source.display_id,
    }));
  }

  public selectSource(sourceId: string): void {
    if (!sourceId.startsWith('screen:')) {
      throw new Error('Only full-screen capture sources are allowed.');
    }
    this.preferredSourceId = sourceId;
  }

  private findSelectedSource(sources: DesktopCapturerSource[]): DesktopCapturerSource | undefined {
    const preferred = sources.find((source) => source.id === this.preferredSourceId);
    this.preferredSourceId = undefined;
    return preferred ?? sources[0];
  }

  private isTrustedOrigin(origin: string): boolean {
    return trustedOrigins.has(origin) || origin.startsWith('file://');
  }
}
