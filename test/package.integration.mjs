// Installs the packed package into a fresh project and exercises the compiled
// entry points from node_modules, where Node does not run TypeScript.
// Run with `npm run test:package` (builds first). Needs npm registry access for dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the installed package works from node_modules: exports, geography worker and rain decoder child', {timeout: 240_000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ambient-context-package-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const tarball = execFileSync('npm', ['pack', '--silent', '--pack-destination', dir], {cwd: root, encoding: 'utf8'}).trim().split('\n').at(-1);
  await writeFile(join(dir, 'package.json'), JSON.stringify({name: 'consumer', private: true, type: 'module'}));
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', join(dir, tarball)], {cwd: dir, stdio: 'inherit'});
  await copyFile(join(root, 'test/fixtures/rain-rate.nc.gz'), join(dir, 'frame.nc.gz'));
  await writeFile(join(dir, 'check.mjs'), `
    import assert from 'node:assert/strict';
    import { readFile, writeFile } from 'node:fs/promises';
    import { gunzipSync, crc32 } from 'node:zlib';
    import * as all from 'ambient-context';
    import { getSurroundings, OvertureGeography } from 'ambient-context/overture';
    import { MetNorwayForecast } from 'ambient-context/met-norway';
    import { NoaaRainRate, inRainRateExtent } from 'ambient-context/noaa-rain-rate';
    for (const name of ['getEnvironmentalContext', 'getSurroundings', 'MetNorwayForecast', 'NoaaRainRate', 'defaultCacheDirectory'])
      assert.equal(typeof all[name], 'function', name);
    assert.equal(typeof OvertureGeography, 'function');
    assert.throws(() => new MetNorwayForecast({}), /identifying User-Agent/);
    assert.equal(inRainRateExtent({latitude: 80, longitude: 0}), false);
    // Worker thread from compiled JS: an unsupported latitude settles without network access.
    const update = await getSurroundings({latitude: 89, longitude: 0, accuracy: 10}, {cacheDirectory: './cache/overture', timeoutMs: 20000});
    assert.equal(update.state, 'unavailable');
    // Rain decoder child process from compiled JS, on the real-grid fixture.
    const { decodeRainRate } = await import('./node_modules/ambient-context/dist/weather/rain-rate/decoder.js');
    const { frameFromKey } = await import('./node_modules/ambient-context/dist/weather/rain-rate/discovery.js');
    const bytes = gunzipSync(await readFile('frame.nc.gz')); await writeFile('frame', bytes);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(bytes));
    const key = 'BLEND/RainRate-Blend-INST/2026/11/20/16/RRQPE-INST-GLB-1_v1r1_blend_s202611201640000_e202611201649599_c202611201654584.nc';
    const frame = frameFromKey(key, '"' + '0'.repeat(32) + '"', bytes.length, Date.parse('2026-11-20T16:55:35Z'));
    const sample = await decodeRainRate('frame', {...frame, checksum: sum.toString('base64')}, {latitude: 0, longitude: -180}, AbortSignal.timeout(10000));
    assert.equal(sample.status, 'partial');
    assert.equal(sample.source.transformation, 'Ambient Context summary of NOAA grid cells');
    new NoaaRainRate({cacheDirectory: './cache/noaa'}).close();
    console.log('package ok');
  `);
  const out = execFileSync(process.execPath, ['check.mjs'], {cwd: dir, encoding: 'utf8'});
  assert.match(out, /package ok/);
});
