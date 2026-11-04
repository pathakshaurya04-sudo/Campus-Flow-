import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "production";
process.env.CLIENT_URL = "https://campusflow.example";

const { createApp } = await import("../src/app.js");
const app = createApp();
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("production health endpoint and configured credentialed CORS origin", async () => {
  const healthResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: "https://campusflow.example" },
  });
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    message: "API is healthy",
  });
  assert.equal(
    healthResponse.headers.get("access-control-allow-origin"),
    "https://campusflow.example",
  );
  assert.equal(
    healthResponse.headers.get("access-control-allow-credentials"),
    "true",
  );

  const disallowedResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(disallowedResponse.status, 200);
  assert.equal(disallowedResponse.headers.get("access-control-allow-origin"), null);
});
