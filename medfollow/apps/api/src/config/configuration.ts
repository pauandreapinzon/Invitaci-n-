export interface AppConfig {
  env: string;
  port: number;
  corsOrigins: string[];
  jwt: { secret: string; expiresIn: string };
  phi: { encryptionKey: string; hashKey: string };
  ai: {
    provider: 'deterministic' | 'claude' | 'azure-openai';
    anthropic: { apiKey: string; model: string };
    azure: { endpoint: string; apiKey: string; deployment: string; apiVersion: string };
  };
  whatsapp: {
    provider: 'console' | 'twilio' | 'meta';
    twilio: { accountSid: string; authToken: string; from: string };
    meta: { token: string; phoneNumberId: string; verifyToken: string; appSecret: string };
  };
  redisUrl?: string;
  quietHours: { start: number; end: number };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(',').map((o) => o.trim()),
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },
  phi: {
    encryptionKey: process.env.PHI_ENCRYPTION_KEY ?? '',
    hashKey: process.env.PHI_HASH_KEY ?? '',
  },
  ai: {
    provider: (process.env.AI_PROVIDER as AppConfig['ai']['provider']) ?? 'deterministic',
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    },
    azure: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
      apiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? '',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
    },
  },
  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER as AppConfig['whatsapp']['provider']) ?? 'console',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      from: process.env.TWILIO_WHATSAPP_FROM ?? '',
    },
    meta: {
      token: process.env.META_WHATSAPP_TOKEN ?? '',
      phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '',
      verifyToken: process.env.META_VERIFY_TOKEN ?? 'medfollow-verify',
      appSecret: process.env.META_APP_SECRET ?? '',
    },
  },
  redisUrl: process.env.REDIS_URL || undefined,
  quietHours: {
    start: Number(process.env.QUIET_HOURS_START ?? 21),
    end: Number(process.env.QUIET_HOURS_END ?? 7),
  },
});
