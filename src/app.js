// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
//   accounts    the V1 (Bestway Smart Hub) and V2 (Bestway Connect) accounts
//               of the configuration, logged in once, sessions kept in /data
//   discovery   every spa and pool filter pump of the accounts, one Gladys
//               device each, published at start and on a scan
//   readings    every device on the configured interval (30 s at least); the
//               values of the devices the user created are published,
//               unchanged ones skipped
//   scenes      water at target, new error, device lost and found -> scene
//               events; actions "read the spa" and "heat to"
//   commands    power, filter pump, heater, target, bubbles, jets, lock;
//               checked by a reading 15 s later
//   widgets     spa (with buttons), history
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  buildDevice,
  COMMANDS,
  DEVICE_TYPES,
  defaultName,
  deviceValues,
  errorsText,
} from './devices.js';
import { createHistory } from './history.js';
import { createHub } from './hub.js';
import { t, text, truncate, truncateAll } from './i18n.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from './scenes.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { buildHistoryWidget, buildSpaWidget, clock, WIDGET_ACTIONS, WIDGETS } from './widgets.js';

export const ACTIONS = { TEST: 'test_connection' };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const OFFLINE_AFTER_MS = 5 * MINUTE;
const CHECK_AFTER_MS = 15 * SECOND;
const WIDGET_REFRESH_SPACING_MS = 11 * SECOND;
const FRESH_MS = 20 * SECOND;
const MAX_MESSAGE = 1800;
const LANGUAGES = ['en', 'fr', 'de', 'es'];
const TYPES = Object.values(DEVICE_TYPES);

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies.
 * @param {object} [deps.storage] - src/storage.js storage.
 * @param {object} [deps.logger] - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @param {Function} [deps.fetch] - fetch (tests).
 * @param {object} [deps.baseUrls] - `{ v1, v2 }` cloud URLs (tests).
 * @param {number} [deps.checkAfterMs] - Delay of the reading after a command.
 * @returns {object} `{ start, stop, poll, scan, … }`.
 */
export function createApp(
  gladys,
  {
    storage = createStorage(),
    logger = sdkLogger,
    now = Date.now,
    fetch,
    baseUrls,
    checkAfterMs = CHECK_AFTER_MS,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let stopped = false;
  let polling = null;
  let pollTimer = null;
  let statusKey = '';
  const created = new Set(); // device external ids
  const gladysNames = new Map(); // device external id -> name in Gladys
  const transports = new Map();
  const widgetRefresh = new Map();
  const checks = new Map(); // spa id -> timer
  let published = null; // ids of the devices last published to the discovery

  const states = createStatePublisher(gladys, {
    logger,
    now,
    isCreated: (externalId) => created.has(externalId),
  });
  const history = createHistory({ storage, now });

  const safely = (task, what) =>
    Promise.resolve()
      .then(task)
      .catch((error) => logger.warn(`Bestway: ${what} failed: ${error?.message ?? error}`));

  const hub = createHub({
    storage,
    logger,
    now,
    fetch,
    baseUrls,
    onReading: (spa, previous) => onReading(spa, previous),
    onFailure: (spa) => onFailure(spa),
  });

  // --- Ids -----------------------------------------------------------------------------------------

  const ids = (spa) => gladys.externalIds(spa.caps.kind, spa.id);
  const deviceIdOf = (spa) => ids(spa).device;

  /** `ext:sel:spa:v2-6879c4d585ab[:target]` -> `{ type, spaId, key }`. */
  const parseId = (externalId) => {
    const prefix = gladys.externalId('');
    const value = String(externalId ?? '');
    if (!value.startsWith(prefix)) {
      return null;
    }
    const [type, spaId, key] = value.slice(prefix.length).split(':');
    return TYPES.includes(type) && spaId ? { type, spaId, key } : null;
  };

  const all = () => [...hub.spas.values()];
  const nameOf = (spa) => gladysNames.get(deviceIdOf(spa)) || defaultName(spa, config.language);

  // --- Widgets, transports, status -----------------------------------------------------------------

  const refreshWidget = (key) => {
    const slot = widgetRefresh.get(key) ?? { at: 0, timer: null };
    widgetRefresh.set(key, slot);
    const wait = slot.at + WIDGET_REFRESH_SPACING_MS - now();
    if (wait <= 0) {
      slot.at = now();
      safely(() => gladys.requestWidgetRefresh(key), 'widget refresh');
    } else if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        refreshWidget(key);
      }, wait);
      slot.timer.unref?.();
    }
  };
  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  // One channel: the catalog badge says it; the device badge tells cloud from unreachable.
  const publishTransport = (spa) => {
    const deviceId = deviceIdOf(spa);
    if (!created.has(deviceId) || spa.reachable === null) {
      return;
    }
    const transport = spa.reachable ? 'cloud' : 'unreachable';
    if (transports.get(deviceId) !== transport) {
      transports.set(deviceId, transport);
      safely(
        () => gladys.publishTransports([{ external_id: deviceId, transport }]),
        'transport badge',
      );
    }
  };

  function publishStatus() {
    const accounts = [...hub.accounts.values()];
    let key;
    let connected;
    let message;
    if (accounts.length === 0) {
      [key, connected, message] = ['none', false, t('statusNoAccount')];
    } else {
      const failing = accounts.filter(
        (account) => account.status !== 'ok' && account.status !== 'pending',
      );
      const count = all().length;
      if (failing.length === accounts.length) {
        const reason = failing[0].status;
        [key, connected] = [`fail:${reason}`, false];
        message = t(
          reason === 'credentials' || reason === 'waiting'
            ? 'statusCredentials'
            : 'statusCloudDown',
          {
            account: failing[0].generation.toUpperCase(),
          },
        );
      } else if (failing.length > 0) {
        [key, connected] = [`partial:${count}:${failing[0].generation}`, true];
        message = t('statusPartial', { count, account: failing[0].generation.toUpperCase() });
      } else {
        [key, connected] = [`ok:${count}`, true];
        message = t(count === 0 ? 'statusNoDevice' : 'statusConnected', { count });
      }
    }
    if (key !== statusKey) {
      statusKey = key;
      safely(() => gladys.setConnectionStatus(connected, message), 'status');
    }
  }

  // --- States --------------------------------------------------------------------------------------

  const pushAll = (spa) => {
    const deviceIds = ids(spa);
    if (!created.has(deviceIds.device)) {
      return;
    }
    for (const [key, value] of deviceValues(spa, config.language)) {
      states.push(deviceIds.feature(key), value);
    }
  };

  // --- Discovery -----------------------------------------------------------------------------------

  const discoveredIds = () => JSON.stringify(all().map((spa) => deviceIdOf(spa)));

  function publishDiscovered() {
    const spas = all();
    const counts = new Map();
    spas.forEach((spa) => {
      const name = defaultName(spa, config.language);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    const devices = spas.map((spa) =>
      buildDevice(gladys, spa, config.language, counts.get(defaultName(spa, config.language)) > 1),
    );
    published = discoveredIds();
    return safely(() => gladys.publishDiscoveredDevices(devices), 'discovery');
  }

  // --- Scene events --------------------------------------------------------------------------------

  const fire = (key, data) =>
    safely(() => gladys.publishSceneEvent(key, data), `scene event ${key}`);
  const eventBase = (spa) => ({ device: deviceIdOf(spa), device_name: truncate(nameOf(spa), 200) });

  const detectTransitions = (spa, previous) => {
    const current = spa.state;
    if (!previous || !created.has(deviceIdOf(spa))) {
      return false;
    }
    let changed = false;
    if (current.targetReached === true && previous.targetReached === false) {
      changed = true;
      fire(SCENE_TRIGGERS.TARGET_REACHED, { ...eventBase(spa), temperature: current.temperature });
    }
    const fresh = current.errors.filter((code) => !previous.errors.includes(code));
    for (const code of fresh) {
      changed = true;
      fire(SCENE_TRIGGERS.ERROR_OCCURRED, {
        ...eventBase(spa),
        error_code: truncate(code, 60),
        errors: truncate(current.errors.join(', '), 200),
      });
    }
    for (const key of ['power', 'filter', 'heaterOn', 'heating', 'bubbles', 'jets', 'target']) {
      if (current[key] !== previous[key]) {
        changed = true;
      }
    }
    if (current.errors.length !== previous.errors.length) {
      changed = true;
    }
    return changed;
  };

  // --- Readings ------------------------------------------------------------------------------------

  function onReading(spa, previous) {
    if (spa.offlineFired) {
      spa.offlineFired = false;
      if (created.has(deviceIdOf(spa))) {
        fire(SCENE_TRIGGERS.DEVICE_ONLINE, eventBase(spa));
      }
    }
    history.record(spa.id, spa.state);
    pushAll(spa);
    const changed = detectTransitions(spa, previous);
    publishTransport(spa);
    if (
      changed ||
      !previous ||
      Math.abs((previous.temperature ?? 0) - (spa.state.temperature ?? 0)) >= 1
    ) {
      refreshWidgets();
    }
  }

  function onFailure(spa) {
    publishTransport(spa);
    if (
      !spa.offlineFired &&
      spa.failingSince !== null &&
      now() - spa.failingSince >= OFFLINE_AFTER_MS &&
      created.has(deviceIdOf(spa))
    ) {
      spa.offlineFired = true;
      fire(SCENE_TRIGGERS.DEVICE_OFFLINE, eventBase(spa));
      refreshWidgets();
    }
  }

  /** Read every account and device. */
  const poll = ({ relist = false, publish = false } = {}) => {
    if (!polling) {
      polling = (async () => {
        await hub.readAll({ relist });
        if (publish || discoveredIds() !== published) {
          await publishDiscovered();
        }
        publishStatus();
      })().finally(() => {
        polling = null;
      });
    }
    return polling;
  };

  const schedulePolling = () => {
    clearInterval(pollTimer);
    pollTimer = null;
    if (!stopped) {
      pollTimer = setInterval(() => safely(() => poll(), 'reading'), config.pollMs);
      pollTimer.unref?.();
    }
  };

  /** A scan: list the devices again, read them, publish them. */
  const scan = async () => {
    await poll({ relist: true, publish: true });
    refreshWidgets();
    return all();
  };

  // --- Commands ------------------------------------------------------------------------------------

  const userError = (key, vars = {}) => new Error(text(key, config.language, vars));

  const spaOf = (externalId) => {
    const parsed = parseId(externalId);
    const spa = parsed && hub.spas.get(parsed.spaId);
    if (!spa) {
      throw userError('errorUnknownDevice');
    }
    return { spa, parsed };
  };

  const refusal = (error, spa) => {
    if (error instanceof RangeError) {
      return userError('errorRange', { value: truncate(error.message, 60) });
    }
    if (error?.kind === 'credentials' || error?.kind === 'waiting') {
      return userError('errorCredentials', { account: spa.generation.toUpperCase() });
    }
    return userError('errorUnreachable', {
      name: nameOf(spa),
      error: truncate(error?.message ?? error, 160),
    });
  };

  // The clouds report a command late: read again a little after, then publish what is real.
  const checkLater = (spa) => {
    clearTimeout(checks.get(spa.id));
    const timer = setTimeout(() => {
      checks.delete(spa.id);
      if (!stopped) {
        safely(() => hub.read(spa), 'reading after a command');
      }
    }, checkAfterMs);
    timer.unref?.();
    checks.set(spa.id, timer);
  };

  const send = async (spa, command, value) => {
    try {
      await hub.command(spa, command, value);
    } catch (error) {
      throw refusal(error, spa);
    } finally {
      states.forget(deviceIdOf(spa));
      pushAll(spa);
    }
    checkLater(spa);
    refreshWidgets();
  };

  gladys.onSetValue(async (device, feature, value) => {
    const { spa } = spaOf(device.external_id);
    const key = String(feature.external_id).split(':').pop();
    const command = COMMANDS[key];
    if (!command) {
      throw userError('errorReadOnly');
    }
    await send(spa, command, value);
  });

  // --- Device events -------------------------------------------------------------------------------

  const trackCreated = (device) => {
    const parsed = parseId(device?.external_id);
    if (!parsed || parsed.key) {
      return null;
    }
    created.add(device.external_id);
    gladysNames.set(device.external_id, device.name ?? '');
    return hub.spas.get(parsed.spaId) ?? null;
  };

  gladys.onDeviceCreated(async (device) => {
    const spa = trackCreated(device);
    if (spa) {
      // States published before the creation were thrown away by Gladys.
      states.republish(device.external_id);
      pushAll(spa);
      transports.delete(device.external_id);
      publishTransport(spa);
    }
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const spa = trackCreated(device);
    if (spa) {
      states.republish(device.external_id);
      pushAll(spa);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(async (device) => {
    if (device?.external_id) {
      created.delete(device.external_id);
      transports.delete(device.external_id);
      gladysNames.delete(device.external_id);
      states.forget(device.external_id);
    }
    refreshWidgets();
  });

  gladys.onScanRequest(async () => {
    await scan();
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw ?? {});
    const accountsKey = (list) =>
      JSON.stringify(
        list.map((item) => [item.generation, item.region, item.username, item.password]),
      );
    if (accountsKey(previous.accounts) !== accountsKey(config.accounts)) {
      await hub.configure(config.accounts);
      statusKey = '';
      await scan();
    } else if (previous.language !== config.language) {
      await publishDiscovered();
      for (const spa of all()) {
        states.forget(deviceIdOf(spa));
        pushAll(spa);
      }
    }
    if (previous.pollMs !== config.pollMs) {
      schedulePolling();
    }
  });

  // --- Configuration button ------------------------------------------------------------------------

  const accountLine = (account, language) => {
    const label = text(account.generation === 'v1' ? 'accountV1' : 'accountV2', language);
    if (account.status === 'ok') {
      const list = all()
        .filter((spa) => spa.generation === account.generation)
        .map((spa) => {
          const state = spa.reachable
            ? spa.state?.temperature !== null && spa.state?.temperature !== undefined
              ? `${spa.state.temperature} °C`
              : text('testOnline', language)
            : text('testOffline', language);
          return `${nameOf(spa)} (${spa.device.product || spa.family}, ${state})`;
        });
      return list.length > 0
        ? text('testAccountOk', language, {
            account: label,
            count: list.length,
            list: list.join(', '),
          })
        : text('testAccountEmpty', language, { account: label });
    }
    const reason =
      {
        credentials: 'testCredentials',
        waiting: 'testWaiting',
      }[account.status] ?? 'testCloudDown';
    return text(reason, language, { account: label, error: truncate(account.error ?? '', 160) });
  };

  gladys.onAction(ACTIONS.TEST, async () => {
    if (hub.accounts.size === 0) {
      return t('testNoAccount');
    }
    await scan();
    const message = {};
    for (const language of LANGUAGES) {
      message[language] = [...hub.accounts.values()]
        .map((account) => accountLine(account, language))
        .join(' ');
    }
    return truncateAll(message, MAX_MESSAGE);
  });

  // --- Scene actions -------------------------------------------------------------------------------

  const readyOutputs = (spa, heating = spa.state.heating) => {
    const ready = history.ready(spa.id, { ...spa.state, heating });
    return {
      minutes_to_target: ready ? ready.minutes : null,
      ready_at: ready ? clock(ready.at)[config.language] : '',
    };
  };

  const heaterText = (state, language) => {
    if (state.heaterOn === null) {
      return '';
    }
    if (!state.heaterOn) {
      return text('heater_off', language);
    }
    if (state.targetReached) {
      return text('heater_target_reached', language);
    }
    return text(state.heating ? 'heater_heating' : 'heater_on', language);
  };

  const fresh = async (spa) => {
    if (!spa.lastReadingAt || now() - spa.lastReadingAt > FRESH_MS) {
      await hub.read(spa);
    }
    if (!spa.reachable || !spa.state) {
      throw userError('errorUnreachable', { name: nameOf(spa), error: spa.error ?? '' });
    }
  };

  gladys.onSceneAction(SCENE_ACTIONS.READ_VALUES, async (fields = {}) => {
    const { spa } = spaOf(fields.device);
    await fresh(spa);
    const state = spa.state;
    return {
      water_temperature: state.temperature,
      target_temperature: state.target,
      heater: state.heaterOn,
      heater_text: heaterText(state, config.language),
      ...readyOutputs(spa),
      errors: errorsText(state, config.language),
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.HEAT_TO, async (fields = {}) => {
    const { spa } = spaOf(fields.device);
    if (spa.caps.kind !== DEVICE_TYPES.SPA) {
      throw userError('errorNotSpa');
    }
    await fresh(spa);
    const temperature = Number(fields.temperature);
    if (spa.state.target !== temperature) {
      await send(spa, 'target', temperature);
    }
    if (!spa.state.heaterOn) {
      await send(spa, 'heater', true);
    }
    return {
      target_temperature: spa.state.target,
      water_temperature: spa.state.temperature,
      ...readyOutputs(spa, spa.state.target > spa.state.temperature),
    };
  });

  // --- Widgets -------------------------------------------------------------------------------------

  const viewOf = (settings) => {
    const parsed = settings?.device ? parseId(settings.device) : null;
    const spa = parsed ? hub.spas.get(parsed.spaId) : all()[0];
    if (!spa?.state) {
      return null;
    }
    const deviceIds = ids(spa);
    const featureIf = (key) => (created.has(deviceIds.device) ? deviceIds.feature(key) : null);
    return {
      name: nameOf(spa),
      device: deviceIds.device,
      reachable: Boolean(spa.reachable),
      state: spa.state,
      caps: spa.caps,
      ready: history.ready(spa.id, spa.state),
      rate: history.rate(spa.id),
      features: { temperature: featureIf('temperature'), target: featureIf('target') },
    };
  };

  gladys.onWidgetGet(WIDGETS.SPA, async ({ settings } = {}) => buildSpaWidget(viewOf(settings)));
  gladys.onWidgetGet(WIDGETS.HISTORY, async ({ settings } = {}) =>
    buildHistoryWidget(viewOf(settings), settings?.period),
  );

  gladys.onWidgetAction(WIDGETS.SPA, async (actionKey, params = {}, { settings } = {}) => {
    let spa;
    try {
      ({ spa } = spaOf(params?.device ?? settings?.device));
    } catch {
      return t('errorUnknownDevice');
    }
    const step = spa.state?.unit === 'F' ? 5 / 9 : 1;
    const plans = {
      [WIDGET_ACTIONS.HEATER_ON]: ['heater', true, 'toastHeaterOn'],
      [WIDGET_ACTIONS.HEATER_OFF]: ['heater', false, 'toastHeaterOff'],
      [WIDGET_ACTIONS.BUBBLES_ON]: [
        'bubbles',
        spa.caps.bubbles === 'levels' ? 'max' : true,
        'toastBubblesOn',
      ],
      [WIDGET_ACTIONS.BUBBLES_OFF]: [
        'bubbles',
        spa.caps.bubbles === 'levels' ? 'off' : false,
        'toastBubblesOff',
      ],
      [WIDGET_ACTIONS.TARGET_DOWN]: ['target', (spa.state?.target ?? 0) - step, 'toastTarget'],
      [WIDGET_ACTIONS.TARGET_UP]: ['target', (spa.state?.target ?? 0) + step, 'toastTarget'],
    };
    const plan = plans[actionKey];
    if (!plan) {
      return undefined;
    }
    const [command, value, toast] = plan;
    try {
      await send(spa, command, value);
    } catch (error) {
      return truncateAll(
        Object.fromEntries(
          LANGUAGES.map((language) => [
            language,
            `${text('toastFailed', language)} ${error.message}`,
          ]),
        ),
        200,
      );
    }
    return t(toast, { target: spa.state.target ?? '' });
  });

  // --- Lifecycle -----------------------------------------------------------------------------------

  return {
    /** Log in, list and read every device, publish them. */
    async start() {
      stopped = false;
      config = normalizeConfig(gladys.config ?? {});
      created.clear();
      await history.load();
      await hub.configure(config.accounts);
      (gladys.devices ?? []).forEach((device) => trackCreated(device));
      publishStatus();
      schedulePolling();
      await scan();
      // Devices created before this start: their spa is known now.
      (gladys.devices ?? []).forEach((device) => trackCreated(device));
      all().forEach((spa) => {
        pushAll(spa);
        publishTransport(spa);
      });
    },

    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      widgetRefresh.forEach((slot) => clearTimeout(slot.timer));
      checks.forEach((timer) => clearTimeout(timer));
      states.stop();
      await Promise.allSettled([polling]);
      await history.flush().catch(() => {});
    },

    poll,
    scan,
    flushStates: () => states.flush(),
    hub,
    history,
  };
}
