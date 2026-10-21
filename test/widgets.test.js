// The widget contents of every family, in every state, as the Gladys core
// receives them: valid, within the budget, and never a component the core
// would drop (a status without items is removed silently).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { capabilitiesOf, FAMILIES, readState } from '../src/bestway/model.js';
import { buildHistoryWidget, buildSpaWidget } from '../src/widgets.js';

const FULL = {
  power: 1,
  filter: 2,
  heat: 3,
  wave: 50,
  jet: 1,
  Tnow: 30,
  Tset: 38,
  Tunit: 1,
  E02: 1,
  power_state: 1,
  heater_state: 4,
  water_temperature: 38,
  temperature_setting: 38,
  temperature_unit: 1,
  time: 4,
  error: 1,
};

const views = function* () {
  for (const family of Object.values(FAMILIES)) {
    for (const attrs of [{}, FULL]) {
      for (const reachable of [true, false]) {
        yield {
          name: `Spa ${family}`,
          device: 'ext:test-integration:spa:v1-x',
          reachable,
          state: readState(family, attrs),
          caps: capabilitiesOf(family),
          ready: { minutes: 90, at: Date.parse('2026-10-21T18:30:00Z') },
          rate: 1.8,
          features: { temperature: 'ext:test-integration:spa:v1-x:temperature', target: null },
        };
      }
    }
  }
};

test('every family, every state: valid content, no empty status, the budget kept', () => {
  for (const view of views()) {
    for (const content of [buildSpaWidget(view), buildHistoryWidget(view, 'last-week')]) {
      const where = `${view.caps.kind}/${JSON.stringify(view.state.power)}/${view.reachable}`;
      assert.deepEqual(validateWidgetContent(content), [], where);
      assert.ok(content.components.length <= 8, where);
      for (const component of content.components) {
        if (component.type === 'status') {
          assert.ok(component.items.length > 0, `${where}: empty status`);
        }
      }
      const buttons = content.components.filter((component) => component.type === 'button');
      assert.equal(new Set(buttons.map((button) => button.action.key)).size, buttons.length, where);
    }
  }
});

test('no spa: a caption that says what to do', () => {
  for (const content of [buildSpaWidget(null), buildHistoryWidget(null)]) {
    assert.deepEqual(validateWidgetContent(content), []);
    assert.match(content.components[0].text.fr, /compte Bestway/);
  }
});
