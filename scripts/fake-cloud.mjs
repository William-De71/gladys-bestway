// The fake Bestway cloud of the tests, on its own (both APIs on one port):
//   node scripts/fake-cloud.mjs 8080
// Accounts: v1@example.com / secret-v1, v2@example.com / secret-v2.
import { FakeBestway } from '../test/helpers/fake-bestway.js';

const fake = new FakeBestway({ applyAfterMs: 5000 });
fake.server.listen(Number(process.argv[2] ?? 8080), '127.0.0.1', () => {
  console.log(`fake Bestway cloud on ${fake.url}`);
});
