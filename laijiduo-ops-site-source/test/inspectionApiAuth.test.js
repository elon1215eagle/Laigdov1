import assert from "node:assert/strict";
import test from "node:test";
import { authorizeInspectionRequest } from "../api/parse-inspection.js";

const env = {
  OPS_PUSH_SUPABASE_URL: "https://example.supabase.co",
  OPS_PUSH_SERVICE_ROLE_KEY: "service-role-key",
};

function clientFactory({ user = { id: "user-1" }, authError = null, profile = { role: "coo", is_active: true }, profileError = null } = {}) {
  return () => ({
    auth: {
      getUser: async () => ({ data: { user }, error: authError }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profile, error: profileError }),
        }),
      }),
    }),
  });
}

test("inspection API rejects requests without a bearer token", async () => {
  const result = await authorizeInspectionRequest({ headers: {} }, env, clientFactory());
  assert.equal(result.status, 401);
});

test("inspection API accepts an active authorized role", async () => {
  const result = await authorizeInspectionRequest(
    { headers: { authorization: "Bearer valid-token" } },
    env,
    clientFactory(),
  );
  assert.equal(result.status, 200);
  assert.equal(result.profile.role, "coo");
});

test("inspection API rejects store roles and inactive profiles", async () => {
  const storeRole = await authorizeInspectionRequest(
    { headers: { authorization: "Bearer valid-token" } },
    env,
    clientFactory({ profile: { role: "store_manager", is_active: true } }),
  );
  const inactive = await authorizeInspectionRequest(
    { headers: { authorization: "Bearer valid-token" } },
    env,
    clientFactory({ profile: { role: "coo", is_active: false } }),
  );
  assert.equal(storeRole.status, 403);
  assert.equal(inactive.status, 403);
});

test("inspection API rejects expired or invalid sessions", async () => {
  const result = await authorizeInspectionRequest(
    { headers: { authorization: "Bearer expired-token" } },
    env,
    clientFactory({ user: null, authError: new Error("expired") }),
  );
  assert.equal(result.status, 401);
});
