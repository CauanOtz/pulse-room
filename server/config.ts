import { z } from 'zod';

/**
 * This machine, and only this machine. The host has to end where the pattern
 * says it does, or a name like ws://localhost.example.com would walk straight
 * through a check meant for loopback.
 */
const loopback = /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

/**
 * A token crossing a network must cross an encrypted one. Traffic to loopback
 * does not cross a network at all, and a LiveKit server run for development
 * speaks plain ws, so insisting on wss there only forces somebody to weaken
 * this rule less carefully than it is weakened here.
 */
const secureLiveKitUrl = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('wss://') || loopback.test(value),
    'LiveKit URLs must use wss://, unless they are on this machine',
  );

const configurationSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default('0.0.0.0'),
    APP_INVITE_SECRET: z.string().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    LIVEKIT_URL: secureLiveKitUrl,
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),
    SELF_HOSTED_LIVEKIT_URL: secureLiveKitUrl.optional(),
    SELF_HOSTED_LIVEKIT_API_KEY: z.string().min(1).optional(),
    SELF_HOSTED_LIVEKIT_API_SECRET: z.string().min(1).optional(),
  })
  .superRefine((configuration, context) => {
    const selfHostedValues = [
      configuration.SELF_HOSTED_LIVEKIT_URL,
      configuration.SELF_HOSTED_LIVEKIT_API_KEY,
      configuration.SELF_HOSTED_LIVEKIT_API_SECRET,
    ];
    const configuredValues = selfHostedValues.filter(Boolean).length;
    if (configuredValues !== 0 && configuredValues !== selfHostedValues.length) {
      context.addIssue({
        code: 'custom',
        message: 'All self-hosted LiveKit settings must be configured together',
      });
    }
  });

export type ServerConfiguration = z.infer<typeof configurationSchema>;

export interface LiveKitConnectionConfiguration {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function selectLiveKitConnection(configuration: ServerConfiguration): LiveKitConnectionConfiguration {
  if (
    configuration.SELF_HOSTED_LIVEKIT_URL &&
    configuration.SELF_HOSTED_LIVEKIT_API_KEY &&
    configuration.SELF_HOSTED_LIVEKIT_API_SECRET
  ) {
    return {
      url: configuration.SELF_HOSTED_LIVEKIT_URL,
      apiKey: configuration.SELF_HOSTED_LIVEKIT_API_KEY,
      apiSecret: configuration.SELF_HOSTED_LIVEKIT_API_SECRET,
    };
  }

  return {
    url: configuration.LIVEKIT_URL,
    apiKey: configuration.LIVEKIT_API_KEY,
    apiSecret: configuration.LIVEKIT_API_SECRET,
  };
}

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): ServerConfiguration {
  return configurationSchema.parse(environment);
}
