declare const process: any;

export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_NAME_LENGTH = 100;

export interface AppConfig {
  dbUrl: string;
  apiKey: string;
  timeoutMs: number;
  cacheEnabled: boolean;
}

export function loadConfig(): AppConfig {
  return {
    dbUrl: process.env.DB_URL ?? 'memory://local',
    apiKey: process.env.API_KEY ?? '',
    timeoutMs: Number(process.env.TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    cacheEnabled: process.env.CACHE_ENABLED === 'true',
  };
}
