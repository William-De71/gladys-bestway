// -----------------------------------------------------------------------------
// The V2 cloud: the Bestway "SmartSpa" gateway of the "Bestway Connect" app
// (spas from 2025, and every V2 spa since the app update of July 2026).
//
//   login      POST app/smart_home/login/pwd
//              { appKey, data: { account, password, lang, refreshToken }, version }
//              -> data.userToken
//   devices    GET  app/smart_home/users/devices      -> data: [{ productKey, mac, name, onlineStatus, ... }]
//   state      GET  app/device/shadow/{productKey}/{mac} -> data: { water_temperature, ... }
//   command    POST app/device/control/{productKey}/{mac}
//              { appKey, data: "<JSON STRING of the datapoints>", version }
//
// Answers are HTTP 200 with `{ code, message, data, error }`, `code` a string:
// "200" ok, "505" not logged in (log in again once), "1000000" unknown user.
// Bodied requests carry `Content-MD5` (base64 of the MD5 of the body); the
// token goes bare in `Authorization`. The `data` of a command MUST be a JSON
// string: an object is answered "200" and silently ignored. A "200" never
// proves a command was applied: only the next shadow does (5 to 10 s later).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { CloudError, requestJson } from './http.js';

export const SMARTSPA_REGIONS = {
  eu: 'https://smart-spa-eu-app.bestwaycorp.com',
  us: 'https://smart-spa-us-app.bestwaycorp.com',
  cn: 'https://smart-spa-cn-app.bestwaycorp.com',
};
const APP_ID = '39ef26ff404a4cb1b5652f336d4bc045';

const first = (object, ...keys) => {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') {
      return object[key];
    }
  }
  return undefined;
};

const envelope = (data) => ({ appKey: APP_ID, data, version: '1.0' });

/**
 * @description A client of the V2 gateway for one account.
 * @param {object} options - Options.
 * @param {string} options.region - `eu`, `us` or `cn`.
 * @param {string} options.username - E-mail of the Bestway Connect account.
 * @param {string} options.password - Password.
 * @param {string} [options.baseUrl] - Overrides the region URL (tests).
 * @param {Function} [options.fetch] - fetch implementation (tests).
 * @param {number} [options.timeoutMs] - Timeout of one request.
 * @returns {object} The client.
 */
export function createSmartSpaClient({ region, username, password, baseUrl, fetch, timeoutMs }) {
  const root = baseUrl ?? SMARTSPA_REGIONS[region] ?? SMARTSPA_REGIONS.eu;
  let session = null; // { token }

  const send = async (method, path, bodyObject) => {
    const body = bodyObject === undefined ? undefined : JSON.stringify(bodyObject);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json; charset=utf-8',
      Version: '1.0',
      date: 'null',
      'X-Gizwits-Application-Id': APP_ID,
      ...(body === undefined
        ? {}
        : { 'Content-MD5': createHash('md5').update(body).digest('base64') }),
      ...(session ? { Authorization: session.token } : {}),
    };
    const { status, json } = await requestJson(`${root}/${path}`, {
      method,
      headers,
      body,
      fetch,
      timeoutMs,
    });
    if (status === 401) {
      return { code: '505' };
    }
    if (!json || typeof json !== 'object') {
      throw new CloudError('http', `${path}: HTTP ${status}`, { status });
    }
    return json;
  };

  const login = async () => {
    session = null;
    const json = await send(
      'POST',
      'app/smart_home/login/pwd',
      envelope({ account: username, password, lang: 'en', refreshToken: true }),
    );
    const code = String(json.code ?? '');
    const token = json.data && typeof json.data === 'object' ? json.data.userToken : null;
    if (code !== '200' || !token) {
      throw new CloudError(
        code === '200' ? 'api' : 'credentials',
        `login: ${code} ${json.message ?? ''}`.trim(),
        { code },
      );
    }
    session = { token: String(token) };
    return session;
  };

  // A token refused server side ("505"): log in again, once.
  const call = async (method, path, bodyObject, what) => {
    if (!session) {
      await login();
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const json = await send(method, path, bodyObject);
      const code = String(json.code ?? '');
      if (code === '200') {
        return json;
      }
      if (code === '505' && attempt === 1) {
        await login();
        continue;
      }
      throw new CloudError(
        code === '505' ? 'auth' : 'api',
        `${what}: ${code} ${json.message ?? ''}`.trim(),
        {
          code,
        },
      );
    }
    throw new CloudError('auth', `${what}: not logged in`);
  };

  return {
    generation: 'v2',

    get session() {
      return session;
    },
    set session(value) {
      session = value?.token ? { token: value.token } : null;
    },

    login,

    /** @returns {Promise<object[]>} The spas of the account. */
    async devices() {
      const json = await call('GET', 'app/smart_home/users/devices', undefined, 'devices');
      const data = json.data;
      let list = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data && typeof data === 'object') {
        list = first(data, 'list', 'devices', 'deviceList', 'records') ?? [];
      }
      return (Array.isArray(list) ? list : [])
        .filter((raw) => raw && typeof raw === 'object')
        .map((raw) => {
          const productKey = first(raw, 'productKey', 'product_key', 'productkey');
          const mac = first(raw, 'mac', 'deviceMac', 'device_mac');
          if (!productKey || !mac) {
            return null;
          }
          const online = first(raw, 'onlineStatus', 'isOnline', 'is_online', 'online');
          return {
            id: String(mac)
              .toLowerCase()
              .replace(/[^0-9a-f]/g, ''),
            mac: String(mac).toLowerCase(),
            productKey: String(productKey),
            name: String(first(raw, 'name', 'alias', 'deviceName', 'device_name', 'remark') ?? ''),
            product: String(first(raw, 'productName', 'product_name') ?? ''),
            online: online === undefined ? null : Boolean(Number(online)),
            firmware: '',
          };
        })
        .filter((device) => device && device.id);
    },

    /**
     * @param {object} device - Entry of `devices()`.
     * @returns {Promise<{ updatedAt: number, attrs: object }|null>} The shadow.
     */
    async state(device) {
      const json = await call(
        'GET',
        `app/device/shadow/${encodeURIComponent(device.productKey)}/${encodeURIComponent(device.mac)}`,
        undefined,
        'shadow',
      );
      const shadow = json.data && typeof json.data === 'object' ? json.data : null;
      return shadow ? { updatedAt: Date.now(), attrs: shadow } : null;
    },

    /**
     * @param {object} device - Entry of `devices()`.
     * @param {object} datapoints - Shadow fields to write (`{ heater_state: 1 }`).
     */
    async command(device, datapoints) {
      await call(
        'POST',
        `app/device/control/${encodeURIComponent(device.productKey)}/${encodeURIComponent(device.mac)}`,
        envelope(JSON.stringify(datapoints)),
        'control',
      );
    },
  };
}
