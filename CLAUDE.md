# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Bestway Wi-Fi spas**
(Lay-Z-Spa, SaluSpa) and the Flowclear Smart Touch pool filter pump. A Node.js
service (Node 22+, ESM, no build step; only dependency: the SDK) in its own
sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the devices **through the Bestway clouds only** (`transports: ["cloud"]`):

- V1, app "Bestway Smart Hub": the Gizwits cloud (`euapi` / `usapi.gizwits.com`);
- V2, app "Bestway Connect": the SmartSpa gateway (`smart-spa-{eu,us,cn}-app.bestwaycorp.com`).

A **device integration** (`type: "device"`, Gladys 5.1.0+: widgets and
scenes). The clients in `src/bestway/` were written from what
[cdpuk/ha-bestway](https://github.com/cdpuk/ha-bestway) and
[TA2k/ioBroker.bestway](https://github.com/TA2k/ioBroker.bestway) (MIT)
documented: no code copied (see NOTICE).

## Commands

```bash
npm install
npm test                                  # node --test, never leaves 127.0.0.1
node --test test/app.test.js              # one file
node --test --test-name-pattern "heat_to" # tests whose name matches
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/discovery.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check
node scripts/fake-cloud.mjs 8080          # the fake cloud of the tests, on its own
docs/illustrations/render.sh              # widget illustrations (Chrome, ImageMagick, Pillow)
scripts/build-cover.sh                    # cover.jpg from cover.svg (Inkscape, ImageMagick)
```

## Architecture

```
index.js                  SDK wiring only: createApp(gladys) + connect + start
src/app.js                every handler: discovery, readings, commands, scene events and actions, widgets, status
src/hub.js                the accounts (sessions in /data, login pause) and their devices; commands held until reported
src/bestway/http.js       one HTTPS request, timeout, one retry on a connection failure
src/bestway/gizwits.js    V1 client (Smart Hub app)
src/bestway/smartspa.js   V2 client (Bestway Connect app)
src/bestway/model.js      families, capabilities, wire attributes <-> plain state (°C), command encoding
src/devices.js            a Bestway device -> one Gladys device (spa or pool_filter), values
src/history.js            water temperature samples (12 h), heating speed, time ready
src/states.js             state publication: created devices only, coalesced, 240/min, 429 pause
src/scenes.js             scene trigger / action keys, event data, outputs
src/widgets.js            the spa and history widgets (pure, reused by docs/illustrations)
src/i18n.js               runtime texts in en / fr / de / es
src/storage.js            JSON files in /data (sessions.json, history.json)
src/config.js             config_schema -> { accounts, pollMs, language }
test/helpers/             the fake cloud (a real HTTP server with both APIs and their quirks)
.github/scripts/release.mjs  version, changelog, version files, PR title checks
```

## Rules

- **External ids are forever**: `ext:{selector}:{spa|pool_filter}:{v1|v2}-{cloud id}`
  (V1: the Gizwits `did`, V2: the MAC address, lower case, hex only), features
  `…:<key>`. Config, action, field, widget, trigger, variable, output keys,
  the family names (`BESTWAY_FAMILY` param) and the bubbles values
  (`off`, `medium`, `max`) too.
- **Logins are precious**: the clouds rate-limit them. Never log in when a
  saved session is valid; a refused login pauses the account (15 min, doubled,
  6 h at most). Never log the password or the token.
- **Wire vocabularies live in `src/bestway/model.js` only**: everything after
  it is a plain state in °C. A new model = a family, its capabilities, its
  read and its write, with tests.
- **A command is not proof**: the V2 gateway answers "200" to anything. The
  expected state is held 45 s (`HOLD_MS`) and a reading 15 s later checks it.
- **Feature fields** compared by the Discover "Update" (category, type, unit,
  min, max, step, features added or removed): the baseline pins them.
- **Scene events**: one per transition seen between two readings; never fired
  by a command or a scene action.
- **The container rootfs is read-only**: the only writable folder is /data.
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images. Budget: 2 texts, 1 focal, 6 tiles, 1 status, 4
  buttons. Captions 80 characters at most.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`. `test/i18n.test.js` checks it.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, `package-lock.json` or the manifest, nor the `docker_image`
  tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English.

## Pitfalls

- V1: errors come as HTTP 400 `{ error_code }`: 9004 token, 9005 unknown user,
  9020 wrong password, 9042 device offline. JSON is often served as
  `text/html`. `updated_at: 0` means no report for months.
- V1 vocabularies: the "Airjet" product has its own field names
  (`heat_power`, `temp_set_unit: "摄氏"`); the others share `heat` (0 off,
  4 target reached, else heating), `filter` (write 2), `wave` (medium reads
  40-43 or 50-51), `Tunit` (0 = °F). `E32` is a status, not an error.
- V2: answers are HTTP 200 with a string `code`: "505" not logged in (log in
  again once), "1000000" unknown user. `Content-MD5` on bodied requests, token
  bare in `Authorization`. The control `data` must be a JSON **string**.
  `filter_state` / `heater_state` read back 2 while running; bubbles are on /
  off only; while the bubbles run the shadow may report the filter off.
- The old V2 pairing by sharing QR code (AWS IoT, `smarthub-eu.bestwaycorp.com`)
  stopped working with the app update of July 2026 (ha-bestway #135): not
  implemented.
- The load balancers sometimes leave a connection hanging: one retry
  (`src/bestway/http.js`).
- `node --test` also runs the files of `test/helpers/`: they must not start
  anything on import.
- A top-level `const SVG` in `docs/illustrations/render.js` shadows the global
  of ApexCharts (charts render empty): it is `SVG_NS`.
- Gladys does not send the user's language with a scan or a command: feature
  names, text states and scene errors use the `language` setting.
- Never tested with a real spa or account: when a user reports a difference,
  fix the fake cloud in `test/helpers/` first, then the code.
