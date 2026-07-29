export const STORE_OPERATING_STATUS = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CLOSED: "closed",
});

export const STORE_RELATION_GROUPS = Object.freeze([
  Object.freeze({
    code: "S01-S06",
    name: "鳳山五甲店 + 鳳山南華店",
    sourceCodes: Object.freeze(["S01", "S06"]),
    capabilities: Object.freeze(["schedule", "staffing", "temporary_support"]),
    demand: 5,
    coordinatingStoreCode: "S01",
    ruleNote: "五甲與南華合併排假 / 合併看人力；南華暫停營業期間由五甲統籌。",
  }),
  Object.freeze({
    code: "S02-S03",
    name: "鳳山凱旋店 + 鳳山武廟店",
    sourceCodes: Object.freeze(["S02", "S03"]),
    capabilities: Object.freeze(["schedule", "staffing", "temporary_support"]),
    demand: 5,
    coordinatingStoreCode: "S02",
    ruleNote: "凱旋與武廟合併排假、合併看人力及臨時支援。",
  }),
]);

const NON_STORE_SCOPE_CODES = Object.freeze({
  總部: "HQ",
  跨店: "ALL",
  人資: "HR",
  財務: "FIN",
  稽核: "AUD",
  門店: "STORE",
});

export function normalizeStoreName(name = "") {
  return String(name)
    .replaceAll("潮洲", "潮州")
    .replace("屏東潮州二店", "屏東潮二店")
    .replace("阿瑄", "阿暄")
    .trim();
}

export function operatingStatusOf(store = {}) {
  if (store.operating_status) return store.operating_status;
  if (store.store_code === "S06" || normalizeStoreName(store.name) === "鳳山南華店") {
    return STORE_OPERATING_STATUS.SUSPENDED;
  }
  return store.is_active === false ? STORE_OPERATING_STATUS.CLOSED : STORE_OPERATING_STATUS.ACTIVE;
}

export function mergeStoreRelationGroups(rows = [], defaults = STORE_RELATION_GROUPS) {
  if (!rows.length) return defaults;
  const defaultsByCode = new Map(defaults.map((group) => [group.code, group]));
  return rows
    .filter((group) => group?.code && Array.isArray(group.sourceCodes) && group.sourceCodes.length)
    .map((group) => {
      const fallback = defaultsByCode.get(group.code);
      return Object.freeze({
        ...fallback,
        ...group,
        sourceCodes: Object.freeze([...group.sourceCodes]),
        capabilities: Object.freeze([...(group.capabilities || fallback?.capabilities || [])]),
        demand: Number(group.demand ?? fallback?.demand ?? 0),
        ruleNote: group.ruleNote || fallback?.ruleNote || "",
      });
    });
}

export function normalizeTemporarySupportRows(rows = []) {
  return rows.map((row) => ({
    code: row.scope_code,
    name: row.scope_name,
    demand: Number(row.demand || 0),
    workingPeopleCount: Number(row.working_people_count || 0),
    effectiveCount: Number(row.effective_count || 0),
    surplus: Number(row.surplus || 0),
    partTimeMissingHours: Number(row.part_time_missing_hours || 0),
    segmentRows: [
      { key: "lunchPeak", label: "午峰", count: Number(row.lunch_coverage || 0), critical: true },
      { key: "dinnerPeak", label: "晚峰", count: Number(row.dinner_coverage || 0), critical: true },
    ],
  }));
}

export function createStoreDirectory(stores = [], groups = STORE_RELATION_GROUPS) {
  const canonicalStores = stores.map((store) => ({
    ...store,
    store_code: store.store_code || store.id,
    normalizedName: normalizeStoreName(store.name),
    operating_status: operatingStatusOf(store),
  }));
  const storesByCode = new Map(canonicalStores.map((store) => [store.store_code, store]));
  const storesById = new Map(canonicalStores.map((store) => [store.id, store]));
  const storesByName = new Map(canonicalStores.map((store) => [store.normalizedName, store]));
  const groupsByCode = new Map(groups.map((group) => [group.code, group]));
  const groupByStoreCode = new Map(
    groups.flatMap((group) => group.sourceCodes.map((storeCode) => [storeCode, group])),
  );

  function storeByName(name = "") {
    return storesByName.get(normalizeStoreName(name));
  }

  function canonicalStoreCode(row = {}) {
    if (typeof row === "string") {
      return storesByCode.has(row) ? row : storesById.get(row)?.store_code || storeByName(row)?.store_code || "";
    }
    const hasDisplayStore = row.storeName && row.storeName !== "未指定";
    if (row.scope_type && !row.store_code && !row.storeCode && !hasDisplayStore && !row.name) {
      return NON_STORE_SCOPE_CODES[row.scope_type] || row.scope_type;
    }
    const directCode = row.store_code || row.storeCode;
    if (directCode && storesByCode.has(directCode)) return directCode;
    const namedStore = storeByName(row.storeName || row.name);
    if (namedStore) return namedStore.store_code;
    return storesById.get(row.store_id || row.id)?.store_code || directCode || row.store_id || row.id || "";
  }

  function resolveStore(ref = "") {
    if (!ref) return null;
    if (typeof ref === "object") {
      const code = canonicalStoreCode(ref);
      return storesByCode.get(code) || null;
    }
    return storesByCode.get(ref) || storesById.get(ref) || storeByName(ref) || null;
  }

  function findStoreScopedRecord(rows = [], storeRef = "") {
    const directMatch = rows.find((row) => (
      row.id === storeRef ||
      row.store_id === storeRef ||
      row.store_code === storeRef ||
      row.storeCode === storeRef
    ));
    if (directMatch) return directMatch;
    const target = resolveStore(storeRef);
    if (!target) return null;
    return rows.find((row) => canonicalStoreCode(row) === target.store_code) || null;
  }

  function resolveStoreCodeFromRef(storeRef = "", runtimeStores = [], reports = []) {
    const known = resolveStore(storeRef);
    if (known) return known.store_code;
    const runtimeRows = [...runtimeStores, ...reports];
    const matchingRow = runtimeRows.find((row) => (
      row.id === storeRef ||
      row.store_id === storeRef ||
      row.store_code === storeRef ||
      row.storeCode === storeRef
    ));
    return matchingRow ? canonicalStoreCode(matchingRow) : "";
  }

  function displayStoreName(row = {}) {
    const hasDisplayStore = row.storeName && row.storeName !== "未指定";
    if (row.scope_type && !hasDisplayStore && !row.name && !row.store_code && !row.storeCode) {
      return row.scope_type === "跨店" ? "全門店" : row.scope_type;
    }
    return resolveStore(row)?.name || row.storeName || row.name || "未命名門店";
  }

  function relationGroupForStore(storeRef = "") {
    const store = resolveStore(storeRef);
    return store ? groupByStoreCode.get(store.store_code) || null : groupsByCode.get(storeRef) || null;
  }

  function scopeForProfile(profile = {}) {
    const role = profile.role || "";
    if (role && role !== "store_manager") {
      return {
        kind: "headquarters",
        primaryStoreCode: "",
        visibleStoreCodes: canonicalStores.map((store) => store.store_code),
        editableStoreCodes: canonicalStores.map((store) => store.store_code),
      };
    }
    const primaryStore = resolveStore(profile.store_id || profile.store_code || "");
    if (!primaryStore) {
      return { kind: "unassigned", primaryStoreCode: "", visibleStoreCodes: [], editableStoreCodes: [] };
    }
    const group = relationGroupForStore(primaryStore);
    return {
      kind: "store",
      primaryStoreCode: primaryStore.store_code,
      visibleStoreCodes: group ? [...group.sourceCodes] : [primaryStore.store_code],
      editableStoreCodes: operatingStatusOf(primaryStore) === STORE_OPERATING_STATUS.ACTIVE
        ? [primaryStore.store_code]
        : [],
      relationGroupCode: group?.code || "",
    };
  }

  return Object.freeze({
    canonicalStores,
    canonicalStoreCode,
    displayStoreName,
    findStoreScopedRecord,
    relationGroupForStore,
    resolveStore,
    resolveStoreCodeFromRef,
    scopeForProfile,
  });
}
