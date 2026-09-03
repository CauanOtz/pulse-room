import { z } from 'zod';

const secureLiveKitUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('wss://'), 'LiveKit URLs must use wss://');

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
