// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and the fake Bestway cloud on
// a real local HTTP server: accounts, discovery, readings, states, commands,
// scene triggers and actions, widgets and their buttons, lost devices,
// refused passwords, restarts. Nothing leaves 127.0.0.1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { SCENE_ACTION_OUTPUTS, SCENE_TRIGGER_DATA } from '../src/scenes.js';
import { memoryStorage } from '../src/storage.js';
import { ACCOUNTS, fakeClock, startFake, until } from './helpers.js';

const V1 = 'ext:test-integration:spa:v1-rX9kQ2aBcD3eF4gH';
const V2 = 'ext:test-integration:spa:v2-6879c4d585ab';
const MINUTE = 60 * 1000;

/**
 * @description An integration wired to the fake Gladys and the fake cloud.
 * @param {object} [options] - `{ config, create, storage, cloud, gladysDevices }`.
 * @returns {Promise<object>} `{ gladys, fake, cloud, app, logs, clock, storage, stop }`.
 */
async function setup({
  config = {},
  create = true,
  storage = memoryStorage(),
  cloud,
  gladysDevices,
} = {}) {
  const bestway = cloud ?? (await startFake());
  const gladys = createFakeGladys({
    config: { language: 'fr', ...ACCOUNTS, ...config },
    devices: gladysDevices,
  });
  const logs = [];
  const log = (line) => logs.push(String(line));
  const clock = fakeClock();
  const app = createApp(gladys, {
    storage,
    now: clock.now,
    logger: { debug: log, info: log, warn: log, error: log },
    baseUrls: bestway.baseUrls,
    checkAfterMs: 20,
  });
  await gladys.connect();
  await app.start();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(structuredClone(device));
    }
    await app.flushStates();
  }
  const stop = async () => {
    await app.stop();
    if (!cloud) {
      await bestway.close();
    }
  };
  return { gladys, fake: gladys.fake, cloud: bestway, app, logs, clock, storage, stop };
}

const deviceOf = (fake, externalId) =>
  structuredClone(fake.discoveredDevices.find((device) => device.external_id === externalId));
const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`));

test('both accounts: one device per spa, the names of the app, connected', async () => {
  const { fake, cloud, stop } = await setup({ create: false });
  try {
    const ids = fake.discoveredDevices.map((device) => device.external_id).sort();
    assert.deepEqual(ids, [V1, V2]);
    const v1 = deviceOf(fake, V1);
    assert.equal(v1.name, 'Lay-Z-Spa Maldives');
    assert.equal(v1.model, 'Bestway Hydrojet_Pro');
    assert.ok(featureOf(v1, 'jets'), 'HydroJet jets');
    assert.ok(featureOf(v1, 'bubbles_level'), 'V1 bubbles levels');
    assert.equal(featureOf(v1, 'lock'), undefined);
    const v2 = deviceOf(fake, V2);
    assert.equal(v2.name, 'Hollywood AirJet');
    assert.ok(featureOf(v2, 'bubbles'), 'V2 bubbles on / off');
    assert.ok(featureOf(v2, 'lock'));
    assert.equal(fake.connectionStatus.connected, true);
    assert.match(fake.connectionStatus.message.fr, /2 appareil/);
    assert.deepEqual(cloud.logins, { v1: 1, v2: 1 });
  } finally {
    await stop();
  }
});

test('no account: not connected, a clear message, nothing published', async () => {
  const { fake, cloud, stop } = await setup({
    create: false,
    config: { v1_email: '', v1_password: '', v2_email: '', v2_password: '' },
  });
  try {
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(fake.connectionStatus.message.en, /Fill in the e-mail and password/);
    assert.deepEqual(fake.discoveredDevices, []);
    assert.equal(cloud.requests.length, 0);
    const result = await fake.action('test_connection', {});
    assert.match(result.data.message.fr, /Aucun compte/);
  } finally {
    await stop();
  }
});

test('created devices get their values; others publish nothing', async () => {
  const { fake, stop } = await setup();
  try {
    assert.equal(fake.lastState(`${V1}:temperature`), 31);
    assert.equal(fake.lastState(`${V1}:target`), 38);
    assert.equal(fake.lastState(`${V1}:heater`), 1);
    assert.equal(fake.lastState(`${V1}:heating`), 1);
    assert.equal(fake.lastState(`${V1}:filter`), 1);
    assert.equal(fake.lastState(`${V1}:bubbles_level`), 'off');
    assert.equal(fake.lastState(`${V1}:errors`), 'Aucune');
    assert.equal(fake.lastState(`${V2}:temperature`), 34);
    assert.equal(fake.lastState(`${V2}:heater`), 0);
    assert.equal(fake.lastState(`${V2}:bubbles`), 0);
    assert.equal(fake.lastState(`${V2}:lock`), 0);
  } finally {
    await stop();
  }
  const quiet = await setup({ create: false });
  try {
    assert.equal(quiet.fake.states.length, 0, 'nothing for devices not created');
  } finally {
    await quiet.stop();
  }
});

test('commands: the wire of each cloud, the value kept until the cloud reports it', async () => {
  const cloud = await startFake({ applyAfterMs: 200 });
  const { fake, app, stop } = await setup({ cloud });
  try {
    const v2 = deviceOf(fake, V2);
    const ack = await fake.setValue(v2, featureOf(v2, 'heater'), 1);
    assert.equal(ack.success, true, JSON.stringify(ack));
    assert.deepEqual(cloud.commands.at(-1), {
      generation: 'v2',
      id: '6879c4d585ab',
      attrs: { heater_state: 1 },
    });
    await app.flushStates();
    assert.equal(fake.lastState(`${V2}:heater`), 1, 'shown at once');

    // The cloud still reports the old value: kept.
    await app.poll();
    await app.flushStates();
    assert.equal(fake.lastState(`${V2}:heater`), 1);
    await until(() => cloud.v2.devices[0].shadow.heater_state === 2);
    await app.poll();
    await app.flushStates();
    assert.equal(fake.lastState(`${V2}:heating`), 1, 'reads back 2: heating');

    const v1 = deviceOf(fake, V1);
    await fake.setValue(v1, featureOf(v1, 'target'), 36.5);
    assert.deepEqual(cloud.commands.at(-1).attrs, { Tset: 37 });
    await fake.setValue(v1, featureOf(v1, 'bubbles_level'), 'medium');
    assert.deepEqual(cloud.commands.at(-1).attrs, { wave: 40 });
    await fake.setValue(v1, featureOf(v1, 'jets'), 1);
    assert.deepEqual(cloud.commands.at(-1).attrs, { jet: 1 });
  } finally {
    await stop();
    await cloud.close();
  }
});

test('a refused command: Gladys shows the real value again, the user reads why', async () => {
  const { fake, cloud, app, stop } = await setup();
  try {
    const v1 = deviceOf(fake, V1);
    const ack = await fake.setValue(v1, featureOf(v1, 'target'), 42);
    assert.equal(ack.success, false);
    assert.match(ack.error, /20 à 40 °C/);
    const readOnly = await fake.setValue(v1, featureOf(v1, 'temperature'), 30);
    assert.equal(readOnly.success, false);
    assert.match(readOnly.error, /lecture seule/);

    cloud.v1.devices[0].is_online = false;
    const offline = await fake.setValue(v1, featureOf(v1, 'heater'), 0);
    assert.equal(offline.success, false);
    assert.match(offline.error, /injoignable/);
    await app.flushStates();
    assert.equal(fake.lastState(`${V1}:heater`), 1, 'back to the real value');
  } finally {
    await stop();
  }
});

test('a refused token is renewed once, then the request goes through', async () => {
  const { cloud, app, fake, stop } = await setup();
  try {
    cloud.expireTokens();
    cloud.v1.devices[0].attr.Tnow = 33;
    await app.poll();
    await app.flushStates();
    assert.equal(fake.lastState(`${V1}:temperature`), 33);
    assert.deepEqual(cloud.logins, { v1: 2, v2: 2 });
  } finally {
    await stop();
  }
});

test('scene events: water at target, a new error once, lost and found', async () => {
  const { fake, cloud, app, clock, stop } = await setup();
  try {
    const spa = cloud.v1.devices[0];
    spa.attr.heat = 4;
    spa.attr.Tnow = 38;
    await app.poll();
    let events = fake.sceneEvents.filter((event) => event.key === 'target_reached');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].data, {
      device: V1,
      device_name: 'Lay-Z-Spa Maldives',
      temperature: 38,
    });

    spa.attr.E02 = 1;
    await app.poll();
    await app.poll();
    events = fake.sceneEvents.filter((event) => event.key === 'error_occurred');
    assert.equal(events.length, 1, 'once');
    assert.equal(events[0].data.error_code, 'E02');
    await app.flushStates();
    assert.equal(fake.lastState(`${V1}:errors`), 'E02');

    spa.is_online = false;
    await app.poll({ relist: true });
    assert.equal(
      fake.sceneEvents.filter((event) => event.key === 'device_offline').length,
      0,
      'not yet',
    );
    clock.advance(6 * MINUTE);
    await app.poll({ relist: true });
    assert.equal(fake.sceneEvents.filter((event) => event.key === 'device_offline').length, 1);
    assert.ok(fake.transports.some((item) => item.transport === 'unreachable'));
    spa.is_online = true;
    await app.poll({ relist: true });
    assert.equal(fake.sceneEvents.filter((event) => event.key === 'device_online').length, 1);
    assert.equal(
      fake.transports.filter((item) => item.device_external_id === V1).at(-1).transport,
      'cloud',
    );

    for (const event of fake.sceneEvents) {
      assert.deepEqual(
        Object.keys(event.data).sort(),
        [...SCENE_TRIGGER_DATA[event.key]].sort(),
        event.key,
      );
    }
  } finally {
    await stop();
  }
});

test('a command never fires a scene event', async () => {
  const { fake, stop } = await setup();
  try {
    const v1 = deviceOf(fake, V1);
    await fake.setValue(v1, featureOf(v1, 'heater'), 0);
    await fake.setValue(v1, featureOf(v1, 'heater'), 1);
    assert.equal(fake.sceneEvents.length, 0);
  } finally {
    await stop();
  }
});

test('wrong password: not connected, and the login waits before trying again', async () => {
  const { fake, cloud, app, clock, stop } = await setup({
    create: false,
    config: { v2_email: '', v2_password: '', v1_password: 'wrong' },
  });
  try {
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(
      fake.connectionStatus.message.fr,
      /refuse l'e-mail ou le mot de passe du compte V1/,
    );
    assert.equal(cloud.requests.filter((request) => request.path === '/app/login').length, 1);
    await app.poll();
    await app.poll();
    assert.equal(
      cloud.requests.filter((request) => request.path === '/app/login').length,
      1,
      'paused',
    );
    const result = await fake.action('test_connection', {});
    assert.match(result.data.message.fr, /Compte Bestway Smart Hub \(V1\)/);
    clock.advance(16 * MINUTE);
    await app.poll();
    assert.equal(cloud.requests.filter((request) => request.path === '/app/login').length, 2);
    clock.advance(16 * MINUTE);
    await app.poll();
    assert.equal(
      cloud.requests.filter((request) => request.path === '/app/login').length,
      2,
      '30 min now',
    );
  } finally {
    await stop();
  }
});

test('one account fails, the other works: connected, with a note', async () => {
  const { fake, stop } = await setup({ create: false, config: { v2_password: 'wrong' } });
  try {
    assert.equal(fake.connectionStatus.connected, true);
    assert.match(fake.connectionStatus.message.fr, /compte V2 ne se connecte pas/);
    assert.deepEqual(
      fake.discoveredDevices.map((device) => device.external_id),
      [V1],
    );
  } finally {
    await stop();
  }
});

test('the session is kept in /data: a restart does not log in again', async () => {
  const cloud = await startFake();
  const storage = memoryStorage();
  try {
    const first = await setup({ cloud, storage, create: false });
    await first.stop();
    assert.ok(storage.files['sessions.json'].v1.token);
    assert.equal(
      JSON.stringify(storage.files['sessions.json']).includes('secret-'),
      false,
      'no password',
    );
    const second = await setup({ cloud, storage, create: false });
    await second.stop();
    assert.deepEqual(cloud.logins, { v1: 1, v2: 1 });
    // Another account: the old session is not reused.
    const third = await setup({
      cloud,
      storage,
      create: false,
      config: { v1_email: 'other@example.com' },
    });
    await third.stop();
    assert.equal(cloud.logins.v1, 1, 'other@ does not exist: no new session');
    assert.equal(storage.files['sessions.json'].v1, undefined);
  } finally {
    await cloud.close();
  }
});

test('the test button lists each account and its devices', async () => {
  const { fake, stop } = await setup({ create: false });
  try {
    const result = await fake.action('test_connection', {});
    assert.equal(result.success, true);
    const { fr, en } = result.data.message;
    assert.match(
      fr,
      /Compte Bestway Smart Hub \(V1\) : connecté, 1 appareil\(s\) : Lay-Z-Spa Maldives \(Hydrojet_Pro, 31 °C\)/,
    );
    assert.match(en, /Bestway Connect account \(V2\): connected, 1 device\(s\): Hollywood AirJet/);
  } finally {
    await stop();
  }
});

test('scene action read_values: declared outputs only', async () => {
  const { fake, stop } = await setup();
  try {
    const result = await fake.sceneAction('read_values', { device: V1 });
    assert.equal(result.success, true, JSON.stringify(result));
    const { outputs } = result.data;
    assert.deepEqual(Object.keys(outputs).sort(), [...SCENE_ACTION_OUTPUTS.read_values].sort());
    assert.equal(outputs.water_temperature, 31);
    assert.equal(outputs.heater_text, 'Chauffe');
    assert.equal(outputs.errors, 'Aucune');
    const unknown = await fake.sceneAction('read_values', {
      device: 'ext:test-integration:spa:v1-nope',
    });
    assert.equal(unknown.success, false);
  } finally {
    await stop();
  }
});

test('scene action heat_to: target and heater in one step, idempotent', async () => {
  const { fake, cloud, stop } = await setup();
  try {
    const result = await fake.sceneAction('heat_to', { device: V2, temperature: 39 });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(
      Object.keys(result.data.outputs).sort(),
      [...SCENE_ACTION_OUTPUTS.heat_to].sort(),
    );
    assert.deepEqual(
      cloud.commands.map((command) => command.attrs),
      [{ temperature_setting: 39 }, { heater_state: 1 }],
    );
    await fake.sceneAction('heat_to', { device: V2, temperature: 39 });
    assert.equal(cloud.commands.length, 2, 'nothing sent again');
  } finally {
    await stop();
  }
});

test('widgets: valid content in every state; buttons send their command', async () => {
  const { fake, cloud, app, stop } = await setup();
  try {
    for (const settings of [{}, { device: V1 }, { device: V2 }]) {
      for (const key of ['spa', 'history']) {
        const result = await fake.widgetGet(key, {
          settings: { ...settings, period: 'last-week' },
        });
        assert.equal(result.success, true);
        assert.deepEqual(
          validateWidgetContent(result.data.content),
          [],
          `${key} ${JSON.stringify(settings)}`,
        );
      }
    }
    const content = (await fake.widgetGet('spa', { settings: { device: V2 } })).data.content;
    const buttons = content.components.filter((component) => component.type === 'button');
    assert.deepEqual(
      buttons.map((button) => button.action.key),
      ['heater_on', 'bubbles_on', 'target_down', 'target_up'],
    );
    const toast = await fake.widgetAction('spa', 'target_up', buttons[3].action.params);
    assert.equal(toast.success, true);
    assert.match(toast.data.message.fr, /Consigne réglée à 38 °C/);
    assert.deepEqual(cloud.commands.at(-1).attrs, { temperature_setting: 38 });
    await fake.widgetAction('spa', 'bubbles_on', buttons[1].action.params);
    assert.deepEqual(cloud.commands.at(-1).attrs, { wave_state: 1 });

    cloud.down = true;
    const failed = await fake.widgetAction('spa', 'heater_on', buttons[0].action.params);
    assert.match(failed.data.message.fr, /^Non effectué/);
    await app.poll();
    const offline = (await fake.widgetGet('spa', { settings: { device: V2 } })).data.content;
    assert.deepEqual(validateWidgetContent(offline), []);
    assert.equal(
      offline.components.some((component) => component.type === 'button'),
      false,
    );
  } finally {
    await stop();
  }
});

test('the heating speed is learned, then the time the water is ready is shown', async () => {
  const { fake, cloud, app, clock, stop } = await setup();
  try {
    const spa = cloud.v1.devices[0];
    for (let step = 0; step < 6; step += 1) {
      clock.advance(10 * MINUTE);
      spa.attr.Tnow = 31 + Math.floor((step + 1) / 2);
      await app.poll();
    }
    assert.equal(app.history.rate('v1-rX9kQ2aBcD3eF4gH'), 3);
    const content = (await fake.widgetGet('spa', { settings: { device: V1 } })).data.content;
    const status = content.components.find((component) => component.type === 'status');
    assert.match(status.items[0].value.fr, /Prêt vers \d\d h \d\d/);
    const history = (await fake.widgetGet('history', { settings: { device: V1 } })).data.content;
    assert.ok(history.components.some((component) => component.type === 'value'));
    const outputs = (await fake.sceneAction('read_values', { device: V1 })).data.outputs;
    assert.equal(outputs.minutes_to_target, 80);
  } finally {
    await stop();
  }
});

test('a changed language renames features; a changed account logs in again', async () => {
  const { fake, cloud, stop } = await setup({ create: false });
  try {
    await fake.configUpdated({ ...ACCOUNTS, language: 'de' });
    const v1 = deviceOf(fake, V1);
    assert.equal(featureOf(v1, 'temperature').name, 'Wassertemperatur');
    await fake.configUpdated({ ...ACCOUNTS, language: 'de', v2_email: '', v2_password: '' });
    assert.deepEqual(
      fake.discoveredDevices.map((device) => device.external_id),
      [V1],
    );
    assert.equal(cloud.logins.v1, 1, 'the V1 account did not change');
  } finally {
    await stop();
  }
});
