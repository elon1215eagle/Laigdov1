function numericSalary(value) {
  const normalized = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : 0;
}

export function estimatedHourlyCost(person, salaryRows = []) {
  const directHourly = Number(person.estimated_hourly_cost || person.estimatedHourlyCost || 0);
  if (directHourly > 0) return directHourly;
  const employmentType = person.employment_type || person.employmentType || "";
  if (employmentType === "兼職" || person.role === "兼職人員") return 0;
  const directMonthly = Number(person.estimated_monthly_cost || person.estimatedMonthlyCost || 0);
  const roleMonthly = numericSalary(salaryRows.find((row) => row.role === person.role)?.base_salary);
  const monthly = directMonthly || roleMonthly;
  return monthly > 0 ? monthly / 30 / 8 : 0;
}

export function calculateProjectedLaborCost({ projectedShifts = [], people = [], salaryRows = [] }) {
  const peopleById = new Map(people.map((person) => [String(person.id), person]));
  const byStore = new Map();
  const missingStaffIds = new Set();
  let totalHours = 0;
  let totalCost = 0;

  projectedShifts.forEach((shift) => {
    const person = peopleById.get(String(shift.staffId)) || {};
    const hours = Math.max(0, Number(shift.end || 0) - Number(shift.start || 0)) / 60;
    const hourlyCost = estimatedHourlyCost(person, salaryRows);
    const cost = hours * hourlyCost;
    if (!hourlyCost) missingStaffIds.add(String(shift.staffId));
    totalHours += hours;
    totalCost += cost;
    const storeCode = shift.assignedStoreCode || "未指定";
    const current = byStore.get(storeCode) || { storeCode, hours: 0, estimatedCost: 0 };
    current.hours += hours;
    current.estimatedCost += cost;
    byStore.set(storeCode, current);
  });

  return {
    totalHours,
    estimatedCost: totalCost,
    missingCostStaffCount: missingStaffIds.size,
    byStore: [...byStore.values()],
  };
}
