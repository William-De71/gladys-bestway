// -----------------------------------------------------------------------------
// What a Bestway device is, what it can do, and the translation between its
// wire attributes and one plain state.
//
// Three wire vocabularies:
//
//   V1 "Airjet"    the oldest spas (field names `heat_power`, `wave_power`,
//                  `temp_now`, `temp_set_unit` "摄氏" for Celsius)
//   V1 others      Airjet_V01, UltraFit, Hydrojet, Hydrojet_Pro: `power`,
//                  `filter` (2 = on), `heat` (0 off, 4 target reached, else
//                  heating), `wave` (0 / about 40-51 / 100), `jet`, `Tnow`,
//                  `Tset`, `Tunit` (0 Fahrenheit, 1 Celsius), errors as
//                  `E01`... flags (`E32` is a status, not an error)
//   V2 shadow      `power_state`, `heater_state`, `filter_state` (both read
//                  back 2 while running), `wave_state`, `hydrojet_state`,
//                  `locked`, `water_temperature`, `temperature_setting`,
//                  `temperature_unit`, `error_code`
//
// Plus the Flowclear pool filter pump (V1 product "泳池过滤器"): `power`,
// `time` (hours of the filter timer), `filter` (the cartridge must be
// changed), `error`.
//
// Everything after this file is in °C: a spa set to Fahrenheit is converted
// both ways, commands are rounded to its whole degrees.
// -----------------------------------------------------------------------------

export const KINDS = { SPA: 'spa', POOL_FILTER: 'pool_filter' };

// Families: stored in the device params (BESTWAY_FAMILY), never renamed.
export const FAMILIES = {
  AIRJET: 'airjet',
  AIRJET_V01: 'airjet_v01',
  ULTRAFIT: 'ultrafit',
  HYDROJET: 'hydrojet',
  HYDROJET_PRO: 'hydrojet_pro',
  POOL_FILTER: 'pool_filter',
  V2_AIRJET: 'v2_airjet',
  V2_HYDROJET: 'v2_hydrojet',
};

const V1_PRODUCTS = {
  Airjet: FAMILIES.AIRJET,
  Airjet_V01: FAMILIES.AIRJET_V01,
  UltraFit: FAMILIES.ULTRAFIT,
  Hydrojet: FAMILIES.HYDROJET,
  Hydrojet_Pro: FAMILIES.HYDROJET_PRO,
  泳池过滤器: FAMILIES.POOL_FILTER, // "pool filter"
};

// V2 product keys seen on real accounts (the device list rarely names the model).
const V2_PRODUCT_KEYS = {
  F12D9Q: FAMILIES.V2_HYDROJET, // Lay-Z-Spa San Francisco HydroJet Pro
  FTEW0E: FAMILIES.V2_AIRJET, // Hollywood AirJet, UltraFit AirJet
};

export const BUBBLES_LEVELS = ['off', 'medium', 'max'];

// Bounds of the spas, in their own unit.
export const TARGET_BOUNDS = { C: [20, 40], F: [68, 104] };

/**
 * @description The family of a device from what the cloud says of it.
 * @param {string} generation - `v1` or `v2`.
 * @param {object} device - `{ product, productKey, name }`.
 * @returns {string|null} A FAMILIES value, null when unknown.
 */
export function familyOf(generation, device) {
  if (generation === 'v1') {
    return V1_PRODUCTS[device.product] ?? null;
  }
  const known = V2_PRODUCT_KEYS[device.productKey];
  if (known) {
    return known;
  }
  return /hydro\s*jet/i.test(`${device.product} ${device.name}`)
    ? FAMILIES.V2_HYDROJET
    : FAMILIES.V2_AIRJET;
}

/**
 * @description What a family can do.
 * @param {string} family - FAMILIES value.
 * @returns {{ kind: string, power: boolean, filter: boolean, heater: boolean, bubbles: 'none'|'switch'|'levels', jets: boolean, lock: boolean, timer: boolean }} Capabilities.
 */
export function capabilitiesOf(family) {
  const spa = {
    kind: KINDS.SPA,
    power: true,
    filter: true,
    heater: true,
    bubbles: 'levels',
    jets: false,
    lock: false,
    timer: false,
  };
  switch (family) {
    case FAMILIES.AIRJET:
      return { ...spa, bubbles: 'switch', lock: true };
    case FAMILIES.AIRJET_V01:
    case FAMILIES.ULTRAFIT:
      return spa;
    case FAMILIES.HYDROJET:
    case FAMILIES.HYDROJET_PRO:
      return { ...spa, jets: true };
    // The V2 gateway reads and writes the bubbles as on / off only.
    case FAMILIES.V2_AIRJET:
      return { ...spa, bubbles: 'switch', lock: true };
    case FAMILIES.V2_HYDROJET:
      return { ...spa, bubbles: 'switch', jets: true };
    case FAMILIES.POOL_FILTER:
      return {
        kind: KINDS.POOL_FILTER,
        power: true,
        filter: false,
        heater: false,
        bubbles: 'none',
        jets: false,
        lock: false,
        timer: true,
      };
    default:
      return null;
  }
}

const int = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return typeof value === 'boolean' ? Number(value) : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const flag = (value) => {
  const parsed = int(value);
  return parsed === null ? null : parsed !== 0;
};
const round1 = (value) => Math.round(value * 10) / 10;
export const toCelsius = (value, unit) =>
  value === null ? null : round1(unit === 'F' ? ((value - 32) * 5) / 9 : value);
export const fromCelsius = (value, unit) => Math.round(unit === 'F' ? (value * 9) / 5 + 32 : value);

const code = (value) => {
  const parsed = int(value);
  if (parsed !== null) {
    return parsed === 0 ? null : `E${String(parsed).padStart(2, '0')}`;
  }
  const textValue = String(value ?? '').trim();
  return textValue || null;
};

const levelOf = (family, wave) => {
  if (wave === null) {
    return null;
  }
  if (wave === 0) {
    return 'off';
  }
  if (wave >= 75) {
    return 'max';
  }
  // Medium reads 40, 41, 50 or 51 (Airjet V01), 40 to 43 (Hydrojet) depending on the firmware.
  return family === FAMILIES.AIRJET ||
    family === FAMILIES.V2_AIRJET ||
    family === FAMILIES.V2_HYDROJET
    ? 'max'
    : 'medium';
};

const heaterOf = (heat) => {
  if (heat === null) {
    return { heaterOn: null, heating: null, targetReached: null };
  }
  return { heaterOn: heat !== 0, heating: heat !== 0 && heat !== 4, targetReached: heat === 4 };
};

const empty = () => ({
  power: null,
  filter: null,
  heaterOn: null,
  heating: null,
  targetReached: null,
  temperature: null,
  target: null,
  unit: null,
  bubbles: null,
  jets: null,
  locked: null,
  errors: [],
  timerHours: null,
  filterChange: null,
});

/**
 * @description Wire attributes -> plain state.
 * @param {string} family - FAMILIES value.
 * @param {object} attrs - Attributes of the cloud (V1 `attr`, V2 shadow).
 * @returns {object} The state: `{ power, filter, heaterOn, heating, targetReached, temperature, target, unit, bubbles, jets, locked, errors, timerHours, filterChange }`, null when unknown.
 */
export function readState(family, attrs = {}) {
  const state = empty();
  const a = attrs ?? {};

  if (family === FAMILIES.POOL_FILTER) {
    state.power = flag(a.power);
    state.timerHours = int(a.time);
    state.filterChange = flag(a.filter);
    state.errors = flag(a.error) ? [code(a.error) ?? 'error'] : [];
    return state;
  }

  if (family === FAMILIES.AIRJET) {
    state.unit = a.temp_set_unit === undefined ? null : a.temp_set_unit === '摄氏' ? 'C' : 'F';
    const heat = flag(a.heat_power);
    Object.assign(state, {
      power: flag(a.power),
      filter: flag(a.filter_power),
      heaterOn: heat,
      heating: heat === null ? null : heat && !flag(a.heat_temp_reach),
      targetReached: heat === null ? null : Boolean(heat && flag(a.heat_temp_reach)),
      temperature: toCelsius(int(a.temp_now), state.unit ?? 'C'),
      target: toCelsius(int(a.temp_set), state.unit ?? 'C'),
      bubbles: flag(a.wave_power) === null ? null : flag(a.wave_power) ? 'max' : 'off',
      locked: flag(a.locked),
      errors: Object.keys(a)
        .filter((key) => (/^system_err\d+$/.test(key) || key === 'earth') && flag(a[key]))
        .sort(),
    });
    return state;
  }

  if (family === FAMILIES.V2_AIRJET || family === FAMILIES.V2_HYDROJET) {
    const tunit = int(a.temperature_unit);
    state.unit = tunit === null ? null : tunit === 0 ? 'F' : 'C';
    const wave = int(a.wave_state);
    Object.assign(state, {
      power: flag(a.power_state),
      filter: flag(a.filter_state),
      ...heaterOf(int(a.heater_state)),
      temperature: toCelsius(int(a.water_temperature), state.unit ?? 'C'),
      target: toCelsius(int(a.temperature_setting), state.unit ?? 'C'),
      bubbles: levelOf(family, wave),
      jets: flag(a.hydrojet_state),
      locked: flag(a.locked),
      errors: [code(a.error_code)].filter(Boolean),
    });
    return state;
  }

  // V1 normalized vocabulary.
  const tunit = int(a.Tunit);
  state.unit = tunit === null ? null : tunit === 0 ? 'F' : 'C';
  const errors = Object.keys(a)
    .filter((key) => /^E\d{2}$/.test(key) && key !== 'E32' && flag(a[key]))
    .sort();
  if (flag(a.error)) {
    const extra = code(a.error);
    if (extra && !errors.includes(extra)) {
      errors.push(extra);
    }
  }
  Object.assign(state, {
    power: flag(a.power),
    filter: flag(a.filter),
    ...heaterOf(int(a.heat)),
    temperature: toCelsius(int(a.Tnow), state.unit ?? 'C'),
    target: toCelsius(int(a.Tset), state.unit ?? 'C'),
    bubbles: levelOf(family, int(a.wave)),
    jets: flag(a.jet),
    locked: flag(a.locked),
    errors,
  });
  return state;
}

const bit = (on) => (on ? 1 : 0);
const MEDIUM_WRITE = { [FAMILIES.HYDROJET]: 40, [FAMILIES.HYDROJET_PRO]: 40 };

/**
 * @description A command -> the wire attributes to send, and what the state
 * becomes at once (the clouds take 5 to 30 s to report it, and the spa
 * switches the linked functions itself: heating needs the filter pump...).
 * @param {string} family - FAMILIES value.
 * @param {string} key - `power`, `filter`, `heater`, `target`, `bubbles`, `jets`, `lock`.
 * @param {boolean|number|string} value - On / off, a °C target, a bubbles level.
 * @param {object} state - Current state (unit of the target).
 * @returns {{ wire: object, expected: object }} Throws RangeError when out of bounds or not supported.
 */
export function encodeCommand(family, key, value, state = {}) {
  const caps = capabilitiesOf(family);
  const on = value === true || value === 1 || value === '1' || value === 'on';
  const expected = {};
  let wire;

  const supported =
    caps &&
    {
      power: caps.power,
      filter: caps.filter,
      heater: caps.heater,
      target: caps.heater,
      bubbles: caps.bubbles !== 'none',
      jets: caps.jets,
      lock: caps.lock,
    }[key];
  if (!supported) {
    throw new RangeError(`${key} is not available on this device`);
  }

  const v2 = family === FAMILIES.V2_AIRJET || family === FAMILIES.V2_HYDROJET;
  const raw = family === FAMILIES.AIRJET;

  switch (key) {
    case 'power':
      wire = v2 ? { power_state: bit(on) } : { power: bit(on) };
      expected.power = on;
      if (!on) {
        Object.assign(expected, {
          filter: false,
          heaterOn: false,
          heating: false,
          targetReached: false,
        });
        if (caps.bubbles !== 'none') {
          expected.bubbles = 'off';
        }
        if (caps.jets) {
          expected.jets = false;
        }
      }
      break;
    case 'filter':
      if (v2) {
        wire = { filter_state: bit(on) };
      } else if (raw) {
        wire = { filter_power: bit(on) };
      } else {
        wire = { filter: on ? 2 : 0 };
      }
      expected.filter = on;
      if (on) {
        expected.power = true;
      } else {
        Object.assign(expected, {
          heaterOn: false,
          heating: false,
          targetReached: false,
          bubbles: 'off',
        });
      }
      break;
    case 'heater':
      if (v2) {
        wire = { heater_state: bit(on) };
      } else if (raw) {
        wire = { heat_power: bit(on) };
      } else {
        wire = { heat: on ? 3 : 0 };
      }
      expected.heaterOn = on;
      if (on) {
        Object.assign(expected, { power: true, filter: true });
      } else {
        Object.assign(expected, { heating: false, targetReached: false });
      }
      break;
    case 'target': {
      const celsius = Number(value);
      const unit = state.unit === 'F' ? 'F' : 'C';
      const native = fromCelsius(celsius, unit);
      const [min, max] = TARGET_BOUNDS[unit];
      if (!Number.isFinite(celsius) || native < min || native > max) {
        throw new RangeError(`${value} °C`);
      }
      if (v2) {
        wire = { temperature_setting: native };
      } else if (raw) {
        wire = { temp_set: native };
      } else {
        wire = { Tset: native };
      }
      expected.target = toCelsius(native, unit);
      break;
    }
    case 'bubbles': {
      let level;
      if (caps.bubbles === 'switch') {
        level = on || value === 'medium' || value === 'max' ? 'max' : 'off';
      } else {
        level = BUBBLES_LEVELS.includes(value) ? value : on ? 'max' : 'off';
      }
      if (v2) {
        wire = { wave_state: bit(level !== 'off') };
      } else if (raw) {
        wire = { wave_power: bit(level !== 'off') };
      } else {
        wire = { wave: { off: 0, medium: MEDIUM_WRITE[family] ?? 50, max: 100 }[level] };
      }
      expected.bubbles = level;
      if (level !== 'off') {
        expected.power = true;
      }
      break;
    }
    case 'jets':
      wire = v2 ? { hydrojet_state: bit(on) } : { jet: bit(on) };
      expected.jets = on;
      if (on) {
        expected.power = true;
      }
      break;
    case 'lock':
      wire = { locked: bit(on) };
      expected.locked = on;
      break;
    default:
      throw new RangeError(key);
  }
  return { wire, expected };
}
