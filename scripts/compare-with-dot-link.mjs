// Real-data equivalence check against the Dot Link source this project was copied from.
// Usage: node scripts/compare-with-dot-link.mjs <dot-link-checkout> [geography|rain|all]
// Uses public example places only (no personal positions). Downloads public Overture and NOAA data
// separately for each implementation. Never part of `npm test`. MET Norway is excluded: live use
// requires a human to accept its terms; its parser and cache rules are covered by the unit tests.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, only = 'all'] = process.argv.slice(2);
if (!checkout) { console.error('Usage: node scripts/compare-with-dot-link.mjs <dot-link-checkout> [geography|rain|all]'); process.exit(2); }
const upstream = path => import(pathToFileURL(join(resolve(checkout), path)).href);
const local = path => import(new URL(`../src/${path}`, import.meta.url).href);
const places = {
  bangkok: {latitude: 13.7308, longitude: 100.5418, accuracy: 5},
  tokyo: {latitude: 35.6852, longitude: 139.7101, accuracy: 5},
  berlin: {latitude: 52.514, longitude: 13.35, accuracy: 5},
  amazon: {latitude: -3, longitude: -60.2, accuracy: 5},
};
// Only these strings were deliberately changed when copying (identity of the deriving software).
const rename = value => JSON.parse(JSON.stringify(value).replaceAll('Dot Link', 'Ambient Context'));
const temp = await mkdtemp(join(tmpdir(), 'ambient-compare-'));
const results = [];

async function geography(name, fix) {
  const run = async (load, label) => {
    const [{GeographicCache}, {acquireGeography, geographicRegion}, {geographicEvidence}] = await Promise.all(
      ['geography/cache.ts', 'geography/overture.ts', 'geography/geometry.ts'].map(load));
    const started = performance.now();
    const result = await acquireGeography({region: geographicRegion(fix), cache: new GeographicCache(join(temp, label, name)),
      signal: AbortSignal.timeout(180_000), now: Date.now, progress: () => {}});
    return {complete: result.complete, evidence: geographicEvidence(fix, result.dataset), ms: Math.round(performance.now() - started)};
  };
  const before = await run(p => upstream(`server/${p}`), 'dot-link');
  const after = await run(local, 'ambient');
  assert.deepEqual(rename(after.evidence), rename(before.evidence));
  assert.equal(after.complete, before.complete);
  const e = after.evidence;
  return {source: 'overture', place: name, release: e.release, complete: after.complete,
    areas: e.areas.length, lines: e.lines.length, landmarks: e.landmarks.length, identical: true, ms: [before.ms, after.ms]};
}

async function rain(name, fix) {
  const point = {latitude: fix.latitude, longitude: fix.longitude};
  const run = async (load, label) => {
    const [{RainRateService}, {weatherQueryPoint}] = await Promise.all(['weather/rain-rate/service.ts', 'weather/types.ts'].map(load));
    const service = new RainRateService(join(temp, label, 'rain'));
    try {
      const status = await service.refresh(AbortSignal.timeout(120_000));
      const [read] = await service.read(weatherQueryPoint(point), AbortSignal.timeout(30_000));
      return {status, read};
    } finally { service.close(); }
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await run(p => upstream(`server/${p}`), 'dot-link');
    const after = await run(local, 'ambient');
    if (!before.read || !after.read) throw new Error(`no frame (${before.status}/${after.status})`);
    // A new frame can be published between the two downloads; compare only the same frame.
    if (before.read.frame.key !== after.read.frame.key || before.read.frame.etag !== after.read.frame.etag) continue;
    assert.deepEqual(rename(after.read.sample), rename(before.read.sample));
    const s = after.read.sample;
    return {source: 'noaa', place: name, frame: s.metadata.coverage_end, status: s.status,
      wet_cells: s.areas.reduce((n, a) => n + a.wet_nominal + a.wet_degraded, 0), identical: true};
  }
  throw new Error('frames kept changing between downloads');
}

try {
  for (const [name, fix] of Object.entries(places)) {
    for (const [kind, check] of [['geography', geography], ['rain', rain]]) {
      if (only !== 'all' && only !== kind) continue;
      try { results.push(await check(name, fix)); }
      catch (error) { results.push({source: kind, place: name, identical: false, error: String(error?.message ?? error).slice(0, 300)}); }
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} finally { await rm(temp, {recursive: true, force: true}); }
if (results.some(r => !r.identical)) process.exitCode = 1;
