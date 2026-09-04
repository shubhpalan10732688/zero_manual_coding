import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

/**
 * Loads .env from the repo root when running locally. Lambda gets env vars directly, and
 * Next loads its own .env.local before this runs, so a miss here is normal rather than
 * an error. __dirname is absent when this module is bundled as ESM, hence the guard.
 */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;

  const base = typeof __dirname === 'string' ? path.resolve(__dirname, '..') : process.cwd();
  const candidates = [path.join(base, '.env'), path.resolve(process.cwd(), '..', '.env')];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
      return;
    }
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback?: string): string | undefined {
  loadEnv();
  return process.env[name] ?? fallback;
}

export function numericEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CURSOR_API_BASE_URL = (): string =>
  optionalEnv('CURSOR_API_BASE_URL', 'https://api.cursor.com') as string;
