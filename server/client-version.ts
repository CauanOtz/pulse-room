/** Which Pulse Room application a request came from, and which version of it. */
export interface ClientVersion {
  client: 'desktop' | 'android';
  version: string;
}

const declared = /^(desktop|android)\/(\d{1,4}\.\d{1,4}\.\d{1,4})$/;
// Electron puts the application's name and version in its user agent, so
// every desktop version can be recognised, including ones that never said.
const desktopAgent = /\bPulseRoom\/(\d{1,4}\.\d{1,4}\.\d{1,4})\b/;

/**
 * The application says what it is in a header of its own; the user agent is
 * the fallback for desktop versions from before that header. Anything else,
 * a browser or a script, is nobody's app and is left unrecorded.
 */
export function clientVersion(header?: string | string[], userAgent?: string): ClientVersion | null {
  const said = typeof header === 'string' ? declared.exec(header.trim()) : null;
  if (said) return { client: said[1] as ClientVersion['client'], version: said[2]! };
  const agent = userAgent ? desktopAgent.exec(userAgent) : null;
  return agent ? { client: 'desktop', version: agent[1]! } : null;
}
