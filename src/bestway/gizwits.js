// -----------------------------------------------------------------------------
// The V1 cloud: Gizwits, used by the "Bestway Smart Hub" app (spas up to about
// 2024 and the Flowclear Smart Touch pool filter pumps).
//
//   login      POST /app/login            { username, password, lang }
//                                         -> { uid, token, expire_at }
//   devices    GET  /app/bindings         -> { devices: [{ did, product_name, dev_alias, is_online, ... }] }
//   state      GET  /app/devdata/{did}/latest -> { updated_at, attr: {...} }
//   command    POST /app/control/{did}    { attrs: {...} }
//
// Every request carries the application id of the app; the authenticated
// ones the user token in `X-Gizwits-User-token`. Errors come as HTTP 400 with
// `{ error_code, error_message }`: 9004 token invalid or expired, 9005 user
// does not exist, 9020 wrong password, 9042 device offline. Logins are rate
// limited hard: the token (valid for weeks, `expire_at`) is kept in /data and
// reused, a failed login waits before the next one (src/hub.js).
// -----------------------------------------------------------------------------

import { CloudError, requestJson } from './http.js';

export const GIZWITS_REGIONS = {
  eu: 'https://euapi.gizwits.com',
  us: 'https://usapi.gizwits.com',
};
const APP_ID = '98754e684ec045528b073876c34c7348';

const errorOf = (status, json, what) => {
  const code = json?.error_code;
  if (code === 9004) {
    return new CloudError('auth', `${what}: token invalid or expired`, { status, code });
  }
  if (code === 9005 || code === 9020) {
    return new CloudError('credentials', `${what}: ${json.error_message ?? 'login refused'}`, {
      status,
      code,
    });
  }
  if (code === 9042) {
    return new CloudError('offline', `${what}: the device is offline`, { status, code });
  }
  return new CloudError(
    status >= 400 && code === undefined ? 'http' : 'api',
    `${what}: ${code ?? `HTTP ${status}`} ${json?.error_message ?? ''}`.trim(),
    { status, code },
  );
};

/**
 * @description A client of the V1 cloud for one account.
 * @param {object} options - Options.
 * @param {string} options.region - `eu` or `us`.
 * @param {string} options.username - E-mail of the Bestway Smart Hub account.
 * @param {string} options.password - Password.
 * @param {string} [options.baseUrl] - Overrides the region URL (tests).
 * @param {Function} [options.fetch] - fetch implementation (tests).
 * @param {number} [options.timeoutMs] - Timeout of one request.
 * @returns {object} The client.
 */
export function createGizwitsClient({ region, username, password, baseUrl, fetch, timeoutMs }) {
  const root = baseUrl ?? GIZWITS_REGIONS[region] ?? GIZWITS_REGIONS.eu;
  let session = null; // { token, uid, expiresAt }

  const call = async (method, path, body, what) => {
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Gizwits-Application-Id': APP_ID,
      ...(session ? { 'X-Gizwits-User-token': session.token } : {}),
    };
    const { status, json } = await requestJson(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      fetch,
      timeoutMs,
    });
    if (status >= 200 && status < 300 && json && typeof json === 'object') {
      return json;
    }
    throw errorOf(status, json, what);
  };

  return {
    generation: 'v1',

    /** @returns {object|null} `{ token, uid, expiresAt }` (ms). */
    get session() {
      return session;
    },
    set session(value) {
      session = value?.token ? value : null;
    },

    /** Log in and keep the token. */
    async login() {
      session = null;
      const json = await call('POST', '/app/login', { username, password, lang: 'en' }, 'login');
      if (!json.token) {
        throw new CloudError('api', 'login: no token in the answer');
      }
      session = {
        token: String(json.token),
        uid: String(json.uid ?? ''),
        expiresAt: Number(json.expire_at) * 1000 || Date.now() + 7 * 24 * 3600 * 1000,
      };
      return session;
    },

    /** @returns {Promise<object[]>} The devices bound to the account. */
    async devices() {
      const json = await call(
        'GET',
        '/app/bindings?show_disabled=0&limit=100&skip=0',
        undefined,
        'bindings',
      );
      return (Array.isArray(json.devices) ? json.devices : [])
        .filter((raw) => raw && raw.did)
        .map((raw) => ({
          id: String(raw.did),
          name: String(raw.dev_alias || raw.product_name || raw.did),
          product: String(raw.product_name ?? ''),
          online: raw.is_online === undefined ? null : Boolean(raw.is_online),
          firmware: [raw.mcu_soft_version, raw.wifi_soft_version].filter(Boolean).join(' / '),
        }));
    },

    /**
     * @param {object} device - Entry of `devices()`.
     * @returns {Promise<{ updatedAt: number, attrs: object }|null>} Last report, null when the cloud has none.
     */
    async state(device) {
      const json = await call(
        'GET',
        `/app/devdata/${encodeURIComponent(device.id)}/latest`,
        undefined,
        'state',
      );
      // 0: nothing reported for months (a device unplugged long ago).
      if (!json.updated_at || !json.attr || typeof json.attr !== 'object') {
        return null;
      }
      return { updatedAt: Number(json.updated_at) * 1000, attrs: json.attr };
    },

    /**
     * @param {object} device - Entry of `devices()`.
     * @param {object} attrs - Wire attributes to write.
     */
    async command(device, attrs) {
      await call('POST', `/app/control/${encodeURIComponent(device.id)}`, { attrs }, 'command');
    },
  };
}
