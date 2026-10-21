// -----------------------------------------------------------------------------
// Scene triggers and actions (manifest `scene_triggers`, `scene_actions`).
//
// Triggers: one event per transition seen between two readings, never a
// snapshot, never fired by a scene action or a command.
//
//   target_reached    the heater reports the water at its target
//   error_occurred    the device reports a new error code
//   device_offline    no answer, or reported offline, for 5 minutes
//   device_online     it answers again (after an offline event only)
//
// Actions:
//
//   read_values       a fresh reading: temperatures, heater, estimate of
//                     when the water is ready, errors
//   heat_to           heat the water to a temperature: target set, heater
//                     (with power and filter pump) switched on
// -----------------------------------------------------------------------------

export const SCENE_TRIGGERS = {
  TARGET_REACHED: 'target_reached',
  ERROR_OCCURRED: 'error_occurred',
  DEVICE_OFFLINE: 'device_offline',
  DEVICE_ONLINE: 'device_online',
};

// The data keys of each event, as declared in the manifest (fields and variables).
export const SCENE_TRIGGER_DATA = {
  [SCENE_TRIGGERS.TARGET_REACHED]: ['device', 'device_name', 'temperature'],
  [SCENE_TRIGGERS.ERROR_OCCURRED]: ['device', 'device_name', 'error_code', 'errors'],
  [SCENE_TRIGGERS.DEVICE_OFFLINE]: ['device', 'device_name'],
  [SCENE_TRIGGERS.DEVICE_ONLINE]: ['device', 'device_name'],
};

export const SCENE_ACTIONS = { READ_VALUES: 'read_values', HEAT_TO: 'heat_to' };

// The outputs each action returns, as declared in the manifest.
export const SCENE_ACTION_OUTPUTS = {
  [SCENE_ACTIONS.READ_VALUES]: [
    'water_temperature',
    'target_temperature',
    'heater',
    'heater_text',
    'minutes_to_target',
    'ready_at',
    'errors',
  ],
  [SCENE_ACTIONS.HEAT_TO]: [
    'target_temperature',
    'water_temperature',
    'minutes_to_target',
    'ready_at',
  ],
};
