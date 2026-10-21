// -----------------------------------------------------------------------------
// The water temperature over time, and how fast the spa heats.
//
//   samples   one every 10 minutes at most (or when the temperature, the
//             target or the heater changes), 12 hours, kept in /data
//             (history.json) so a restart does not lose a heating stretch
//             (the curves of the widget come from the Gladys history)
//   rate      °C per hour, measured on the last heating stretch (at least
//             45 minutes and 1 °C: the spas report whole degrees), and
//             remembered: the next heating gets an estimate from the start
//   ready     when the water will reach the target at that rate
// -----------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const SAMPLE_EVERY_MS = 10 * MINUTE;
const KEEP_MS = 12 * HOUR;
const SAVE_EVERY_MS = 10 * MINUTE;
const MIN_STRETCH_MS = 45 * MINUTE;
const MIN_RISE = 1;
const WINDOW_MS = 4 * HOUR;
// Below or above this, the measure is not a heating curve (lid open, hose filling...).
const RATE_BOUNDS = [0.2, 4];
const FILE = 'history.json';

/**
 * @description Create the history.
 * @param {object} deps - Dependencies.
 * @param {object} deps.storage - src/storage.js storage.
 * @param {Function} [deps.now] - Clock (ms).
 * @returns {object} The history.
 */
export function createHistory({ storage, now = Date.now }) {
  let data = { samples: {}, rates: {} }; // samples: id -> [[at, temperature, target, heating]]
  let savedAt = 0;
  let dirty = false;

  const save = async (force = false) => {
    if (!dirty || (!force && now() - savedAt < SAVE_EVERY_MS)) {
      return;
    }
    savedAt = now();
    dirty = false;
    await storage.write(FILE, data);
  };

  /** Rate of the last heating stretch, null when too short. */
  const measure = (list) => {
    let end = list.length - 1;
    while (end >= 0 && !list[end][3]) {
      end -= 1;
    }
    if (end < 0) {
      return null;
    }
    let start = end;
    while (start > 0 && list[start - 1][3] && list[end][0] - list[start - 1][0] <= WINDOW_MS) {
      start -= 1;
    }
    const [t0, temp0] = list[start];
    const [t1, temp1] = list[end];
    if (t1 - t0 < MIN_STRETCH_MS || temp1 - temp0 < MIN_RISE) {
      return null;
    }
    const rate = (temp1 - temp0) / ((t1 - t0) / HOUR);
    return rate >= RATE_BOUNDS[0] && rate <= RATE_BOUNDS[1] ? Math.round(rate * 100) / 100 : null;
  };

  return {
    async load() {
      const saved = await storage.read(FILE);
      if (saved && typeof saved === 'object') {
        data = { samples: saved.samples ?? {}, rates: saved.rates ?? {} };
      }
    },

    /**
     * @description Record a reading.
     * @param {string} id - Device id.
     * @param {object} state - State (`temperature`, `target`, `heating`).
     */
    record(id, state) {
      if (state.temperature === null) {
        return;
      }
      const list = data.samples[id] ?? [];
      data.samples[id] = list;
      const sample = [now(), state.temperature, state.target, state.heating ? 1 : 0];
      const last = list[list.length - 1];
      const changed =
        !last || last[1] !== sample[1] || last[2] !== sample[2] || last[3] !== sample[3];
      if (last && !changed && now() - last[0] < SAMPLE_EVERY_MS) {
        return;
      }
      list.push(sample);
      while (list.length > 0 && now() - list[0][0] > KEEP_MS) {
        list.shift();
      }
      const rate = state.heating ? measure(list) : null;
      if (rate !== null) {
        data.rates[id] = rate;
      }
      dirty = true;
      save().catch(() => {});
    },

    /** @returns {Array} `[[at, temperature, target, heating]]` of a device since `since`. */
    samples(id, since = 0) {
      return (data.samples[id] ?? []).filter((sample) => sample[0] >= since);
    },

    /** @returns {number|null} °C per hour, the last one measured. */
    rate(id) {
      return data.rates[id] ?? null;
    },

    /**
     * @description When the water will be at the target.
     * @param {string} id - Device id.
     * @param {object} state - State.
     * @returns {{ minutes: number, at: number }|null} Null when not heating or no rate yet.
     */
    ready(id, state) {
      const rate = data.rates[id];
      if (!state?.heating || !rate || state.temperature === null || state.target === null) {
        return null;
      }
      const missing = state.target - state.temperature;
      if (missing <= 0) {
        return null;
      }
      const minutes = Math.ceil((missing / rate) * 60);
      return { minutes, at: now() + minutes * MINUTE };
    },

    forget(id) {
      delete data.samples[id];
      delete data.rates[id];
      dirty = true;
    },

    flush: () => save(true),
  };
}
