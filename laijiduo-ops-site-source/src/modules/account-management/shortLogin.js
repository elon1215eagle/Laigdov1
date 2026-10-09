import { normalizeLoginIdentifier } from "../../domain/loginIdentifier.js";

export async function signInWithIdentifier(client, identifier, password) {
  const normalized = normalizeLoginIdentifier(identifier);
  if (normalized.includes("@")) {
    const { data, error } = await client.auth.signInWithPassword({ email: normalized, password });
    if (error) throw error;
    return data;
  }
  const { data, error } = await client.functions.invoke("hq-short-login", {
    body: { alias: normalized, password },
  });
  if (error || !data?.access_token || !data?.refresh_token) {
    throw new Error("短帳號或密碼不正確、已停用或暫時鎖定。請稍後再試，或使用原 Email 登入。");
  }
  const result = await client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (result.error) throw result.error;
  return result.data;
}
