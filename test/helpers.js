// Test helpers: a clock, a silent logger, waiting, and a fake Bestway cloud on
// a real local HTTP server (test/helpers/fake-bestway.js) that the integration
// reaches through its real code. Nothing leaves 127.0.0.1.

import { FakeBestway, v1Spa, v2Spa } from './helpers/fake-bestway.js';

export { FakeBestway, v1Spa, v2Spa };

export function fakeClock(start = Date.parse('2026-10-21T16:00:00Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * @description Wait until a condition holds (real sockets take a few ms).
 * @param {Function} condition - `() => boolean`.
 * @param {number} [timeoutMs] - Give up after.
 * @returns {Promise<void>} Resolves when true, rejects on timeout.
 */
export async function until(condition, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > end) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * @description A started fake cloud.
 * @param {object} [options] - FakeBestway options.
 * @returns {Promise<FakeBestway>} Listening.
 */
export const startFake = (options) => new FakeBestway(options).listen();

/** The configuration of both accounts of the fake cloud. */
export const ACCOUNTS = {
  v1_email: 'v1@example.com',
  v1_password: 'secret-v1',
  v1_region: 'eu',
  v2_email: 'v2@example.com',
  v2_password: 'secret-v2',
  v2_region: 'eu',
};
