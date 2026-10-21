// -----------------------------------------------------------------------------
// One HTTP request to a Bestway cloud, with a timeout and one retry when the
// connection itself fails (the load balancers of both clouds sometimes leave a
// connection hanging: the next attempt reaches another address).
//
// Both clouds answer JSON, often with a wrong content type (`text/html`): the
// body is parsed whatever the header says.
// -----------------------------------------------------------------------------

export class CloudError extends Error {
  /**
   * @param {string} kind - `network`, `http`, `auth`, `credentials`, `offline`, `api`.
   * @param {string} message - Technical message (English, for the logs).
   * @param {object} [extra] - `{ status, code }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CloudError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/**
 * @description Send a request and parse the JSON answer.
 * @param {string} url - Full URL.
 * @param {object} [options] - Options.
 * @param {string} [options.method] - HTTP method.
 * @param {object} [options.headers] - Headers.
 * @param {string} [options.body] - Body, already serialized.
 * @param {number} [options.timeoutMs] - Timeout of one attempt.
 * @param {Function} [options.fetch] - fetch implementation (tests).
 * @returns {Promise<{ status: number, json: object|null }>} The answer.
 */
export async function requestJson(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 20000, fetch = globalThis.fetch } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    const raw = await response.text().catch(() => '');
    let json;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }
  const reason = lastError?.cause?.code ?? lastError?.name ?? lastError?.message ?? 'error';
  throw new CloudError('network', `${new URL(url).host} unreachable (${reason})`);
}
