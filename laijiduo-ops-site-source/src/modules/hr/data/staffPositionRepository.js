import { buildStaffPositionSkillCommand, normalizeStaffPositionSkills } from "../domain/staffPosition.js";

function isMissingObject(error) {
  return ["42P01", "42883", "PGRST202"].includes(error?.code) || /does not exist|could not find the function/i.test(error?.message || "");
}

export function createStaffPositionRepository(client = null) {
  return {
    async fetchSkills() {
      if (!client) return [];
      const { data, error } = await client.from("staff_position_skills").select("staff_id, position_code, is_primary").order("staff_id").order("position_code");
      if (error) {
        if (isMissingObject(error)) return [];
        throw error;
      }
      return normalizeStaffPositionSkills(data || []);
    },
    async saveSkills(payload) {
      const command = buildStaffPositionSkillCommand(payload);
      if (!command.valid) throw new Error(command.message);
      if (!client) return command.payload.positions.map((position) => ({ staff_id: command.payload.staff_id, position_code: position, is_primary: position === command.payload.primary_position }));
      const { data, error } = await client.rpc("replace_staff_position_skills", {
        p_staff_id: command.payload.staff_id,
        p_positions: command.payload.positions,
        p_primary_position: command.payload.primary_position,
      });
      if (error) {
        if (isMissingObject(error)) throw new Error("開發資料庫尚未套用工作崗位 migration");
        throw error;
      }
      return normalizeStaffPositionSkills(data || []);
    },
  };
}
