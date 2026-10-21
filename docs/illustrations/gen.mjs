// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake Bestway cloud of the tests (a real local HTTP server), on a
// made-up autumn evening: a HydroJet Pro spa heats to 38 °C. The heating speed
// is learned by the app from an hour of readings, as it would be. What the
// core fills in from the features is filled in here the same way: a chart
// bound to features shows their history (a made-up day, seeded, the same
// every run).
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { LANGUAGES } = await load('src/i18n.js');
const { memoryStorage } = await load('src/storage.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);
const { FakeBestway, v1Spa } = await load('test/helpers/fake-bestway.js');

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
// The "now" of the illustrations: 21 October 2026, 6 pm in Paris.
const NOW = Date.parse('2026-10-21T16:00:00Z');
const MINUTE = 60 * 1000;
const WIDGET_KEYS = ['spa', 'history'];

/** A seeded pseudo-random generator (mulberry32): the same curves every run. */
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 24 hours: the water cools all day long, heats from 3 pm to the 38 °C target. */
function day() {
  const next = random(20261021);
  const series = { water: [], target: [] };
  let water = 37;
  for (let minutes = 24 * 60; minutes >= 0; minutes -= 20) {
    const t = NOW - minutes * MINUTE;
    const hour = (new Date(t).getUTCHours() + 2) % 24;
    const heating = hour >= 15;
    water = heating ? Math.min(38, water + 0.6) : Math.max(20, water - 0.18 - next() * 0.06);
    const at = new Date(t).toISOString();
    series.water.push({ t: at, v: Math.round(water * 10) / 10 });
    series.target.push({ t: at, v: heating ? 38 : 30 });
  }
  return series;
}

/**
 * @description One language: the two widgets of one spa.
 * @param {string} language - Language.
 * @returns {Promise<object>} The widget contents.
 */
async function contents(language) {
  const spa = v1Spa();
  spa.attr.Tnow = 31;
  const cloud = await new FakeBestway({ v1: { devices: [spa] }, v2: { devices: [] } }).listen();
  const gladys = createFakeGladys({
    config: { language, v1_email: 'v1@example.com', v1_password: 'secret-v1', v1_region: 'eu' },
  });
  let now = NOW - 60 * MINUTE;
  const app = createApp(gladys, {
    storage: memoryStorage(),
    logger: silent,
    now: () => now,
    baseUrls: cloud.baseUrls,
  });
  await gladys.connect();
  await app.start();
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(structuredClone(device));
  }
  // An hour of heating, 31 -> 33 °C: the 2 °C an hour of a real Lay-Z-Spa.
  for (const [minutes, water] of [
    [20, 31],
    [40, 32],
    [60, 33],
  ]) {
    now = NOW - 60 * MINUTE + minutes * MINUTE;
    spa.attr.Tnow = water;
    await app.poll();
  }
  const get = async (key) => (await gladys.fake.widgetGet(key, { language })).data.content;
  const result = {};
  for (const key of WIDGET_KEYS) {
    result[key] = await get(key);
  }
  const curves = day();
  const names = {
    water: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
    target: { en: 'Target', fr: 'Consigne', de: 'Soll', es: 'Consigna' },
  };
  for (const component of result.history.components) {
    if (component.type === 'chart' && component.device_features) {
      component.series = ['water', 'target'].map((key) => ({
        name: names[key],
        points: curves[key],
      }));
      component.unit = '°C';
    }
  }
  await app.stop();
  await cloud.close();
  return result;
}

const all = {};
for (const language of LANGUAGES) {
  all[language] = await contents(language);
}

const card = (key) => {
  const widget = manifest.widgets.find((item) => item.key === key);
  return { icon: widget.icon, label: widget.label };
};
writeFileSync(
  out,
  JSON.stringify({
    contents: all,
    images: {},
    cards: Object.fromEntries(WIDGET_KEYS.map((key) => [key, card(key)])),
  }),
);
