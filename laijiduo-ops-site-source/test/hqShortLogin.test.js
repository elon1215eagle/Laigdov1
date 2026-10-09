import test from "node:test";
import assert from "node:assert/strict";
import { signInWithIdentifier } from "../src/modules/account-management/shortLogin.js";

test("Email and existing store aliases keep the original password flow", async () => {
  for (const [input, email] of [[" CEO@LAIGDO.COM ", "ceo@laigdo.com"], ["s01", "s01.sub@laigdo.com"]]) {
    const client = { auth: { signInWithPassword: async (args) => { assert.deepEqual(args, { email, password: "existing" }); return { data: { user: email } }; } } };
    assert.deepEqual(await signInWithIdentifier(client, input, "existing"), { user: email });
  }
});
test("HQ short login exchanges the verified session without changing passwords", async () => {
  const client = {
    functions: { invoke: async (name, args) => { assert.equal(name, "hq-short-login"); assert.deepEqual(args.body, { alias: "ceo", password: "test-secret" }); return { data: { access_token: "a", refresh_token: "r" } }; } },
    auth: { setSession: async (session) => { assert.deepEqual(session, { access_token: "a", refresh_token: "r" }); return { data: { user: "same-id" } }; } },
  };
  assert.deepEqual(await signInWithIdentifier(client, " CEO ", "test-secret"), { user: "same-id" });
});
test("Failed verification never sets a session", async () => {
  const client = { functions: { invoke: async () => ({ error: new Error("denied") }) }, auth: { setSession: () => assert.fail("must not run") } };
  await assert.rejects(signInWithIdentifier(client, "ceo", "wrong"), /短帳號/);
});
