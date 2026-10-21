// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
//
// Two optional accounts, one per app: V1 "Bestway Smart Hub" (Gizwits cloud,
// Europe or United States) and V2 "Bestway Connect" (SmartSpa gateway,
// Europe, United States or China). An account counts once its e-mail and
// password are both filled in.
// -----------------------------------------------------------------------------

import { GIZWITS_REGIONS } from './bestway/gizwits.js';
import { SMARTSPA_REGIONS } from './bestway/smartspa.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
// The app itself reads every 30 s; slower is kinder to the clouds.
export const POLL_INTERVALS = [30, 60, 120, 300];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  v1_email: '',
  v1_password: '',
  v1_region: 'eu',
  v2_email: '',
  v2_password: '',
  v2_region: 'eu',
  poll_interval: '60',
  language: 'en',
};

const textOf = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ accounts: object[], pollMs: number, language: string }} The configuration.
 */
export function normalizeConfig(raw = {}) {
  const accounts = [];
  const v1 = { username: textOf(raw.v1_email), password: String(raw.v1_password ?? '') };
  if (v1.username && v1.password) {
    const region = Object.hasOwn(GIZWITS_REGIONS, raw.v1_region)
      ? raw.v1_region
      : DEFAULTS.v1_region;
    accounts.push({ generation: 'v1', region, ...v1 });
  }
  const v2 = { username: textOf(raw.v2_email), password: String(raw.v2_password ?? '') };
  if (v2.username && v2.password) {
    const region = Object.hasOwn(SMARTSPA_REGIONS, raw.v2_region)
      ? raw.v2_region
      : DEFAULTS.v2_region;
    accounts.push({ generation: 'v2', region, ...v2 });
  }
  const interval = Number(raw.poll_interval ?? DEFAULTS.poll_interval);
  return {
    accounts,
    pollMs: (POLL_INTERVALS.includes(interval) ? interval : Number(DEFAULTS.poll_interval)) * 1000,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
  };
}
