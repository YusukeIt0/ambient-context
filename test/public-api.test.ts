import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnvironmentalContext, getSurroundings, MetNorwayForecast, NoaaRainRate, defaultCacheDirectory } from '../src/index.ts';

test('the combined call settles each source independently and requires a User-Agent only for forecasts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ambient-api-')); t.after(() => rm(dir, {recursive: true, force: true}));
  // Latitude 89 is outside both the Overture and the NOAA ranges, so nothing is downloaded.
  const position = {latitude: 89, longitude: 0, accuracy: 10};
  const context = await getEnvironmentalContext(position, {cacheDirectory: dir, timeoutMs: 20_000});
  assert.deepEqual(context.position, position);
  assert.equal(context.forecast?.status, 'rejected');
  assert.match(context.forecast?.status === 'rejected' ? context.forecast.reason : '', /identifying User-Agent/);
  assert.equal(context.surroundings?.status === 'fulfilled' && context.surroundings.value.state, 'unavailable');
  assert.equal(context.rain?.status === 'fulfilled' && context.rain.value.status, 'outside_extent');
  const some = await getEnvironmentalContext(position, {cacheDirectory: dir, sources: ['rain']});
  assert.equal(some.surroundings, undefined); assert.equal(some.forecast, undefined); assert.ok(some.rain);
});

test('one-shot surroundings honours cancellation; instances close cleanly; cache folder is per user', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ambient-api-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(getSurroundings({latitude: 1, longitude: 1, accuracy: 5}, {cacheDirectory: dir, signal: controller.signal}));
  new MetNorwayForecast({userAgent: 'Tests/1.0 (+https://example.com)', cacheFile: join(dir, 'met.json')}).close();
  new NoaaRainRate({cacheDirectory: join(dir, 'noaa')}).close();
  assert.match(defaultCacheDirectory(), /ambient-context/);
});
