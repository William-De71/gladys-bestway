// Bestway device -> Gladys device, for every family. The Discover tab
// pitfalls of the Gladys core are checked here: a single invalid feature makes
// the whole discovery list refused, a missing min / max / read_only /
// has_feedback only fails when the user clicks "Add", and a category/type pair
// the front does not label shows "Device (undefined)".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { capabilitiesOf, FAMILIES, readState } from '../src/bestway/model.js';
import { buildDevice, COMMANDS, deviceValues } from '../src/devices.js';

// Pairs labeled by the Gladys front (deviceFeatureCategory in
// front/src/config/i18n/en.json, checked on v5.1.0 and master 2026-10-21).
const LABELED = {
  'temperature-sensor': new Set(['decimal']),
  text: new Set(['text', 'select']),
  switch: new Set(['binary']),
  duration: new Set(['decimal']),
  'water-heater': new Set(['binary', 'target-temperature', 'heating']),
  'child-lock': new Set(['binary']),
};

// A typical state per family, as the clouds report it.
const ATTRS = {
  [FAMILIES.AIRJET]: {
    power: 1,
    filter_power: 1,
    heat_power: 1,
    wave_power: 1,
    temp_now: 35,
    temp_set: 38,
    temp_set_unit: '摄氏',
    locked: 0,
  },
  [FAMILIES.AIRJET_V01]: { power: 1, filter: 2, heat: 3, wave: 50, Tnow: 30, Tset: 37, Tunit: 1 },
  [FAMILIES.ULTRAFIT]: { power: 1, filter: 2, heat: 4, wave: 100, Tnow: 37, Tset: 37, Tunit: 1 },
  [FAMILIES.HYDROJET]: {
    power: 1,
    filter: 2,
    heat: 0,
    wave: 42,
    jet: 1,
    Tnow: 25,
    Tset: 36,
    Tunit: 1,
    E02: 1,
  },
  [FAMILIES.HYDROJET_PRO]: {
    power: 1,
    filter: 2,
    heat: 3,
    wave: 0,
    jet: 0,
    Tnow: 90,
    Tset: 104,
    Tunit: 0,
  },
  [FAMILIES.V2_AIRJET]: {
    power_state: 1,
    heater_state: 2,
    filter_state: 2,
    wave_state: 0,
    locked: 1,
    water_temperature: 33,
    temperature_setting: 39,
    temperature_unit: 1,
    error_code: 0,
  },
  [FAMILIES.V2_HYDROJET]: {
    power_state: 1,
    heater_state: 0,
    filter_state: 0,
    wave_state: 1,
    hydrojet_state: 1,
    water_temperature: 31,
    temperature_setting: 37,
    temperature_unit: 1,
    error_code: 0,
  },
  [FAMILIES.POOL_FILTER]: { power: 1, time: 8, filter: 0, error: 0 },
};

const spas = () =>
  Object.entries(ATTRS).map(([family, attrs], index) => ({
    id: `${family.startsWith('v2_') ? 'v2' : 'v1'}-device${index}`,
    generation: family.startsWith('v2_') ? 'v2' : 'v1',
    family,
    caps: capabilitiesOf(family),
    name: '',
    device: {
      id: `device${index}`,
      product: family.startsWith('v2_') ? '' : family,
      productKey: family.startsWith('v2_') ? 'FTEW0E' : undefined,
    },
    state: readState(family, attrs),
  }));

const allDevices = (gladys, language) =>
  spas().map((spa) => buildDevice(gladys, spa, language, true));

test('every feature: labeled pair, bounds, read_only, has_feedback; no Gladys polling', () => {
  const gladys = createFakeGladys();
  const devices = allDevices(gladys, 'en');
  assert.equal(devices.length, 8);
  for (const device of devices) {
    assert.equal(device.should_poll, false, 'read on the integration timer');
    assert.equal(device.poll_frequency, undefined);
    for (const feature of device.features) {
      const where = feature.external_id;
      assert.ok(
        LABELED[feature.category]?.has(feature.type),
        `${where} ${feature.category}/${feature.type}`,
      );
      for (const field of ['min', 'max', 'read_only', 'has_feedback', 'keep_history']) {
        assert.notEqual(feature[field], undefined, `${where} ${field}`);
      }
      assert.ok(feature.min <= feature.max, where);
      assert.ok(feature.name.length > 0, where);
      // Writable exactly when a command exists for it.
      const key = where.split(':').pop();
      assert.equal(!feature.read_only, Boolean(COMMANDS[key]), key);
    }
  }
});

test('the whole discovery list is accepted by the fake Gladys, in every language', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const devices = allDevices(gladys, language);
    const result = await gladys.publishDiscoveredDevices(devices);
    assert.equal(result.count, devices.length);
  }
});

test('values: within the bounds of their feature, texts for the text features', () => {
  const gladys = createFakeGladys();
  for (const spa of spas()) {
    const device = buildDevice(gladys, spa, 'en');
    const features = Object.fromEntries(
      device.features.map((feature) => [feature.external_id.split(':').pop(), feature]),
    );
    const values = deviceValues(spa, 'en');
    assert.ok(values.length >= 4, spa.family);
    for (const [key, value] of values) {
      const feature = features[key];
      assert.ok(feature, `${spa.family}:${key} has no feature`);
      if (feature.category === 'text') {
        assert.equal(typeof value.text, 'string', key);
        if (feature.type === 'select') {
          assert.ok(
            feature.supported_options.some((option) => option.value === value.text),
            `${key}=${value.text}`,
          );
        }
      } else {
        assert.ok(value >= feature.min && value <= feature.max, `${spa.family}:${key}=${value}`);
      }
    }
  }
});

test('names: the name of the app, else a translated default, ids at the end for twins', () => {
  const gladys = createFakeGladys();
  const [spa] = spas();
  assert.equal(buildDevice(gladys, spa, 'fr').name, 'Spa');
  assert.equal(buildDevice(gladys, spa, 'de').name, 'Whirlpool');
  assert.equal(buildDevice(gladys, { ...spa, name: 'Jardin' }, 'fr').name, 'Jardin');
  assert.equal(buildDevice(gladys, { ...spa, name: 'Jardin' }, 'fr', true).name, 'Jardin ice0');
  const pool = spas().find((item) => item.family === FAMILIES.POOL_FILTER);
  assert.equal(buildDevice(gladys, pool, 'fr').name, 'Pompe de filtration');
  assert.equal(
    buildDevice(gladys, pool, 'fr').external_id,
    `ext:test-integration:pool_filter:${pool.id}`,
  );
});

test('discovery baseline (0.1.0): external ids and compared fields never change', () => {
  // Changing a feature key, category, type, unit, min, max or step forces
  // users to delete and recreate their devices: update the baseline only on
  // purpose (UPDATE_BASELINE=1 npm test), with a migration note in the docs.
  const file = new URL('./fixtures/discovery.baseline.json', import.meta.url);
  const gladys = createFakeGladys();
  const describe = (device) => ({
    external_id: device.external_id,
    should_poll: device.should_poll,
    features: device.features.map((feature) => ({
      external_id: feature.external_id,
      category: feature.category,
      type: feature.type,
      unit: feature.unit ?? null,
      min: feature.min,
      max: feature.max,
      step: feature.step ?? null,
      read_only: feature.read_only,
    })),
  });
  const current = allDevices(gladys, 'en').map(describe);
  if (process.env.UPDATE_BASELINE) {
    mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
    writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  }
  assert.deepEqual(current, JSON.parse(readFileSync(file, 'utf8')));
});
