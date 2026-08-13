const STORE_SHORT_ACCOUNT_PATTERN = /^s(0[1-9]|1[01])$/i;

export function normalizeLoginIdentifier(value) {
  const identifier = String(value || "").trim().toLowerCase();

  if (STORE_SHORT_ACCOUNT_PATTERN.test(identifier)) {
    return `${identifier}.sub@laigdo.com`;
  }

  return identifier;
}
