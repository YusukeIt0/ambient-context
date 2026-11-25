// Real-data equivalence check against the Dot Link source this project was copied from.
// Usage: node scripts/compare-with-dot-link.mjs <dot-link-checkout> [geography|rain|all] [place]
//
// Each source's public data is downloaded once, then both implementations process the same bytes,
// so a slow link cannot turn a timeout into a false difference. Download and cache code differs from
// Dot Link only in the User-Agent and the cache file label (see `git log -p`), so one place is
// enough; pass another place name to repeat elsewhere. Public example places only.
// Never part of `npm test`. MET Norway is excluded: live use requires a person to accept its terms;
// its parser and cache rules are covered by the copied unit tests.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32 } from 'node:zlib';

const places = {
  bangkok: {latitude: 13.7308, longitude: 100.5418, accuracy: 5}, // Dot Link's own measurement fixture
  tokyo: {latitude: 35.6852, longitude: 139.7101, accuracy: 5},
  berlin: {latitude: 52.514, longitude: 13.35, accuracy: 5},
  amazon: {latitude: -3, longitude: -60.2, accuracy: 5},
};
const [checkout, only = 'all', placeName = 'bangkok'] = process.argv.slice(2);
if (!checkout || !Object.hasOwn(places, placeName)) {
  console.error(`Usage: node scripts/compare-with-dot-link.mjs <dot-link-checkout> [geography|rain|all] [${Object.keys(places).join('|')}]`);
  process.exit(2);
}
const fix = places[placeName];
const upstream = path => import(pathToFileURL(join(resolve(checkout), 'server', path)).href);
const local = path => import(new URL(`../src/${path}`, import.meta.url).href);
// The only deliberate output change when copying: the name of the deriving software.
const rename = value => JSON.parse(JSON.stringify(value).replaceAll('Dot Link', 'Ambient Context'));
const temp = await mkdtemp(join(tmpdir(), 'ambient-compare-'));
const results = [];
const report = row => { results.push(row); console.log(JSON.stringify(row)); };

async function geography() {
  const load = async from => {
    const [{GeographicCache}, {acquireGeography, geographicRegion}, {geographicEvidence}] = await Promise.all(
      ['geography/cache.ts', 'geography/overture.ts', 'geography/geometry.ts'].map(from));
    return directory => acquireGeography({region: geographicRegion(fix), cache: new GeographicCache(directory),
      signal: AbortSignal.timeout(30 * 60_000), now: Date.now, progress: () => {}})
      .then(result => ({complete: result.complete, evidence: geographicEvidence(fix, result.dataset)}));
  };
  const [before, after] = await Promise.all([load(upstream), load(local)]);
  const a = join(temp, 'geo-dot-link'), b = join(temp, 'geo-ambient');
  const started = performance.now();
  const reference = await before(a);
  const downloadMs = Math.round(performance.now() - started);
  // Hand the downloaded bytes to the copy: same entry files, only the format label differs.
  await cp(a, b, {recursive: true});
  for (const file of await readdir(b)) {
    if (!file.endsWith('.bin')) continue;
    const bytes = await readFile(join(b, file)), end = bytes.indexOf(10);
    const header = JSON.parse(bytes.subarray(0, end).toString('utf8'));
    header.magic = 'ambient-context-map-cache-v1';
    await writeFile(join(b, file), Buffer.concat([Buffer.from(JSON.stringify(header)), bytes.subarray(end)]));
  }
  const copyStarted = performance.now();
  const copy = await after(b);
  assert.equal(copy.complete, reference.complete);
  assert.deepEqual(rename(copy.evidence), rename(reference.evidence));
  const e = copy.evidence;
  report({source: 'overture', place: placeName, release: e.release, complete: copy.complete,
    areas: e.areas.length, lines: e.lines.length, landmarks: e.landmarks.length, identical: true,
    download_ms: downloadMs, copy_ms: Math.round(performance.now() - copyStarted)});
}

async function rain() {
  const {discoverFrames, chooseEdition, freshFrame, acquireFrame} = await local('weather/rain-rate/discovery.ts');
  const frames = await discoverFrames(Date.now(), fetch, () => {}, AbortSignal.timeout(120_000));
  const frame = chooseEdition(frames.filter(f => freshFrame(f, Date.now())));
  if (!frame) throw new Error('no fresh NOAA frame published');
  const {bytes} = await acquireFrame(frame, fetch, () => {}, AbortSignal.timeout(30 * 60_000));
  const path = join(temp, 'frame.nc');
  await writeFile(path, bytes);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(bytes));
  const edition = {...frame, checksum: sum.toString('base64')};
  const [{decodeRainRate: before}, {decodeRainRate: after}] = await Promise.all(
    [upstream('weather/rain-rate/decoder.ts'), local('weather/rain-rate/decoder.ts')]);
  const point = {latitude: Math.round(fix.latitude * 100) / 100, longitude: Math.round(fix.longitude * 100) / 100};
  const reference = await before(path, edition, point, AbortSignal.timeout(30_000));
  const copy = await after(path, edition, point, AbortSignal.timeout(30_000));
  assert.deepEqual(rename(copy), rename(reference));
  report({source: 'noaa', place: placeName, frame_end: copy.metadata.coverage_end, status: copy.status,
    wet_cells: copy.areas.reduce((n, a) => n + a.wet_nominal + a.wet_degraded, 0), identical: true});
}

try {
  for (const [kind, check] of [['rain', rain], ['geography', geography]]) {
    if (only !== 'all' && only !== kind) continue;
    try { await check(); }
    catch (error) { report({source: kind, place: placeName, identical: false, error: String(error?.message ?? error).slice(0, 300)}); }
  }
} finally { await rm(temp, {recursive: true, force: true}); }
if (!results.length || results.some(r => !r.identical)) process.exitCode = 1;
