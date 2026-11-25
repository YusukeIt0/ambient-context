import { join } from 'node:path';
import { RainRateService } from './weather/rain-rate/service.ts';
import { inRainRateExtent } from './weather/rain-rate/raster.ts';
import { project, unavailableSatellite, type SatellitePrecipitation } from './weather/satellite.ts';
import { weatherQueryPoint, type WeatherPoint } from './weather/types.ts';
import { defaultCacheDirectory } from './cache-directory.ts';

export type { SatellitePrecipitation };
export type RainUnavailable = ReturnType<typeof unavailableSatellite>;
export { inRainRateExtent };

/**
 * Nearby precipitation-rate estimates from NOAA's Enterprise Rain Rate (global blend, 60°S to 70°N,
 * 0.02° grid, new frame about every 10 minutes). Frames are public and global: one download (at most
 * 8 MB, bounded per day) serves every location. Positions are never sent; a local child process
 * decodes the frame for the requested point.
 */
export class NoaaRainRate {
  private readonly service: RainRateService;
  private readonly now: () => number;
  constructor(options: {cacheDirectory?: string; now?: () => number} = {}) {
    this.now = options.now ?? Date.now;
    this.service = new RainRateService(options.cacheDirectory ?? join(defaultCacheDirectory(), 'noaa-rain-rate'), {now: this.now});
  }
  /** Downloads the newest frame when the cache has none fresh. Rate-limited; safe to call often. */
  refresh(options: {signal?: AbortSignal} = {}) {
    return this.service.refresh(options.signal ?? new AbortController().signal);
  }
  /**
   * Summary for the 5 km area around `point` and eight compass sectors out to 20 km. With
   * `compare: true`, also the matching areas of the previous frame. Refreshes first unless `refresh: false`.
   */
  async nearby(raw: WeatherPoint, options: {signal?: AbortSignal; compare?: boolean; refresh?: boolean} = {}): Promise<SatellitePrecipitation | RainUnavailable> {
    const point = weatherQueryPoint(raw);
    if (!inRainRateExtent(point)) return unavailableSatellite(point);
    const signal = options.signal ?? new AbortController().signal;
    if (options.refresh !== false) await this.service.refresh(signal);
    const [current, previous] = await this.service.read(point, signal, {previous: !!options.compare});
    return current ? project(current, previous, this.now()) : unavailableSatellite(point);
  }
  close() {this.service.close();}
}
