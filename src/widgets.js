// -----------------------------------------------------------------------------
// Dashboard widgets (setting `device`: which spa, the first one when empty).
//
//   spa       the water now and its target, what the heater does, when the
//             water is ready, filter pump, bubbles, jets, errors; buttons:
//             heater on / off, bubbles on / off, target -1 / +1 °C
//   history   the curves of the water temperature and the target (a day,
//             three days or a week, from the Gladys history), and how fast
//             the spa heats
//
// Pure: the build functions turn a view into a content, so the tests and
// docs/illustrations/gen.mjs use the exact code Gladys gets. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { t, truncate } from './i18n.js';

export const WIDGETS = { SPA: 'spa', HISTORY: 'history' };
export const WIDGET_ACTIONS = {
  HEATER_ON: 'heater_on',
  HEATER_OFF: 'heater_off',
  BUBBLES_ON: 'bubbles_on',
  BUBBLES_OFF: 'bubbles_off',
  TARGET_DOWN: 'target_down',
  TARGET_UP: 'target_up',
};
export const HISTORY_PERIODS = ['last-day', 'last-three-days', 'last-week'];
const TTL = { spa: 60, history: 300 };

/**
 * @typedef {object} SpaView
 * @property {string} name - Name of the spa.
 * @property {string} device - External id of the Gladys device (button params).
 * @property {boolean} reachable - The last reading worked.
 * @property {object|null} state - State (src/bestway/model.js).
 * @property {object} caps - Capabilities.
 * @property {{ minutes: number, at: number }|null} ready - Estimate.
 * @property {number|null} rate - °C per hour.
 * @property {object} features - Feature external ids of the created device: `{ temperature, target }`.
 * @property {string} [timeZone] - Time zone of the clock times.
 */

const empty = (key, message) => ({
  version: 1,
  ttl_seconds: TTL[key],
  components: [{ type: 'text', text: t(message), variant: 'caption' }],
});

const heading = (view) => ({ type: 'text', text: truncate(view.name, 40), variant: 'heading' });

const tile = (label, value, unit, color) =>
  value === null || value === undefined
    ? null
    : {
        type: 'value',
        label: t(label),
        value: Math.round(value * 10) / 10,
        ...(unit ? { unit } : {}),
        ...(color ? { color } : {}),
      };

const offlineItem = () => ({ label: t('widgetSpa'), value: t('widgetOffline'), color: 'danger' });

/**
 * @description `HH:MM` of a time, in each language.
 * @param {number} at - ms.
 * @param {string} [timeZone] - Time zone.
 * @returns {object} `{ en, fr, de, es }`.
 */
export const clock = (at, timeZone = process.env.TZ || 'UTC') => {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(at));
  return { en: hhmm, fr: hhmm.replace(':', ' h '), de: hhmm, es: hhmm };
};

/**
 * @description The heater, as one status item.
 * @param {object} state - State.
 * @param {object|null} ready - Estimate.
 * @param {string} [timeZone] - Time zone.
 * @returns {object|null} The item.
 */
function heaterItem(state, ready, timeZone) {
  if (state.heaterOn === null) {
    return null;
  }
  if (!state.heaterOn) {
    return { label: t('widgetHeater'), value: t('heater_off'), color: 'neutral' };
  }
  if (state.targetReached) {
    return { label: t('widgetHeater'), value: t('heater_target_reached'), color: 'success' };
  }
  if (state.heating && ready) {
    return {
      label: t('widgetHeater'),
      value: t('widgetReadyAt', { time: clock(ready.at, timeZone) }),
      color: 'warning',
    };
  }
  return {
    label: t('widgetHeater'),
    value: t(state.heating ? 'heater_heating' : 'heater_on'),
    color: state.heating ? 'warning' : 'info',
  };
}

const onOffItem = (label, value) =>
  value === null || value === undefined
    ? null
    : {
        label: t(label),
        value: t(value ? 'widgetOn' : 'widgetOff'),
        color: value ? 'primary' : 'neutral',
      };

/**
 * @description The `spa` widget.
 * @param {SpaView|null} view - Spa, null when none.
 * @returns {object} The widget content.
 */
export function buildSpaWidget(view) {
  if (!view?.state) {
    return empty(WIDGETS.SPA, 'widgetNoSpa');
  }
  const { state, caps } = view;
  const components = [heading(view)];

  if (caps.kind === 'pool_filter') {
    const poolItems = [
      view.reachable ? onOffItem('widgetPower', state.power) : offlineItem(),
      state.filterChange === null
        ? null
        : {
            label: t('widgetCartridge'),
            value: t(state.filterChange ? 'cartridge_change' : 'cartridge_ok'),
            color: state.filterChange ? 'warning' : 'success',
          },
      state.errors.length > 0
        ? { label: t('widgetErrors'), value: state.errors.join(', '), color: 'danger' }
        : null,
    ].filter(Boolean);
    components.push(...[tile('widgetTimer', state.timerHours, 'h', 'primary')].filter(Boolean));
    // Gladys drops a status without items.
    if (poolItems.length > 0) {
      components.push({ type: 'status', items: poolItems });
    }
    return { version: 1, ttl_seconds: TTL.spa, components };
  }

  components.push(
    ...[
      tile('widgetWater', state.temperature, '°C', 'primary'),
      tile('widgetTarget', state.target, '°C'),
    ].filter(Boolean),
  );

  const items = view.reachable
    ? [
        heaterItem(state, view.ready, view.timeZone),
        state.power === false
          ? onOffItem('widgetPower', false)
          : onOffItem('widgetFilter', state.filter),
        caps.bubbles === 'none' || state.bubbles === null
          ? null
          : {
              label: t('widgetBubbles'),
              value: t(
                caps.bubbles === 'levels'
                  ? `bubbles_${state.bubbles}`
                  : state.bubbles === 'off'
                    ? 'widgetOff'
                    : 'widgetOn',
              ),
              color: state.bubbles === 'off' ? 'neutral' : 'primary',
            },
        caps.jets ? onOffItem('widgetJets', state.jets) : null,
        state.errors.length > 0
          ? { label: t('widgetErrors'), value: state.errors.join(', '), color: 'danger' }
          : null,
      ].filter(Boolean)
    : [offlineItem()];
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }

  if (view.reachable) {
    const button = (label, icon, key, style = 'secondary') => ({
      type: 'button',
      label: t(label),
      icon,
      style,
      action: { key, params: { device: view.device } },
    });
    components.push(
      state.heaterOn
        ? button('widgetHeaterOff', 'power', WIDGET_ACTIONS.HEATER_OFF)
        : button('widgetHeaterOn', 'thermometer', WIDGET_ACTIONS.HEATER_ON, 'primary'),
    );
    if (caps.bubbles !== 'none') {
      components.push(
        state.bubbles && state.bubbles !== 'off'
          ? button('widgetBubblesOff', 'wind', WIDGET_ACTIONS.BUBBLES_OFF)
          : button('widgetBubblesOn', 'wind', WIDGET_ACTIONS.BUBBLES_ON),
      );
    }
    if (state.target !== null) {
      components.push(
        button('widgetTargetDown', 'minus', WIDGET_ACTIONS.TARGET_DOWN),
        button('widgetTargetUp', 'plus', WIDGET_ACTIONS.TARGET_UP),
      );
    }
  }
  return { version: 1, ttl_seconds: TTL.spa, components: components.slice(0, 8) };
}

/**
 * @description The `history` widget.
 * @param {SpaView|null} view - Spa.
 * @param {string} [period] - One of HISTORY_PERIODS.
 * @returns {object} The widget content.
 */
export function buildHistoryWidget(view, period = HISTORY_PERIODS[0]) {
  if (!view?.state || view.caps.kind === 'pool_filter') {
    return empty(WIDGETS.HISTORY, 'widgetNoSpa');
  }
  const features = [view.features.temperature, view.features.target].filter(Boolean);
  if (features.length === 0) {
    return {
      version: 1,
      ttl_seconds: TTL.history,
      components: [heading(view), { type: 'text', text: t('widgetAddDevice'), variant: 'caption' }],
    };
  }
  const components = [
    heading(view),
    {
      type: 'chart',
      title: t('widgetTemperatures'),
      chart_type: 'line',
      device_features: features,
      interval: HISTORY_PERIODS.includes(period) ? period : HISTORY_PERIODS[0],
    },
  ];
  const rate = tile('widgetRate', view.rate, '°C/h', 'warning');
  if (rate) {
    components.push(rate);
  }
  components.push({
    type: 'text',
    text: view.rate ? t('widgetRateNote') : t('widgetRateUnknown'),
    variant: 'caption',
  });
  if (!view.reachable) {
    components.push({ type: 'status', items: [offlineItem()] });
  }
  return { version: 1, ttl_seconds: TTL.history, components };
}
