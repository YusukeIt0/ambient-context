import { getSurroundings, type GeographyUpdate, type GeographicFix } from './overture.ts';
import { MetNorwayForecast, type WeatherEvidence } from './met-norway.ts';
import { NoaaRainRate, type RainUnavailable, type SatellitePrecipitation } from './noaa-rain-rate.ts';

export * from './overture.ts';
export * from './met-norway.ts';
export * from './noaa-rain-rate.ts';
export { defaultCacheDirectory } from './cache-directory.ts';

type Settled<T> = {status: 'fulfilled'; value: T} | {status: 'rejected'; reason: string};
export interface EnvironmentalContext {
  /** The caller's input; the sources below each report their own query position and accuracy. */
  position: GeographicFix;
  surroundings?: Settled<GeographyUpdate>;
  forecast?: Settled<WeatherEvidence>;
  rain?: Settled<SatellitePrecipitation | RainUnavailable>;
}

const settle = <T>(work: Promise<T>): Promise<Settled<T>> => work.then(
  value => ({status: 'fulfilled' as const, value}),
  error => ({status: 'rejected' as const, reason: error instanceof Error ? error.message : String(error)}));

/**
 * Every requested source for one position, in parallel. One source failing never hides the others.
 * `userAgent` is required when `forecast` is requested (MET Norway terms of service).
 * This returns evidence for an AI to reason about; it makes no judgement itself.
 */
export async function getEnvironmentalContext(position: GeographicFix, options: {
  sources?: Array<'surroundings' | 'forecast' | 'rain'>; userAgent?: string; cacheDirectory?: string; signal?: AbortSignal; timeoutMs?: number;
} = {}): Promise<EnvironmentalContext> {
  const sources = new Set(options.sources ?? ['surroundings', 'forecast', 'rain']);
  const base = options.cacheDirectory;
  const point = {latitude: position.latitude, longitude: position.longitude};
  const result: EnvironmentalContext = {position};
  const jobs: Promise<void>[] = [];
  if (sources.has('surroundings')) jobs.push(settle(getSurroundings(position, {
    cacheDirectory: base && `${base}/overture`, signal: options.signal, timeoutMs: options.timeoutMs})).then(r => {result.surroundings = r;}));
  if (sources.has('forecast')) jobs.push(settle((async () => {
    const met = new MetNorwayForecast({userAgent: options.userAgent as string, cacheFile: base && `${base}/met-norway.json`});
    try {return await met.forecast(point, {signal: options.signal});} finally {met.close();}
  })()).then(r => {result.forecast = r;}));
  if (sources.has('rain')) jobs.push(settle((async () => {
    const rain = new NoaaRainRate({cacheDirectory: base && `${base}/noaa-rain-rate`});
    try {return await rain.nearby(point, {signal: options.signal});} finally {rain.close();}
  })()).then(r => {result.rain = r;}));
  await Promise.all(jobs);
  return result;
}
