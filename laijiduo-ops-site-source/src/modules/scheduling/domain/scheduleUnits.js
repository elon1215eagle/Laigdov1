export const WUJIA_STOREFRONT_UNIT_CODE = "S01-S06";
export const WUJIA_BACKOFFICE_UNIT_CODE = "S01-BACK";

function staffStoreCode(person = {}) {
  const code = String(person.store_code || person.storeCode || "").trim().toUpperCase();
  if (code) return code;
  const storeName = String(person.store_name || person.storeName || "").trim();
  return storeName.includes("五甲") ? "S01" : "";
}

function staffWorkCategory(person = {}) {
  return String(person.work_category || person.workCategory || "").trim();
}

function staffRole(person = {}) {
  return String(person.role || person.role_name || person.roleName || "").trim();
}

export function isWujiaBackofficeStaff(person = {}) {
  const category = staffWorkCategory(person);
  const role = staffRole(person);
  return staffStoreCode(person) === "S01" && (category === "後勤" || (!category && role.includes("後勤")));
}

export function buildWujiaScheduleUnits(group, staffRoster = [], { backofficeEnabled = true } = {}) {
  if (group?.code !== WUJIA_STOREFRONT_UNIT_CODE) return [group];

  const storefront = {
    ...group,
    name: "五甲門市（含南華人員）",
    ruleNote: "南華尚未開店，人員併入五甲門市排班與人力計算。",
    scheduleOnly: false,
    allowTemporarySupport: true,
  };
  if (!backofficeEnabled) return [storefront];

  const backofficeStaff = staffRoster.filter(isWujiaBackofficeStaff);
  return [
    storefront,
    {
      ...group,
      code: WUJIA_BACKOFFICE_UNIT_CODE,
      name: "五甲後勤",
      sourceCodes: ["S01"],
      staff: backofficeStaff,
      demand: 0,
      scheduleOnly: true,
      allowTemporarySupport: false,
      accessGroupCode: WUJIA_STOREFRONT_UNIT_CODE,
      ruleNote: "僅供五甲後勤排班；不計門市人力、不列入缺口，也不參與跨店支援。",
    },
  ];
}

export function scheduleUnitAllowsStaffAssignment(person, assignedStoreCode) {
  if (!isWujiaBackofficeStaff(person)) return true;
  return String(assignedStoreCode || "S01").trim().toUpperCase() === "S01";
}
