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

// One forecast client per cache file and User-Agent, so concurrent calls share MET Norway's
// request limits instead of racing past them. Its maintenance timer does not keep Node running.
const forecasts = new Map<string, MetNorwayForecast>();
function sharedForecast(userAgent: string, cacheFile?: string) {
  const key = JSON.stringify([userAgent, cacheFile ?? null]);
  let client = forecasts.get(key);
  if (!client) {client = new MetNorwayForecast({userAgent, cacheFile}); forecasts.set(key, client);}
  return client;
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
    return sharedForecast(options.userAgent as string, base && `${base}/met-norway.json`).forecast(point, {signal: options.signal});
  })()).then(r => {result.forecast = r;}));
  if (sources.has('rain')) jobs.push(settle((async () => {
    const rain = new NoaaRainRate({cacheDirectory: base && `${base}/noaa-rain-rate`});
    try {return await rain.nearby(point, {signal: options.signal});} finally {rain.close();}
  })()).then(r => {result.rain = r;}));
  await Promise.all(jobs);
  return result;
}
