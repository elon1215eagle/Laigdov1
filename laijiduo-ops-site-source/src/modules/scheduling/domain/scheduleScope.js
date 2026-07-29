import { STORE_RELATION_GROUPS } from "../../../lib/storeScope.js";

export function scheduleGroupForStore(store, relationGroups = STORE_RELATION_GROUPS) {
  const relationGroup = relationGroups.find((group) => group.sourceCodes.includes(store.code));
  if (relationGroup) {
    return {
      code: relationGroup.code,
      name: relationGroup.name,
      sourceCodes: [...relationGroup.sourceCodes],
      demand: relationGroup.demand,
      open_time: store.open_time,
      lunch_report_time: store.lunch_report_time,
      dinner_report_time: store.dinner_report_time,
      close_report_time: store.close_report_time,
      close_time: store.close_time,
      ruleNote: relationGroup.ruleNote,
    };
  }
  return {
    code: store.code,
    name: store.name,
    sourceCodes: [store.code],
    demand: store.demand,
    open_time: store.open_time,
    lunch_report_time: store.lunch_report_time,
    dinner_report_time: store.dinner_report_time,
    close_report_time: store.close_report_time,
    close_time: store.close_time,
    ruleNote: "",
  };
}

export function normalizeStoreScopedScheduleCode(storeCode = "") {
  return storeCode;
}

export function supportVisibleGroupsForTemporarySupport(allStoreGroups) {
  return allStoreGroups;
}

