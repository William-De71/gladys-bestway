// The clients of both clouds against the fake cloud (real HTTP on 127.0.0.1),
// and the wire <-> state translation of every family.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGizwitsClient } from '../src/bestway/gizwits.js';
import {
  capabilitiesOf,
  encodeCommand,
  FAMILIES,
  familyOf,
  readState,
} from '../src/bestway/model.js';
import { createSmartSpaClient } from '../src/bestway/smartspa.js';
import { startFake } from './helpers.js';

// --- Families ----------------------------------------------------------------------------------

test('families from the V1 product names and the V2 product keys', () => {
  assert.equal(familyOf('v1', { product: 'Airjet' }), FAMILIES.AIRJET);
  assert.equal(familyOf('v1', { product: 'Airjet_V01' }), FAMILIES.AIRJET_V01);
  assert.equal(familyOf('v1', { product: 'UltraFit' }), FAMILIES.ULTRAFIT);
  assert.equal(familyOf('v1', { product: 'Hydrojet' }), FAMILIES.HYDROJET);
  assert.equal(familyOf('v1', { product: 'Hydrojet_Pro' }), FAMILIES.HYDROJET_PRO);
  assert.equal(familyOf('v1', { product: '泳池过滤器' }), FAMILIES.POOL_FILTER);
  assert.equal(familyOf('v1', { product: 'Something new' }), null);
  assert.equal(familyOf('v2', { productKey: 'F12D9Q', name: '' }), FAMILIES.V2_HYDROJET);
  assert.equal(familyOf('v2', { productKey: 'FTEW0E', name: '' }), FAMILIES.V2_AIRJET);
  assert.equal(
    familyOf('v2', { productKey: 'XXXXXX', name: 'My HydroJet Pro' }),
    FAMILIES.V2_HYDROJET,
  );
  assert.equal(familyOf('v2', { productKey: 'XXXXXX', name: 'Garden spa' }), FAMILIES.V2_AIRJET);
});

test('capabilities: jets on HydroJet, lock on Airjet, levels of bubbles on V1 only', () => {
  assert.equal(capabilitiesOf(FAMILIES.HYDROJET_PRO).jets, true);
  assert.equal(capabilitiesOf(FAMILIES.HYDROJET_PRO).bubbles, 'levels');
  assert.equal(capabilitiesOf(FAMILIES.AIRJET).lock, true);
  assert.equal(capabilitiesOf(FAMILIES.AIRJET).bubbles, 'switch');
  assert.equal(capabilitiesOf(FAMILIES.V2_HYDROJET).bubbles, 'switch');
  assert.equal(capabilitiesOf(FAMILIES.V2_AIRJET).lock, true);
  assert.equal(capabilitiesOf(FAMILIES.POOL_FILTER).kind, 'pool_filter');
  assert.equal(capabilitiesOf('nope'), null);
});

// --- Reading -----------------------------------------------------------------------------------

test('V1 vocabulary: heater states, filter 2, bubbles levels per family, E32 is no error', () => {
  const base = { power: 1, filter: 2, heat: 3, wave: 51, jet: 1, Tnow: 31, Tset: 38, Tunit: 1 };
  const state = readState(FAMILIES.AIRJET_V01, { ...base, E02: 1, E32: 1, E10: 0 });
  assert.equal(state.power, true);
  assert.equal(state.filter, true);
  assert.equal(state.heaterOn, true);
  assert.equal(state.heating, true);
  assert.equal(state.targetReached, false);
  assert.equal(state.temperature, 31);
  assert.equal(state.target, 38);
  assert.equal(state.bubbles, 'medium');
  assert.deepEqual(state.errors, ['E02']);

  assert.equal(readState(FAMILIES.HYDROJET, { ...base, wave: 42 }).bubbles, 'medium');
  assert.equal(readState(FAMILIES.HYDROJET, { ...base, wave: 100 }).bubbles, 'max');
  assert.equal(readState(FAMILIES.HYDROJET, { ...base, wave: 0 }).bubbles, 'off');
  const reached = readState(FAMILIES.HYDROJET, { ...base, heat: 4 });
  assert.equal(reached.targetReached, true);
  assert.equal(reached.heating, false);
  assert.equal(reached.heaterOn, true);
  assert.deepEqual(readState(FAMILIES.HYDROJET, { ...base, error: 5 }).errors, ['E05']);
});

test('Fahrenheit spas are converted to °C', () => {
  const state = readState(FAMILIES.HYDROJET, { Tnow: 98, Tset: 104, Tunit: 0 });
  assert.equal(state.unit, 'F');
  assert.equal(state.temperature, 36.7);
  assert.equal(state.target, 40);
});

test('V1 Airjet: its own field names, Celsius written in Chinese, system errors', () => {
  const state = readState(FAMILIES.AIRJET, {
    power: 1,
    filter_power: 1,
    heat_power: 1,
    heat_temp_reach: 1,
    wave_power: 0,
    temp_now: 37,
    temp_set: 37,
    temp_set_unit: '摄氏',
    locked: 1,
    system_err2: 1,
    earth: 0,
  });
  assert.equal(state.unit, 'C');
  assert.equal(state.targetReached, true);
  assert.equal(state.heating, false);
  assert.equal(state.bubbles, 'off');
  assert.equal(state.locked, true);
  assert.deepEqual(state.errors, ['system_err2']);
});

test('V2 shadow: 2 read back while running, binary bubbles, error code', () => {
  const state = readState(FAMILIES.V2_HYDROJET, {
    water_temperature: 33,
    temperature_setting: 39,
    temperature_unit: 1,
    power_state: 1,
    heater_state: 2,
    filter_state: 2,
    wave_state: 1,
    hydrojet_state: 0,
    error_code: 3,
  });
  assert.equal(state.heating, true);
  assert.equal(state.filter, true);
  assert.equal(state.bubbles, 'max');
  assert.equal(state.jets, false);
  assert.deepEqual(state.errors, ['E03']);
  assert.deepEqual(readState(FAMILIES.V2_AIRJET, { error_code: '' }).errors, []);
});

test('pool filter pump: power, timer, cartridge', () => {
  const state = readState(FAMILIES.POOL_FILTER, { power: 1, time: 6, filter: 1, error: 0 });
  assert.equal(state.power, true);
  assert.equal(state.timerHours, 6);
  assert.equal(state.filterChange, true);
  assert.deepEqual(state.errors, []);
});

test('a state read from nothing is all unknown, never an error', () => {
  for (const family of Object.values(FAMILIES)) {
    const state = readState(family, {});
    assert.equal(state.power, null, family);
    assert.deepEqual(state.errors, [], family);
  }
});

// --- Commands ----------------------------------------------------------------------------------

test('commands: the wire of each vocabulary and what the spa does with it', () => {
  assert.deepEqual(encodeCommand(FAMILIES.HYDROJET, 'heater', true).wire, { heat: 3 });
  assert.deepEqual(encodeCommand(FAMILIES.HYDROJET, 'heater', true).expected, {
    heaterOn: true,
    power: true,
    filter: true,
  });
  assert.deepEqual(encodeCommand(FAMILIES.HYDROJET, 'filter', true).wire, { filter: 2 });
  assert.deepEqual(encodeCommand(FAMILIES.AIRJET, 'filter', false).wire, { filter_power: 0 });
  assert.deepEqual(encodeCommand(FAMILIES.V2_AIRJET, 'heater', true).wire, { heater_state: 1 });
  assert.deepEqual(encodeCommand(FAMILIES.HYDROJET, 'bubbles', 'medium').wire, { wave: 40 });
  assert.deepEqual(encodeCommand(FAMILIES.AIRJET_V01, 'bubbles', 'medium').wire, { wave: 50 });
  assert.deepEqual(encodeCommand(FAMILIES.V2_HYDROJET, 'bubbles', true).wire, { wave_state: 1 });
  assert.deepEqual(encodeCommand(FAMILIES.V2_HYDROJET, 'jets', 1).wire, { hydrojet_state: 1 });
  assert.deepEqual(encodeCommand(FAMILIES.AIRJET, 'lock', 1).wire, { locked: 1 });
  const off = encodeCommand(FAMILIES.HYDROJET, 'power', 0);
  assert.deepEqual(off.wire, { power: 0 });
  assert.equal(off.expected.heaterOn, false);
  assert.equal(off.expected.bubbles, 'off');
  assert.equal(off.expected.jets, false);
});

test('targets: whole degrees of the spa unit, 20 to 40 °C', () => {
  assert.deepEqual(encodeCommand(FAMILIES.HYDROJET, 'target', 38, { unit: 'C' }).wire, {
    Tset: 38,
  });
  assert.deepEqual(encodeCommand(FAMILIES.V2_AIRJET, 'target', 37.5, { unit: 'C' }).wire, {
    temperature_setting: 38,
  });
  const fahrenheit = encodeCommand(FAMILIES.HYDROJET, 'target', 38, { unit: 'F' });
  assert.deepEqual(fahrenheit.wire, { Tset: 100 });
  assert.equal(fahrenheit.expected.target, 37.8);
  assert.throws(() => encodeCommand(FAMILIES.HYDROJET, 'target', 41, { unit: 'C' }), RangeError);
  assert.throws(() => encodeCommand(FAMILIES.HYDROJET, 'target', 15, {}), RangeError);
  assert.throws(() => encodeCommand(FAMILIES.HYDROJET, 'target', 'abc', {}), RangeError);
});

test('a command the model does not have is refused', () => {
  assert.throws(() => encodeCommand(FAMILIES.AIRJET_V01, 'jets', true), RangeError);
  assert.throws(() => encodeCommand(FAMILIES.HYDROJET, 'lock', true), RangeError);
  assert.throws(() => encodeCommand(FAMILIES.POOL_FILTER, 'heater', true), RangeError);
});

// --- Clients against the fake cloud ------------------------------------------------------------

test('V1 client: login, devices, state, command; wrong account refused', async () => {
  const fake = await startFake();
  try {
    const client = createGizwitsClient({
      region: 'eu',
      username: 'v1@example.com',
      password: 'secret-v1',
      baseUrl: fake.url,
    });
    const session = await client.login();
    assert.match(session.token, /^v1-token-/);
    assert.ok(session.expiresAt > Date.now());
    const [device] = await client.devices();
    assert.equal(device.product, 'Hydrojet_Pro');
    assert.equal(device.name, 'Lay-Z-Spa Maldives');
    assert.equal(device.online, true);
    const report = await client.state(device);
    assert.equal(report.attrs.Tnow, 31);
    await client.command(device, { heat: 0 });
    assert.deepEqual(fake.commands.at(-1), { generation: 'v1', id: device.id, attrs: { heat: 0 } });

    fake.expireTokens();
    await assert.rejects(client.state(device), { kind: 'auth' });

    const wrong = createGizwitsClient({
      region: 'eu',
      username: 'v1@example.com',
      password: 'no',
      baseUrl: fake.url,
    });
    await assert.rejects(wrong.login(), { kind: 'credentials', code: 9020 });
    const unknown = createGizwitsClient({
      region: 'eu',
      username: 'x@example.com',
      password: 'no',
      baseUrl: fake.url,
    });
    await assert.rejects(unknown.login(), { kind: 'credentials', code: 9005 });
  } finally {
    await fake.close();
  }
});

test('V2 client: Content-MD5, data as a JSON string, 505 logs in again once', async () => {
  const fake = await startFake();
  try {
    const client = createSmartSpaClient({
      region: 'eu',
      username: 'v2@example.com',
      password: 'secret-v2',
      baseUrl: fake.url,
    });
    const [device] = await client.devices();
    assert.equal(fake.logins.v2, 1, 'logged in on the first call');
    assert.equal(device.id, '6879c4d585ab');
    assert.equal(device.productKey, 'FTEW0E');
    assert.equal(device.online, true);
    const report = await client.state(device);
    assert.equal(report.attrs.water_temperature, 34);
    await client.command(device, { heater_state: 1 });
    assert.equal(fake.ignored.length, 0, 'the data went as a JSON string');
    assert.deepEqual(fake.commands.at(-1).attrs, { heater_state: 1 });
    assert.equal(fake.v2.devices[0].shadow.heater_state, 2, 'reads back 2');

    fake.expireTokens();
    await client.state(device);
    assert.equal(fake.logins.v2, 2, 'logged in again after "505"');

    const wrong = createSmartSpaClient({
      region: 'eu',
      username: 'x@example.com',
      password: 'no',
      baseUrl: fake.url,
    });
    await assert.rejects(wrong.login(), { kind: 'credentials', code: '1000000' });
  } finally {
    await fake.close();
  }
});

test('a cloud that does not answer: one retry, then a network error', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    throw Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    });
  };
  const client = createSmartSpaClient({ region: 'eu', username: 'a', password: 'b', fetch });
  await assert.rejects(
    client.login(),
    (error) => error.kind === 'network' && /UND_ERR_CONNECT_TIMEOUT/.test(error.message),
  );
  assert.equal(calls, 2);
});
