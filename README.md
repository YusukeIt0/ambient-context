# <img src="assets/icon.svg" alt="" width="40" align="top"> Ambient Context

**Open-source environmental context for ambient AI.**

An AI that stays with someone through the day needs to know what is around them: the street they are on, the park they are in, whether rain is coming. Ambient Context turns a position into structured evidence an AI can reason about. It covers nearby roads, land use and water from **Overture Maps**, model forecasts from **MET Norway**, and nearby satellite rain estimates from **NOAA**. It reports what it knows, when the data is from and how certain it is. It does not decide what to say; that stays with your AI.

Each source works on its own or together. The library runs on Node.js and does not depend on any particular AI service, device or app.

> **Unofficial.** Not affiliated with, endorsed by, or sponsored by the Overture Maps Foundation, the Norwegian Meteorological Institute (MET Norway) or NOAA. You are responsible for following each data provider's terms (see [Data sources and terms](#data-sources-and-terms)).

## What it provides

| Source | What you get | Coverage and freshness |
|---|---|---|
| **Overture Maps** (`ambient-context/overture`) | The mapped areas a position is in (park, water, land use), nearby roads and paths, with distance and compass bearing | Worldwide to 85° latitude. Monthly Overture releases; cached areas refresh after 7 days |
| **MET Norway** (`ambient-context/met-norway`) | Model forecast near now and for the next 36 hours: temperature, humidity, wind, pressure, cloud, precipitation amount and probability | Worldwide. Model updated hourly in the Nordics, every 6 hours elsewhere |
| **NOAA Enterprise Rain Rate** (`ambient-context/noaa-rain-rate`) | Estimated rain-rate cells within 5 km and in eight compass sectors out to 20 km, optionally compared with the previous frame | 60°S to 70°N, 0.02° grid. A new global frame about every 10 minutes |

Every result says where it came from and how fresh it is, and lists its limitations. Unknown values are `null`, never zero.

## Requirements

- **Node.js 22.18 or later.** Tested on macOS. It uses Node's built-in SQLite, worker threads and child processes, with no native add-ons.
- **For forecasts:** a User-Agent that identifies your application, and acceptance of MET Norway's [terms of service](https://api.met.no/doc/TermsOfService) by a person responsible for the application.

## Install

```sh
npm install ambient-context
```

## Quick start

```ts
import { getEnvironmentalContext } from 'ambient-context';

const context = await getEnvironmentalContext(
  {latitude: 35.6852, longitude: 139.7101, accuracy: 10},
  {userAgent: 'MyAmbientApp/1.0 (+https://example.com/contact)'},
);
// context.surroundings, context.forecast, context.rain:
// each is {status: 'fulfilled', value} or {status: 'rejected', reason}, so one failing source never hides the others.
```

Ask for fewer sources with `sources: ['surroundings', 'rain']` (no User-Agent needed without `forecast`). Caches go to your platform's user cache folder unless you pass `cacheDirectory`.

### Each source on its own

```ts
import { getSurroundings, OvertureGeography } from 'ambient-context/overture';
import { MetNorwayForecast } from 'ambient-context/met-norway';
import { NoaaRainRate } from 'ambient-context/noaa-rain-rate';

// One position. The first visit to an area downloads and caches its map data.
const here = await getSurroundings({latitude: 52.514, longitude: 13.35, accuracy: 15});

// A moving position: updates arrive as map data loads.
const geography = new OvertureGeography({onUpdate: update => console.log(update.state, update.evidence)});
geography.update({latitude: 52.514, longitude: 13.35, accuracy: 15});

// Keep one instance per application so MET Norway's request limits hold.
const met = new MetNorwayForecast({userAgent: 'MyAmbientApp/1.0 (+https://example.com/contact)'});
const forecast = await met.forecast({latitude: 59.91, longitude: 10.75});

const rain = new NoaaRainRate();
const nearbyRain = await rain.nearby({latitude: 13.73, longitude: 100.54}, {compare: true});
```

Call `close()` on instances you create when you are done. See [`examples/`](examples) for a runnable quick start and the ambient-agent pattern.

## What the data means

### Surroundings (Overture Maps)

- `state`: `ready`, `partial` (some map data is missing or still loading), `stale` (older than 7 days), `pending` (still downloading) or `unavailable`.
- `evidence.areas`: mapped areas around the position. `relation` is `within_mapped_area`, `near` or `boundary_uncertain`, where the position's accuracy circle crosses the edge. Being inside a mapped park does not mean someone entered or visited it.
- `evidence.lines`, `evidence.landmarks`: nearby roads, paths and features with `distance_m` and `bearing_degrees` (the compass direction from the position to the feature, not a direction of travel).
- Names are as mapped, with translations when available. `limitations` lists anything missing or capped.
- **First visit to an area can be slow.** Overture files are read in large blocks, so a dense city area can need about 35 MB and several minutes on a slow connection (5 minutes in one Bangkok test). Later reads nearby come from the cache in about a second. `getSurroundings` returns `pending` if its `timeoutMs` passes first; `OvertureGeography` keeps sending updates as data arrives.

### Forecast (MET Norway)

- `status`: `ready`, `partial`, `stale` (an old model run, or the last refresh failed) or `unavailable`.
- `current` is the forecast sample valid near now, not a measurement. `forecast` covers the next 36 hours.
- `updated_at` is the model run; `retrieved_at` is when this edition was first downloaded; `checked_at` is the last check with MET Norway.
- Precipitation belongs to its own interval (`from` to `until`, 1, 6 or 12 hours). Coordinates are rounded to 0.01°, about 1 km. `apparent_temperature_c` is always `null`: no "feels like" value is calculated.

### Nearby rain (NOAA)

- `areas`: the 5 km centre and eight sectors (N to NW) from 5 to 20 km. Each counts grid cells, wet cells, degraded cells and missing cells, with the peak rate in mm/h.
- `coverage_start`/`coverage_end`: the time the frame covers. Individual cell observation times are unknown (`pixel_observed_at` is `null`). `expires_at` is when the estimate should no longer be used.
- `comparison` (with `compare: true`): the same areas in the previous frame, for noticing change. Counts are not a probability, and change between frames does not predict arrival.
- Outside 60°S to 70°N the status is `outside_extent`; when no fresh frame is available it is `temporarily_unavailable`.

## Using it with an AI

Give the evidence to your model as tool output or context, together with its `limitations`. Let the model decide whether anything is worth mentioning; saying nothing is often right. For example:

- Rain cells to the west and a wet forecast for the next hour, with someone walking in an open park: the AI might suggest heading somewhere covered.
- Dry estimates nearby and a clear forecast: nothing to say.

[`examples/ambient-agent.ts`](examples/ambient-agent.ts) shows the pattern: on a position change, gather context, pass a compact form to the model, and stay silent unless it chooses to speak.

## Data sources and terms

| Source | License and attribution | Usage rules built in |
|---|---|---|
| [Overture Maps](https://docs.overturemaps.org/attribution/) Transportation and Base themes | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Credit "© OpenStreetMap contributors, Overture Maps Foundation" (each result carries the full attribution). Share-alike applies to databases derived from this data | Downloads only the needed parts of public files, with bounded sizes and a 256 MB cache |
| [MET Norway Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit MET Norway; results say they are normalized and subset | Your identifying User-Agent, 0.01° coordinates, one request per point per 3 hours or until `Expires`, conditional requests, backoff. Traffic above 20 requests per second needs an agreement with MET Norway |
| [NOAA Enterprise Rain Rate](https://registry.opendata.aws/noaa-ghe/) (NOAA Open Data on AWS) | NOAA open data. Credit NOAA/NESDIS | Frames at most 8 MB each and 64 MB per day; source checks at most every 10 minutes |

## Privacy

- **Overture Maps:** downloads map files covering a roughly 2 km area around the position, from Overture's public storage. The cache keeps map data only, never positions.
- **MET Norway:** receives the position rounded to about 1 km, your User-Agent and your IP address.
- **NOAA:** receives no position. One public global frame is downloaded and decoded locally.

## Build from source

```sh
npm install
npm test               # unit tests, offline
npm run typecheck
npm run test:package   # builds, packs and checks the installed package
```

### Code layout

| Path | Contents |
|---|---|
| `src/overture.ts`, `src/met-norway.ts`, `src/noaa-rain-rate.ts`, `src/index.ts` | Public entry points |
| `src/geography/` | Overture download, cache, worker and geometry |
| `src/weather/` | MET Norway client, cache and evidence; `rain-rate/` for NOAA discovery, cache and decoder |
| `scripts/compare-with-dot-link.mjs` | Real-data comparison with the Dot Link source |

### Origins

Ambient Context began as a copy of the environmental-context modules of [Dot Link](https://github.com/YusukeIt0/dot-link) at commit [`59eb9c0`](https://github.com/YusukeIt0/dot-link/commit/59eb9c0eccb11ed058eddcb7998744feda05961d) and is maintained independently. On real data downloaded once and given to both, the copy produced the same results as that commit (Bangkok: Overture release 2026-11-18.0, a NOAA frame and a MET Norway forecast, all of November 25, 2026); run `scripts/compare-with-dot-link.mjs` to repeat the check.

## License

[MIT](LICENSE), including Dot Link's original copyright notice. Dependencies keep their own licenses ([h5wasm notice](h5wasm-NOTICE.txt)). Data from each provider follows that provider's terms above.
