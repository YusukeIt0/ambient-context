import { join } from 'node:path';
import { WeatherService } from './weather/service.ts';
import { MetNorwayProvider, parseMetForecast, WeatherSourceError } from './weather/met-norway.ts';
import { defaultCacheDirectory } from './cache-directory.ts';
import { weatherQueryPoint, weatherSource, type WeatherEvidence, type WeatherForecast, type WeatherPoint, type WeatherSample } from './weather/types.ts';

export type { WeatherEvidence, WeatherForecast, WeatherPoint, WeatherSample };
export { MetNorwayProvider, parseMetForecast, WeatherSourceError, weatherQueryPoint, weatherSource };

/**
 * MET Norway Locationforecast 2.0 with the provider's caching rules built in: coordinates rounded to
 * 0.01°, at most one request per rounded point every three hours (or until `Expires`), conditional
 * requests, backoff on errors. Keep one instance and one cache file per application so the limits hold
 * across restarts. `userAgent` must identify your application (MET Norway terms of service).
 */
export class MetNorwayForecast {
  private readonly service: WeatherService;
  constructor(options: {userAgent: string; cacheFile?: string}) {
    this.service = new WeatherService(options.cacheFile ?? join(defaultCacheDirectory(), 'met-norway.json'), {userAgent: options.userAgent});
  }
  /** Current and next-36-hour model forecast near `point`. Never throws for provider failures; see `status` and `limitations`. */
  forecast(point: WeatherPoint, options: {signal?: AbortSignal} = {}): Promise<WeatherEvidence> {
    return this.service.query(point, options.signal ?? new AbortController().signal, () => {});
  }
  close() {this.service.close();}
}
