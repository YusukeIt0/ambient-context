import { homedir } from 'node:os';
import { join } from 'node:path';

/** The platform's per-user cache folder for Ambient Context. Caches keep source data, never caller positions. */
export function defaultCacheDirectory(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ambient-context');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ambient-context', 'Cache');
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'ambient-context');
}
