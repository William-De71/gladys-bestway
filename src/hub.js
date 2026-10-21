// -----------------------------------------------------------------------------
// The accounts and their devices.
//
//   accounts   one per generation (V1 Smart Hub, V2 Bestway Connect), each
//              with its own client; the session (token) is kept in /data
//              and reused: logins are rate limited by the clouds, a refused
//              one waits 15 minutes, then twice as long each time (6 h at
//              most) before the next try, so a wrong password never gets
//              the account locked
//   devices    listed at start, on a scan, every 30 minutes, and when an
//              unknown device shows up
//   readings   one request per device; the state read is merged with what
//              a command just set: the clouds report a change 5 to 30 s
//              late, so a value commanded is kept 45 s unless the cloud
//              already reports it
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createGizwitsClient } from './bestway/gizwits.js';
import { CloudError } from './bestway/http.js';
import { capabilitiesOf, encodeCommand, familyOf, readState } from './bestway/model.js';
import { createSmartSpaClient } from './bestway/smartspa.js';

const MINUTE = 60 * 1000;
const HOLD_MS = 45 * 1000;
const LIST_EVERY_MS = 30 * MINUTE;
const LOGIN_PAUSE_MS = 15 * MINUTE;
const LOGIN_PAUSE_MAX_MS = 6 * 60 * MINUTE;
const RENEW_BEFORE_MS = 24 * 60 * MINUTE;
const SESSIONS_FILE = 'sessions.json';

const fingerprint = (account) =>
  createHash('sha256')
    .update(`${account.generation}\n${account.region}\n${account.username.toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);

/**
 * @description Create the hub.
 * @param {object} deps - Dependencies.
 * @param {object} deps.storage - src/storage.js storage.
 * @param {object} deps.logger - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @param {Function} [deps.fetch] - fetch (tests).
 * @param {object} [deps.baseUrls] - `{ v1, v2 }` instead of the region URLs (tests).
 * @param {number} [deps.timeoutMs] - Timeout of one request.
 * @param {Function} deps.onReading - `(spa, previousState)` after each successful reading.
 * @param {Function} deps.onFailure - `(spa)` after a reading that failed or a device offline.
 * @returns {object} The hub.
 */
export function createHub({
  storage,
  logger,
  now = Date.now,
  fetch,
  baseUrls = {},
  timeoutMs,
  onReading = () => {},
  onFailure = () => {},
}) {
  const accounts = new Map(); // generation -> account
  const spas = new Map(); // spa id -> spa
  let sessions = null;

  const loadSessions = async () => {
    sessions = sessions ?? (await storage.read(SESSIONS_FILE)) ?? {};
    return sessions;
  };
  const saveSessions = () => storage.write(SESSIONS_FILE, sessions ?? {});

  const makeClient = (account) =>
    (account.generation === 'v1' ? createGizwitsClient : createSmartSpaClient)({
      region: account.region,
      username: account.username,
      password: account.password,
      baseUrl: baseUrls[account.generation],
      fetch,
      timeoutMs,
    });

  /**
   * @description Apply the accounts of the configuration (new client when an account changed).
   * @param {object[]} list - `[{ generation, region, username, password }]`.
   */
  async function configure(list) {
    await loadSessions();
    const wanted = new Map(list.map((account) => [account.generation, account]));
    for (const [generation, account] of accounts) {
      const next = wanted.get(generation);
      if (
        !next ||
        fingerprint(next) !== account.fingerprint ||
        next.password !== account.password
      ) {
        accounts.delete(generation);
        for (const [id, spa] of spas) {
          if (spa.generation === generation) {
            spas.delete(id);
          }
        }
      }
    }
    for (const [generation, settings] of wanted) {
      if (accounts.has(generation)) {
        continue;
      }
      const account = {
        ...settings,
        fingerprint: fingerprint(settings),
        client: makeClient(settings),
        status: 'pending',
        error: null,
        loginFailures: 0,
        nextLoginAt: 0,
        listedAt: 0,
      };
      const savedSession = sessions[generation];
      if (savedSession?.fingerprint === account.fingerprint && savedSession.token) {
        account.client.session = savedSession;
      }
      accounts.set(generation, account);
    }
  }

  const sessionValid = (account) => {
    const session = account.client.session;
    if (!session) {
      return false;
    }
    return !session.expiresAt || session.expiresAt - now() > RENEW_BEFORE_MS;
  };

  async function login(account) {
    if (now() < account.nextLoginAt) {
      throw new CloudError(
        'waiting',
        `login paused until ${new Date(account.nextLoginAt).toISOString()}`,
      );
    }
    try {
      const session = await account.client.login();
      account.loginFailures = 0;
      account.nextLoginAt = 0;
      sessions[account.generation] = { ...session, fingerprint: account.fingerprint };
      await saveSessions().catch((error) =>
        logger.warn(`Bestway: saving the session failed: ${error.message}`),
      );
      logger.info(`Bestway: ${account.generation.toUpperCase()} account logged in`);
    } catch (error) {
      if (error.kind === 'credentials' || error.kind === 'api') {
        account.loginFailures += 1;
        const pause = Math.min(
          LOGIN_PAUSE_MS * 2 ** (account.loginFailures - 1),
          LOGIN_PAUSE_MAX_MS,
        );
        account.nextLoginAt = now() + pause;
      }
      if (sessions[account.generation]) {
        delete sessions[account.generation];
        await saveSessions().catch(() => {});
      }
      throw error;
    }
  }

  /** Run a request, logging in first if needed and once again on a refused token. */
  async function authed(account, task) {
    if (!sessionValid(account)) {
      await login(account);
    }
    try {
      return await task();
    } catch (error) {
      if (error.kind !== 'auth') {
        throw error;
      }
      account.client.session = null;
      await login(account);
      return task();
    }
  }

  const setAccount = (account, status, error = null) => {
    account.status = status;
    account.error = error;
  };

  const spaId = (generation, deviceId) => `${generation}-${deviceId}`;

  /** List the devices of an account and keep the known ones up to date. */
  async function list(account) {
    const devices = await authed(account, () => account.client.devices());
    account.listedAt = now();
    for (const device of devices) {
      const family = familyOf(account.generation, device);
      const id = spaId(account.generation, device.id);
      if (!family) {
        if (!spas.has(id)) {
          logger.warn(
            `Bestway: unknown product "${device.product}" (${device.name}), not supported yet`,
          );
        }
        continue;
      }
      const existing = spas.get(id);
      if (existing) {
        Object.assign(existing, {
          device,
          family,
          name: device.name || existing.name,
          online: device.online,
        });
        continue;
      }
      spas.set(id, {
        id,
        generation: account.generation,
        device,
        family,
        caps: capabilitiesOf(family),
        name: device.name,
        online: device.online,
        state: null,
        reachable: null,
        lastReadingAt: 0,
        failingSince: null,
        error: null,
        holds: new Map(),
      });
    }
    return devices;
  }

  const applyHolds = (spa, state) => {
    for (const [key, hold] of spa.holds) {
      if (now() > hold.until || state[key] === hold.value) {
        spa.holds.delete(key);
      } else {
        state[key] = hold.value;
      }
    }
    return state;
  };

  const fail = (spa, error) => {
    spa.reachable = false;
    spa.error = error?.message ?? String(error);
    spa.failingSince = spa.failingSince ?? now();
    onFailure(spa);
  };

  /**
   * @description Read one device.
   * @param {object} spa - Device of the hub.
   */
  async function read(spa) {
    const account = accounts.get(spa.generation);
    if (!account) {
      return;
    }
    let report;
    try {
      report = await authed(account, () => account.client.state(spa.device));
    } catch (error) {
      if (error.kind === 'offline') {
        spa.online = false;
      }
      fail(spa, error);
      return;
    }
    if (!report) {
      spa.online = false;
      fail(spa, new Error('no report from the cloud'));
      return;
    }
    const connect = report.attrs.ConnectType;
    if (connect !== undefined) {
      spa.online = String(connect).toLowerCase() === 'online';
    }
    if (spa.online === false) {
      fail(spa, new Error('the cloud reports the device offline'));
      return;
    }
    const previous = spa.state;
    spa.state = applyHolds(spa, readState(spa.family, report.attrs));
    spa.raw = report.attrs;
    spa.reachable = true;
    spa.error = null;
    spa.failingSince = null;
    spa.lastReadingAt = now();
    onReading(spa, previous);
  }

  /**
   * @description Read everything: each account (logged in, devices listed
   * when due), then each of its devices.
   * @param {object} [options] - `{ relist }` to list the devices now.
   */
  async function readAll({ relist = false } = {}) {
    for (const account of accounts.values()) {
      try {
        if (relist || account.listedAt === 0 || now() - account.listedAt > LIST_EVERY_MS) {
          await list(account);
        }
        setAccount(account, 'ok');
      } catch (error) {
        setAccount(account, error.kind ?? 'network', error.message);
        logger.warn(`Bestway: ${account.generation.toUpperCase()} account: ${error.message}`);
        for (const spa of spas.values()) {
          if (spa.generation === account.generation) {
            fail(spa, error);
          }
        }
        continue;
      }
      for (const spa of spas.values()) {
        if (spa.generation === account.generation) {
          await read(spa);
        }
      }
    }
  }

  /**
   * @description Send a command and keep its expected effect until the cloud reports it.
   * @param {object} spa - Device of the hub.
   * @param {string} key - Command (src/bestway/model.js `encodeCommand`).
   * @param {*} value - Value.
   * @returns {Promise<object>} The new state.
   */
  async function command(spa, key, value) {
    const account = accounts.get(spa.generation);
    if (!account) {
      throw new CloudError('auth', 'no account for this device');
    }
    const { wire, expected } = encodeCommand(spa.family, key, value, spa.state ?? {});
    await authed(account, () => account.client.command(spa.device, wire));
    logger.info(`Bestway: ${spa.id} <- ${JSON.stringify(wire)}`);
    const until = now() + HOLD_MS;
    for (const [field, fieldValue] of Object.entries(expected)) {
      spa.holds.set(field, { value: fieldValue, until });
    }
    spa.state = { ...(spa.state ?? readState(spa.family, {})), ...expected };
    return spa.state;
  }

  return {
    configure,
    readAll,
    read,
    list,
    command,
    accounts,
    spas,
    /** For the tests: forget the cached sessions file. */
    resetSessions: () => {
      sessions = null;
    },
  };
}
