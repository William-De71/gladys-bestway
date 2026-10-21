// -----------------------------------------------------------------------------
// A Bestway device -> one Gladys device.
//
//   spa           water temperature, heater (on / off, target, heating now),
//                 power, filter pump, bubbles (on / off, or off / medium /
//                 max on the V1 models that have levels), HydroJet jets,
//                 panel lock, errors (what the model has)
//   pool_filter   the Flowclear Smart Touch pump: power, filter timer,
//                 cartridge to change, errors
//
// External ids: `ext:{selector}:{spa|pool_filter}:{generation}-{cloud id}`
// (V1: the Gizwits device id, V2: the MAC address) and `…:{feature key}`.
// They are forever: never rename a type or a feature key.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import { BUBBLES_LEVELS, KINDS } from './bestway/model.js';
import { text } from './i18n.js';

export const DEVICE_TYPES = { SPA: KINDS.SPA, POOL_FILTER: KINDS.POOL_FILTER };

const readOnly = (category, type, unit, min, max, keepHistory = true) => ({
  category,
  type,
  ...(unit ? { unit } : {}),
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: keepHistory,
});

const writable = (category, type, unit, min, max, step) => ({
  category,
  type,
  ...(unit ? { unit } : {}),
  min,
  max,
  ...(step ? { step } : {}),
  read_only: false,
  has_feedback: true,
  keep_history: true,
});

const onOff = (category = CAT.SWITCH, type = TYPES.SWITCH.BINARY) =>
  writable(category, type, null, 0, 1);

const textFeature = () => readOnly(CAT.TEXT, TYPES.TEXT.TEXT, null, 0, 0, false);

const bubblesLevels = (language) => ({
  category: CAT.TEXT,
  type: TYPES.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
  supported_options: BUBBLES_LEVELS.map((value) => ({
    value,
    label: text(`bubbles_${value}`, language),
  })),
});

/**
 * @description The features of a device, from its capabilities.
 * @param {object} caps - src/bestway/model.js capabilities.
 * @param {string} language - Language of the select labels.
 * @returns {Array<[string, object]>} `[[key, feature]]`.
 */
export function featureSpecs(caps, language) {
  if (caps.kind === KINDS.POOL_FILTER) {
    return [
      ['power', onOff()],
      ['timer', readOnly(CAT.DURATION, TYPES.DURATION.DECIMAL, UNITS.HOURS, 0, 24)],
      ['cartridge', textFeature()],
      ['errors', textFeature()],
    ];
  }
  const specs = [
    ['temperature', readOnly(CAT.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.CELSIUS, 0, 60)],
    [
      'target',
      writable(CAT.WATER_HEATER, TYPES.WATER_HEATER.TARGET_TEMPERATURE, UNITS.CELSIUS, 20, 40, 0.5),
    ],
    ['heater', onOff(CAT.WATER_HEATER, TYPES.WATER_HEATER.BINARY)],
    ['heating', readOnly(CAT.WATER_HEATER, TYPES.WATER_HEATER.HEATING, null, 0, 1)],
    ['power', onOff()],
    ['filter', onOff()],
  ];
  if (caps.bubbles === 'switch') {
    specs.push(['bubbles', onOff()]);
  } else if (caps.bubbles === 'levels') {
    specs.push(['bubbles_level', bubblesLevels(language)]);
  }
  if (caps.jets) {
    specs.push(['jets', onOff()]);
  }
  if (caps.lock) {
    specs.push(['lock', onOff(CAT.CHILD_LOCK, TYPES.CHILD_LOCK.BINARY)]);
  }
  specs.push(['errors', textFeature()]);
  return specs;
}

/**
 * @description The default name of a device in Gladys: the name given in
 * the Bestway app, else "Spa" / "Pool filter pump".
 * @param {object} spa - Device of the hub.
 * @param {string} language - Language.
 * @returns {string} The name.
 */
export function defaultName(spa, language) {
  const name = String(spa.name ?? '').trim();
  return (
    name ||
    text(spa.caps.kind === KINDS.POOL_FILTER ? 'device_pool_filter' : 'device_spa', language)
  );
}

/**
 * @description The Gladys device of a Bestway device.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} spa - Device of the hub.
 * @param {string} language - Names language.
 * @param {boolean} [duplicate] - Another device has the same name: add the end of its id.
 * @returns {object} The device.
 */
export function buildDevice(gladys, spa, language, duplicate = false) {
  const ids = gladys.externalIds(spa.caps.kind, spa.id);
  const base = defaultName(spa, language);
  const name = duplicate ? `${base} ${spa.device.id.slice(-4)}` : base;
  return {
    name,
    external_id: ids.device,
    model: spa.device.product ? `Bestway ${spa.device.product}` : `Bestway ${spa.family}`,
    should_poll: false,
    features: featureSpecs(spa.caps, language).map(([key, feature]) => ({
      name: text(`feature_${key}`, language),
      external_id: ids.feature(key),
      ...feature,
    })),
    params: [
      { name: 'BESTWAY_GENERATION', value: spa.generation },
      { name: 'BESTWAY_FAMILY', value: spa.family },
      ...(spa.device.productKey
        ? [{ name: 'BESTWAY_PRODUCT_KEY', value: spa.device.productKey }]
        : []),
    ],
  };
}

const bit = (value) => (value === null || value === undefined ? null : value ? 1 : 0);

/**
 * @description The errors as one line.
 * @param {object} state - State of the device.
 * @param {string} language - Language.
 * @returns {string} `E02, E05` or `None`.
 */
export function errorsText(state, language) {
  return state.errors.length > 0 ? state.errors.join(', ') : text('noError', language);
}

/**
 * @description Every value of a device, ready to publish.
 * @param {object} spa - Device of the hub, with a state.
 * @param {string} language - Language of the text features.
 * @returns {Array<[string, number|{text: string}]>} Values, nulls left out.
 */
export function deviceValues(spa, language) {
  const state = spa.state;
  if (!state) {
    return [];
  }
  let values;
  if (spa.caps.kind === KINDS.POOL_FILTER) {
    values = [
      ['power', bit(state.power)],
      ['timer', state.timerHours],
      [
        'cartridge',
        state.filterChange === null
          ? null
          : { text: text(state.filterChange ? 'cartridge_change' : 'cartridge_ok', language) },
      ],
      ['errors', { text: errorsText(state, language) }],
    ];
  } else {
    values = [
      ['temperature', state.temperature],
      ['target', state.target],
      ['heater', bit(state.heaterOn)],
      ['heating', bit(state.heating)],
      ['power', bit(state.power)],
      ['filter', bit(state.filter)],
      [
        'bubbles',
        spa.caps.bubbles === 'switch'
          ? bit(state.bubbles === null ? null : state.bubbles !== 'off')
          : null,
      ],
      [
        'bubbles_level',
        spa.caps.bubbles === 'levels' && state.bubbles ? { text: state.bubbles } : null,
      ],
      ['jets', spa.caps.jets ? bit(state.jets) : null],
      ['lock', spa.caps.lock ? bit(state.locked) : null],
      ['errors', { text: errorsText(state, language) }],
    ];
  }
  return values.filter(([, value]) => value !== null && value !== undefined);
}

// Feature key -> command of src/bestway/model.js.
export const COMMANDS = {
  target: 'target',
  heater: 'heater',
  power: 'power',
  filter: 'filter',
  bubbles: 'bubbles',
  bubbles_level: 'bubbles',
  jets: 'jets',
  lock: 'lock',
};
