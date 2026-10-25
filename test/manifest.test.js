// The manifest and the code agree: every declared action, widget, trigger and
// configuration key has its code, every version says the same thing, and the
// manifest respects what the store and the Gladys core expect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ACTIONS } from '../src/app.js';
import { DEFAULTS, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { GIZWITS_REGIONS } from '../src/bestway/gizwits.js';
import { SMARTSPA_REGIONS } from '../src/bestway/smartspa.js';
import {
  SCENE_ACTION_OUTPUTS,
  SCENE_ACTIONS,
  SCENE_TRIGGER_DATA,
  SCENE_TRIGGERS,
} from '../src/scenes.js';
import { HISTORY_PERIODS, WIDGETS } from '../src/widgets.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]));
const values = (field) => field.options.map((option) => option.value);

test('one version everywhere, image of this repository', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-bestway:${pkg.version}`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/William-De71\/gladys-bestway\/main\/cover\.jpg$/,
  );
});

test('store rules: type, Gladys version, transports, categories, permissions', () => {
  assert.equal(manifest.type, 'device');
  // 5.3.0 for the catalog keywords (widgets and scene_* since 5.1.0); no widget
  // form, no houses source.
  assert.equal(manifest.gladys_version, '>=5.3.0');
  // Both accounts go through the Bestway clouds (README "Transport").
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['appliances', 'climate']);
  // The name of the Home Assistant list, for the integrations tracker.
  assert.equal(manifest.name, 'Bestway Lay-Z-Spa');
  for (const key of ['location', 'containers', 'webhooks', 'network_wake', 'network_discovery']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('configuration: keys, defaults and choices of the code; passwords as secrets', () => {
  const fields = byKey(manifest.config_schema);
  assert.deepEqual(values(fields.language), LANGUAGES);
  assert.deepEqual(values(fields.poll_interval), POLL_INTERVALS.map(String));
  assert.deepEqual(values(fields.v1_region), Object.keys(GIZWITS_REGIONS));
  assert.deepEqual(values(fields.v2_region), Object.keys(SMARTSPA_REGIONS));
  assert.ok(Math.min(...POLL_INTERVALS) >= 30, 'the clouds are not polled faster than 30 s');
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (fields[key].type === 'secret') {
      assert.equal(fields[key].default, undefined, `${key}: no default for a secret`);
    } else {
      assert.equal(fields[key].default, value, key);
    }
  }
  assert.equal(fields.v1_password.type, 'secret');
  assert.equal(fields.v2_password.type, 'secret');
  // `text` / `password` are refused by the store.
  for (const field of manifest.config_schema) {
    assert.ok(['string', 'select', 'secret', 'section'].includes(field.type), field.key);
  }
  assert.equal(fields.GLADYS_PREFER_LOCAL, undefined, 'one transport: no local preference');
});

test('configuration buttons: the keys of the code', () => {
  assert.deepEqual(
    manifest.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
});

test('scene triggers: keys, filters and variables of the code', () => {
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(Object.keys(triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
  for (const trigger of manifest.scene_triggers) {
    const declared = new Set([
      ...(trigger.fields ?? []).map((field) => field.key),
      ...(trigger.variables ?? []).map((variable) => variable.key),
    ]);
    assert.deepEqual(
      [...declared].sort(),
      [...SCENE_TRIGGER_DATA[trigger.key]].sort(),
      trigger.key,
    );
    const device = byKey(trigger.fields ?? []).device;
    assert.equal(device.source, 'devices');
    assert.notEqual(device.required, true, 'empty: any spa');
  }
});

test('scene actions: keys, fields and outputs of the code', () => {
  const actions = byKey(manifest.scene_actions);
  assert.deepEqual(Object.keys(actions).sort(), Object.values(SCENE_ACTIONS).sort());
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120);
    assert.deepEqual(
      action.outputs.map((output) => output.key),
      SCENE_ACTION_OUTPUTS[action.key],
      action.key,
    );
    const device = byKey(action.fields).device;
    assert.equal(device.source, 'devices');
    assert.equal(device.required, true);
  }
  const temperature = byKey(actions.heat_to.fields).temperature;
  assert.deepEqual([temperature.min, temperature.max], [20, 40]);
});

test('widgets: the keys of the code, settings without secrets', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    Object.values(WIDGETS),
  );
  for (const item of manifest.widgets) {
    assert.equal(byKey(item.settings).device.source, 'devices');
    for (const setting of item.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const period = byKey(byKey(manifest.widgets).history.settings).period;
  assert.deepEqual(values(period), HISTORY_PERIODS);
  assert.equal(period.default, HISTORY_PERIODS[0]);
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds, countries', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
  assert.equal(manifest.countries, undefined, 'usable worldwide: no country list');
});
