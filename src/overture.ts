import { join } from 'node:path';
import { LocalGeography, type GeographyLoader, type GeographyState, type GeographyUpdate } from './geography/loader.ts';
import { defaultCacheDirectory } from './cache-directory.ts';
import type { GeographicEvidence, GeographicFix, GeographicReference } from './geography/types.ts';

export type { GeographicEvidence, GeographicFix, GeographicReference, GeographyState, GeographyUpdate, GeographyLoader };

/**
 * Streaming surroundings for a moving position. Call `update` with each usable fix; `onUpdate`
 * receives `pending`, then `ready`, `partial`, `stale` or `unavailable` evidence. Parsing runs in a
 * worker thread. Call `stop` when the position is no longer shared and `close` when done.
 */
export class OvertureGeography extends LocalGeography {
  constructor(options: {cacheDirectory?: string; onUpdate: (update: GeographyUpdate) => void}) {
    super(options.cacheDirectory ?? join(defaultCacheDirectory(), 'overture'), options.onUpdate);
  }
}

const settled = new Set<GeographyState>(['ready', 'partial', 'stale', 'unavailable']);

/**
 * One-shot surroundings for a single position. Resolves with the first settled result, or with the
 * latest `pending` result when `timeoutMs` (default 60 s) passes first. A first visit to an area
 * downloads and caches Overture data for it; later calls nearby are served from the cache.
 */
export async function getSurroundings(fix: GeographicFix, options: {cacheDirectory?: string; timeoutMs?: number; signal?: AbortSignal} = {}): Promise<GeographyUpdate> {
  options.signal?.throwIfAborted();
  let latest: GeographyUpdate = {fix, state: 'pending', revision: 'not-started'};
  let finish!: () => void;
  const done = new Promise<void>(resolve => {finish = resolve;});
  const geography = new OvertureGeography({cacheDirectory: options.cacheDirectory, onUpdate: update => {
    latest = update;
    if (settled.has(update.state)) finish();
  }});
  const timer = setTimeout(finish, options.timeoutMs ?? 60_000);
  const abort = () => finish();
  options.signal?.addEventListener('abort', abort, {once: true});
  try {
    geography.update({latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy});
    await done;
    options.signal?.throwIfAborted();
    return latest;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    geography.close();
  }
}
