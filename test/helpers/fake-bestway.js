// A fake Bestway cloud on a real local HTTP server: the V1 Gizwits API
// (`/app/login`, `/app/bindings`, `/app/devdata/{did}/latest`,
// `/app/control/{did}`) and the V2 SmartSpa gateway (`/app/smart_home/...`,
// `/app/device/shadow/...`, `/app/device/control/...`), with their quirks:
// Gizwits errors as HTTP 400 + error_code, SmartSpa answers HTTP 200 with a
// string `code`, Content-MD5 checked, a control `data` that is not a JSON
// string silently ignored, commands applied after a delay.
//
// Built from the behaviour documented by cdpuk/ha-bestway (MIT) and checked
// against the live clouds with a wrong account (2026-10-21). Nothing starts on
// import: `node --test` also loads this file.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export const V1_APP_ID = '98754e684ec045528b073876c34c7348';
export const V2_APP_ID = '39ef26ff404a4cb1b5652f336d4bc045';

/** A V1 Hydrojet Pro spa, heating. */
export const v1Spa = (overrides = {}) => ({
  did: 'rX9kQ2aBcD3eF4gH',
  product_name: 'Hydrojet_Pro',
  dev_alias: 'Lay-Z-Spa Maldives',
  is_online: true,
  protoc: 1,
  mcu_soft_version: 'MCU 2.1',
  mcu_hard_version: '1',
  wifi_soft_version: '04020025',
  wifi_hard_version: '1',
  attr: {
    power: 1,
    filter: 2,
    heat: 3,
    wave: 0,
    jet: 0,
    Tnow: 31,
    Tset: 38,
    Tunit: 1,
    E01: 0,
    E02: 0,
    E32: 0,
    error: 0,
  },
  ...overrides,
});

/** A V2 Airjet spa (Bestway Connect), idle. */
export const v2Spa = (overrides = {}) => ({
  sno: '11247711082452855093',
  productKey: 'FTEW0E',
  mac: '6879C4D585AB',
  name: 'Hollywood AirJet',
  roomId: 3234,
  did: '11247711082452855093',
  onlineStatus: 1,
  shadow: {
    water_temperature: 34,
    temperature_setting: 37,
    temperature_unit: 1,
    power_state: 1,
    heater_state: 0,
    filter_state: 2,
    wave_state: 0,
    hydrojet_state: 0,
    locked: 0,
    ConnectType: 'online',
    error_code: 0,
    warning: 0,
  },
  ...overrides,
});

const md5 = (body) => createHash('md5').update(body).digest('base64');

export class FakeBestway {
  /**
   * @param {object} [options] - Options.
   * @param {object} [options.v1] - `{ username, password, devices }`.
   * @param {object} [options.v2] - `{ username, password, devices }`.
   * @param {number} [options.applyAfterMs] - Delay before a command shows in the state.
   */
  constructor({ v1, v2, applyAfterMs = 0 } = {}) {
    this.v1 = { username: 'v1@example.com', password: 'secret-v1', devices: [v1Spa()], ...v1 };
    this.v2 = { username: 'v2@example.com', password: 'secret-v2', devices: [v2Spa()], ...v2 };
    this.applyAfterMs = applyAfterMs;
    this.logins = { v1: 0, v2: 0 };
    this.commands = []; // { generation, id, attrs }
    this.ignored = []; // V2 controls whose data was not a JSON string
    this.requests = [];
    this.v1Tokens = new Set();
    this.v2Tokens = new Set();
    this.down = false;
    this.server = createServer((request, response) => this.handle(request, response));
  }

  /** @returns {Promise<FakeBestway>} Listening on 127.0.0.1. */
  listen() {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => resolve(this));
    });
  }

  get url() {
    return `http://127.0.0.1:${this.server.address().port}`;
  }

  get baseUrls() {
    return { v1: this.url, v2: this.url };
  }

  close() {
    this.server.closeAllConnections?.();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** Invalidate every token (the cloud logged everybody out). */
  expireTokens() {
    this.v1Tokens.clear();
    this.v2Tokens.clear();
  }

  later(task) {
    if (this.applyAfterMs > 0) {
      setTimeout(task, this.applyAfterMs).unref?.();
    } else {
      task();
    }
  }

  async handle(request, response) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();
    const url = new URL(request.url, 'http://x');
    this.requests.push({
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body,
    });
    const send = (status, json) => {
      // Like the real clouds: JSON with a wrong content type.
      response.writeHead(status, { 'Content-Type': 'text/html;charset=utf-8' });
      response.end(JSON.stringify(json));
    };
    if (this.down) {
      send(502, { error: 'bad gateway' });
      return;
    }
    if (url.pathname.startsWith('/app/smart_home/') || url.pathname.startsWith('/app/device/')) {
      this.v2Route(request, url, body, send);
    } else {
      this.v1Route(request, url, body, send);
    }
  }

  v1Route(request, url, body, send) {
    if (request.headers['x-gizwits-application-id'] !== V1_APP_ID) {
      send(400, { error_code: 9003, error_message: 'appid invalid!' });
      return;
    }
    if (url.pathname === '/app/login' && request.method === 'POST') {
      const { username, password } = JSON.parse(body || '{}');
      if (username !== this.v1.username) {
        send(400, {
          error_code: 9005,
          error_message: 'user does not exist!',
          detail_message: null,
        });
        return;
      }
      if (password !== this.v1.password) {
        send(400, { error_code: 9020, error_message: 'username or password error!' });
        return;
      }
      this.logins.v1 += 1;
      const token = `v1-token-${this.logins.v1}`;
      this.v1Tokens.add(token);
      send(200, { uid: 'uid-1', token, expire_at: Math.floor(Date.now() / 1000) + 7 * 86400 });
      return;
    }
    if (!this.v1Tokens.has(request.headers['x-gizwits-user-token'])) {
      send(400, { error_code: 9004, error_message: 'token invalid!', detail_message: null });
      return;
    }
    if (url.pathname === '/app/bindings') {
      send(200, {
        devices: this.v1.devices.map(({ attr, ...device }) => {
          void attr;
          return device;
        }),
      });
      return;
    }
    const latest = url.pathname.match(/^\/app\/devdata\/([^/]+)\/latest$/);
    if (latest) {
      const device = this.v1.devices.find((item) => item.did === latest[1]);
      if (!device) {
        send(400, { error_code: 9014, error_message: 'device not found' });
        return;
      }
      send(200, { did: device.did, updated_at: Math.floor(Date.now() / 1000), attr: device.attr });
      return;
    }
    const control = url.pathname.match(/^\/app\/control\/([^/]+)$/);
    if (control && request.method === 'POST') {
      const device = this.v1.devices.find((item) => item.did === control[1]);
      if (!device?.is_online) {
        send(400, { error_code: 9042, error_message: 'device offline' });
        return;
      }
      const { attrs } = JSON.parse(body || '{}');
      this.commands.push({ generation: 'v1', id: device.did, attrs });
      this.later(() => Object.assign(device.attr, attrs));
      send(200, {});
      return;
    }
    send(404, { error_code: 9999, error_message: 'not found' });
  }

  v2Route(request, url, body, send) {
    if (request.headers['x-gizwits-application-id'] !== V2_APP_ID) {
      send(200, { code: '9003', message: 'appid invalid', data: null, error: true });
      return;
    }
    if (body && request.headers['content-md5'] !== md5(body)) {
      send(200, { code: '400', message: 'Content-MD5 mismatch', data: null, error: true });
      return;
    }
    if (url.pathname === '/app/smart_home/login/pwd') {
      const { data } = JSON.parse(body || '{}');
      if (data?.account !== this.v2.username) {
        send(200, {
          code: '1000000',
          message: '用户不存在',
          data: null,
          display: null,
          error: true,
        });
        return;
      }
      if (data.password !== this.v2.password) {
        send(200, { code: '1000001', message: '密码错误', data: null, display: null, error: true });
        return;
      }
      this.logins.v2 += 1;
      const token = `v2-token-${this.logins.v2}`;
      this.v2Tokens.add(token);
      send(200, { code: '200', message: 'success', data: { userToken: token }, error: false });
      return;
    }
    if (!this.v2Tokens.has(request.headers.authorization)) {
      send(200, { code: '505', message: '未登录', data: null, display: null, error: true });
      return;
    }
    if (url.pathname === '/app/smart_home/users/devices') {
      send(200, {
        code: '200',
        data: this.v2.devices.map(({ shadow, ...device }) => {
          void shadow;
          return device;
        }),
      });
      return;
    }
    const route = url.pathname.match(/^\/app\/device\/(shadow|control)\/([^/]+)\/([^/]+)$/);
    const device =
      route &&
      this.v2.devices.find(
        (item) => item.productKey === route[2] && item.mac.toLowerCase() === route[3],
      );
    if (!device) {
      send(200, { code: '404', message: 'device not found', data: null, error: true });
      return;
    }
    if (route[1] === 'shadow') {
      send(200, { code: '200', data: { ...device.shadow }, error: false });
      return;
    }
    const { data } = JSON.parse(body || '{}');
    if (typeof data !== 'string') {
      // The real gateway: "200", data true, nothing done.
      this.ignored.push(data);
      send(200, { code: '200', data: true, error: false });
      return;
    }
    const datapoints = JSON.parse(data);
    this.commands.push({ generation: 'v2', id: device.mac.toLowerCase(), attrs: datapoints });
    this.later(() => {
      for (const [key, value] of Object.entries(datapoints)) {
        // Filter and heater read back 2 while running.
        device.shadow[key] =
          (key === 'filter_state' || key === 'heater_state') && value === 1 ? 2 : value;
      }
    });
    send(200, { code: '200', data: true, error: false });
  }
}
