import { buildStaffStoreTransfer, normalizeStaffStoreAssignment } from "../domain/staffStoreAssignment.js";

const FIELDS = "id, staff_id, store_code, effective_from, effective_to, reason, created_by, created_at, updated_at";

function isMissingDatabaseObject(error) {
  return ["42P01", "42883", "PGRST202"].includes(error?.code)
    || /does not exist|could not find the function/i.test(error?.message || "");
}

export function createStaffStoreAssignmentRepository(client = null) {
  return {
    async fetchAll() {
      if (!client) return [];
      const { data, error } = await client
        .from("staff_store_assignments")
        .select(FIELDS)
        .order("staff_id")
        .order("effective_from", { ascending: false });
      if (error) {
        if (isMissingDatabaseObject(error)) return [];
        throw error;
      }
      return (data || []).map(normalizeStaffStoreAssignment);
    },

    async recordTransfer(payload) {
      const command = buildStaffStoreTransfer(payload);
      if (!command.valid) throw new Error(command.message);
      if (!client) return normalizeStaffStoreAssignment({ ...command.payload, id: crypto.randomUUID?.() || String(Date.now()) });
      const { data, error } = await client.rpc("record_staff_store_transfer", {
        p_staff_id: command.payload.staff_id,
        p_store_code: command.payload.store_code,
        p_effective_from: command.payload.effective_from,
        p_reason: command.payload.reason,
      });
      if (error) {
        if (isMissingDatabaseObject(error)) throw new Error("開發資料庫尚未套用人員調店歷程 migration");
        throw error;
      }
      return normalizeStaffStoreAssignment(Array.isArray(data) ? data[0] : data);
    },
  };
}
