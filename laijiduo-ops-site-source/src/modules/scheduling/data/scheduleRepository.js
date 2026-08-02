import { normalizeTemporarySupportRows } from "../../../lib/storeScope.js";
import { normalizeTime24 } from "../domain/staffingRules.js";

const MONTHLY_LEAVE_FIELDS = [
  "id", "period_month", "store_code", "store_name", "staff_id",
  "employee_name", "role_name", "leave_days", "manual_leave_days",
  "auto_leave_days", "leave_type", "note", "updated_by", "created_at", "updated_at",
].join(", ");

const MONTHLY_SCHEDULE_LOCK_FIELDS = [
  "period_month", "is_confirmed", "confirmed_by", "confirmed_at",
  "schedule_version", "needs_reconfirmation", "note", "created_at", "updated_at",
].join(", ");

const SUPPORT_SHIFT_REQUEST_FIELDS = [
  "id", "shift_date", "staff_id", "employee_name", "home_store_code", "assigned_store_code",
  "start_time", "end_time", "note", "status", "requested_by", "reviewed_by", "reviewed_at",
  "review_note", "resulting_shift_id", "created_at", "updated_at",
].join(", ");

const MONTHLY_SCHEDULE_CHANGE_REQUEST_FIELDS = [
  "id", "period_month", "store_code", "store_name", "reason", "status",
  "scope_type", "target_date", "target_staff_id", "target_shift_id",
  "approved_until", "used_at", "approval_version",
  "requested_by", "reviewed_by", "reviewed_at", "review_note", "created_at", "updated_at",
].join(", ");

const DAILY_STAFF_SHIFT_FIELDS = [
  "id", "shift_date", "staff_id", "employee_name", "home_store_code",
  "assigned_store_code", "start_time", "end_time", "shift_type", "note",
  "created_by", "created_at", "updated_at",
].join(", ");

const PERSONAL_SCHEDULE_LINK_FIELDS = [
  "id", "period_month", "schedule_version", "staff_id", "employee_name",
  "home_store_code", "role_name", "expires_at", "revoked_at", "created_by", "created_at",
].join(", ");

const STANDARD_SHIFT_TEMPLATE_FIELDS = [
  "id", "name", "start_time", "end_time", "is_active", "sort_order",
  "created_by", "created_at", "updated_at",
].join(", ");

function isMissingTable(error) {
  return error?.code === "42P01" || /relation .* does not exist/i.test(error?.message || "");
}

function isMissingFunction(error) {
  return error?.code === "42883"
    || error?.code === "PGRST202"
    || /function .* does not exist|could not find the function/i.test(error?.message || "");
}

function isQuarterHour(timeValue) {
  const normalized = normalizeTime24(timeValue);
  return Boolean(normalized) && Number(normalized.slice(3, 5)) % 15 === 0;
}

export function normalizeLeaveDays(days) {
  return [...new Set((Array.isArray(days) ? days : []).map(Number).filter((day) => day >= 1 && day <= 31))]
    .sort((a, b) => a - b);
}

function buildLeavePayload(payload, userId) {
  return {
    ...payload,
    leave_days: normalizeLeaveDays(payload.leave_days),
    manual_leave_days: normalizeLeaveDays(payload.manual_leave_days),
    auto_leave_days: normalizeLeaveDays(payload.auto_leave_days),
    leave_type: payload.leave_type || "排休",
    updated_by: userId,
  };
}

function nextMonthStart(periodMonth) {
  const [year, month] = String(periodMonth).split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 10);
}

export function createScheduleRepository(client = null) {
  async function currentUserId() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user?.id || null;
  }

  return {
    async fetchStandardShiftTemplates() {
      if (!client) return [];
      const { data, error } = await client
        .from("standard_shift_templates")
        .select(STANDARD_SHIFT_TEMPLATE_FIELDS)
        .eq("is_active", true)
        .order("sort_order")
        .order("start_time");
      if (error) {
        if (isMissingTable(error)) return [];
        throw error;
      }
      return data || [];
    },

    async upsertStandardShiftTemplate(payload) {
      const startTime = normalizeTime24(payload.start_time);
      const endTime = normalizeTime24(payload.end_time);
      if (!String(payload.name || "").trim()) throw new Error("請輸入班次名稱");
      if (!startTime || !endTime || endTime <= startTime) throw new Error("班次結束時間必須晚於開始時間");
      if (!isQuarterHour(startTime) || !isQuarterHour(endTime)) throw new Error("班次時間須以 15 分鐘為單位");
      const cleanPayload = {
        ...(payload.id ? { id: payload.id } : {}),
        name: String(payload.name).trim(),
        start_time: startTime,
        end_time: endTime,
        is_active: payload.is_active !== false,
        sort_order: Number(payload.sort_order || 0),
      };
      if (!client) return { id: payload.id || globalThis.crypto?.randomUUID?.() || String(Date.now()), ...cleanPayload };
      const userId = await currentUserId();
      const { data, error } = await client
        .from("standard_shift_templates")
        .upsert({ ...cleanPayload, created_by: userId }, { onConflict: "id" })
        .select(STANDARD_SHIFT_TEMPLATE_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async archiveStandardShiftTemplate(id) {
      if (!client) return { id, is_active: false };
      const { data, error } = await client
        .from("standard_shift_templates")
        .update({ is_active: false })
        .eq("id", id)
        .select(STANDARD_SHIFT_TEMPLATE_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async fetchMonthlyLeavePlans(periodMonth) {
      if (!client) return [];
      const { data, error } = await client
        .from("monthly_leave_plans")
        .select(MONTHLY_LEAVE_FIELDS)
        .eq("period_month", periodMonth)
        .order("store_code")
        .order("employee_name");
      if (error) {
        if (isMissingTable(error)) return [];
        throw error;
      }
      return data || [];
    },

    async fetchTemporarySupportSummary(supportDate) {
      if (!client || !supportDate) return null;
      const { data, error } = await client.rpc("get_temporary_support_summary", {
        p_support_date: supportDate,
      });
      if (error) {
        if (isMissingFunction(error)) return null;
        throw error;
      }
      return normalizeTemporarySupportRows(data || []);
    },

    async fetchStaffingDemandRules() {
      if (!client) return [];
      const { data, error } = await client
        .from("store_staffing_demand_rules")
        .select("id, store_code, rule_type, weekday, special_date, start_time, end_time, required_count, is_active")
        .eq("is_active", true)
        .order("store_code")
        .order("start_time");
      if (error) {
        if (isMissingTable(error)) return [];
        throw error;
      }
      return data || [];
    },

    async upsertMonthlyLeavePlan(payload) {
      if (!client) return buildLeavePayload(payload, null);
      const userId = await currentUserId();
      const { data, error } = await client
        .from("monthly_leave_plans")
        .upsert(buildLeavePayload(payload, userId), { onConflict: "period_month,staff_id" })
        .select(MONTHLY_LEAVE_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async upsertMonthlyLeavePlans(payloads) {
      if (!payloads.length) return [];
      if (!client) return payloads.map((payload) => buildLeavePayload(payload, null));
      const userId = await currentUserId();
      const { data, error } = await client
        .from("monthly_leave_plans")
        .upsert(payloads.map((payload) => buildLeavePayload(payload, userId)), {
          onConflict: "period_month,staff_id",
        })
        .select(MONTHLY_LEAVE_FIELDS);
      if (error) throw error;
      return data || [];
    },

    async fetchMonthlyScheduleControl(periodMonth) {
      if (!client) return { lock: null, requests: [] };
      const [lockResult, requestResult, supportResult, rolloutResult] = await Promise.all([
        client
          .from("monthly_schedule_locks")
          .select(MONTHLY_SCHEDULE_LOCK_FIELDS)
          .eq("period_month", periodMonth)
          .maybeSingle(),
        client
          .from("monthly_schedule_change_requests")
          .select(MONTHLY_SCHEDULE_CHANGE_REQUEST_FIELDS)
          .eq("period_month", periodMonth)
          .order("updated_at", { ascending: false }),
        client
          .from("support_shift_requests")
          .select(SUPPORT_SHIFT_REQUEST_FIELDS)
          .gte("shift_date", `${periodMonth}-01`)
          .lt("shift_date", nextMonthStart(periodMonth))
          .order("created_at", { ascending: false }),
        client
          .from("workforce_rollout_settings")
          .select("setting_key, rollout_mode, cutover_month, note, updated_by, updated_at")
          .eq("setting_key", "workforce")
          .maybeSingle(),
      ]);
      if (lockResult.error && !isMissingTable(lockResult.error)) throw lockResult.error;
      if (requestResult.error && !isMissingTable(requestResult.error)) throw requestResult.error;
      if (supportResult.error && !isMissingTable(supportResult.error)) throw supportResult.error;
      if (rolloutResult.error && !isMissingTable(rolloutResult.error)) throw rolloutResult.error;
      return {
        lock: lockResult.error ? null : lockResult.data,
        requests: requestResult.error ? [] : requestResult.data,
        supportRequests: supportResult.error ? [] : supportResult.data,
        rollout: rolloutResult.error ? null : rolloutResult.data,
        missingTable: Boolean(lockResult.error || requestResult.error || supportResult.error),
      };
    },

    async confirmMonthlySchedule(periodMonth, note = "") {
      if (!client) return { period_month: periodMonth, is_confirmed: true, note };
      const userId = await currentUserId();
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("monthly_schedule_locks")
        .upsert({
          period_month: periodMonth,
          is_confirmed: true,
          confirmed_by: userId,
          confirmed_at: now,
          needs_reconfirmation: false,
          note,
        }, { onConflict: "period_month" })
        .select(MONTHLY_SCHEDULE_LOCK_FIELDS)
        .single();
      if (error) throw error;
      await client
        .from("monthly_schedule_change_requests")
        .update({
          status: "closed",
          reviewed_by: userId,
          reviewed_at: now,
          review_note: "總部已重新確認排班",
        })
        .eq("period_month", periodMonth)
        .in("status", ["pending", "approved"]);
      return data;
    },

    async unlockMonthlySchedule(periodMonth, note = "") {
      if (!client) return { period_month: periodMonth, is_confirmed: false, note };
      const userId = await currentUserId();
      const { data, error } = await client
        .from("monthly_schedule_locks")
        .upsert({
          period_month: periodMonth,
          is_confirmed: false,
          confirmed_by: userId,
          confirmed_at: null,
          note,
        }, { onConflict: "period_month" })
        .select(MONTHLY_SCHEDULE_LOCK_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async submitMonthlyScheduleChangeRequest(payload) {
      if (!client) return { ...payload, status: "pending" };
      const userId = await currentUserId();
      const { data, error } = await client
        .from("monthly_schedule_change_requests")
        .upsert({
          period_month: payload.period_month,
          store_code: payload.store_code,
          store_name: payload.store_name,
          reason: payload.reason || "",
          scope_type: payload.scope_type,
          target_date: payload.target_date,
          target_staff_id: payload.target_staff_id,
          target_shift_id: payload.target_shift_id,
          status: "pending",
          requested_by: userId,
          reviewed_by: null,
          reviewed_at: null,
          review_note: "",
          approved_until: null,
          used_at: null,
        }, { onConflict: "period_month,store_code" })
        .select(MONTHLY_SCHEDULE_CHANGE_REQUEST_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async reviewMonthlyScheduleChangeRequest(id, status, reviewNote = "") {
      if (!client) return { id, status, review_note: reviewNote };
      const userId = await currentUserId();
      const { data, error } = await client
        .from("monthly_schedule_change_requests")
        .update({
          status,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote,
          approved_until: status === "approved" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
          used_at: null,
        })
        .eq("id", id)
        .select(MONTHLY_SCHEDULE_CHANGE_REQUEST_FIELDS)
        .single();
      if (error) throw error;
      return data;
    },

    async submitSupportShiftRequest(payload) {
      if (!client) return { ...payload, id: globalThis.crypto?.randomUUID?.() || String(Date.now()), status: "pending" };
      const userId = await currentUserId();
      const { data, error } = await client.from("support_shift_requests").insert({
        shift_date: payload.shift_date,
        staff_id: payload.staff_id,
        employee_name: payload.employee_name || "",
        home_store_code: payload.home_store_code,
        assigned_store_code: payload.assigned_store_code,
        start_time: payload.start_time,
        end_time: payload.end_time,
        note: payload.note || "",
        status: "pending",
        requested_by: userId,
      }).select(SUPPORT_SHIFT_REQUEST_FIELDS).single();
      if (error) throw error;
      return data;
    },

    async reviewSupportShiftRequest(id, status, reviewNote = "") {
      if (!client) return { id, status, review_note: reviewNote };
      const { data, error } = await client.rpc("review_support_shift_request", {
        p_request_id: id,
        p_status: status,
        p_review_note: reviewNote,
      });
      if (error) throw error;
      return data;
    },

    async setWorkforceRolloutMode(mode, cutoverMonth = null, note = "") {
      if (!client) return { setting_key: "workforce", rollout_mode: mode, cutover_month: cutoverMonth, note };
      const { data, error } = await client.rpc("set_workforce_rollout_mode", {
        p_mode: mode,
        p_cutover_month: cutoverMonth,
        p_note: note,
      });
      if (error) throw error;
      return data;
    },

    async fetchPersonalScheduleLinks(periodMonth) {
      if (!client) return [];
      const { data, error } = await client
        .from("schedule_personal_links")
        .select(PERSONAL_SCHEDULE_LINK_FIELDS)
        .eq("period_month", periodMonth)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingTable(error)) return [];
        throw error;
      }
      return data || [];
    },

    async issuePersonalScheduleLink(payload) {
      if (!client) return { ...payload, id: globalThis.crypto?.randomUUID?.() || String(Date.now()) };
      const { data, error } = await client.rpc("issue_personal_schedule_link", {
        p_period_month: payload.period_month,
        p_schedule_version: payload.schedule_version,
        p_staff_id: String(payload.staff_id),
        p_employee_name: payload.employee_name,
        p_home_store_code: payload.home_store_code,
        p_role_name: payload.role_name || "",
        p_token_hash: payload.token_hash,
        p_schedule_payload: payload.schedule_payload,
        p_expires_at: payload.expires_at,
      });
      if (error) throw error;
      return data;
    },

    async revokePersonalScheduleLink(linkId) {
      if (!client) return { id: linkId, revoked_at: new Date().toISOString() };
      const { data, error } = await client.rpc("revoke_personal_schedule_link", { p_link_id: linkId });
      if (error) throw error;
      return data;
    },

    async fetchPersonalScheduleByToken(token) {
      if (!client || !token) return null;
      const { data, error } = await client.rpc("get_personal_schedule_by_token", { p_token: token });
      if (error) throw error;
      return data;
    },

    async fetchDailyStaffShifts(periodMonth) {
      if (!client || !periodMonth) return [];
      const startDate = `${periodMonth}-01`;
      const { data, error } = await client
        .from("daily_staff_shifts")
        .select(DAILY_STAFF_SHIFT_FIELDS)
        .gte("shift_date", startDate)
        .lt("shift_date", nextMonthStart(periodMonth))
        .order("shift_date")
        .order("start_time");
      if (error) {
        if (isMissingTable(error)) return [];
        throw error;
      }
      return data || [];
    },

    async upsertDailyStaffShift(payload) {
      const startTime = normalizeTime24(payload.start_time);
      const endTime = normalizeTime24(payload.end_time);
      if (!payload.shift_date || !payload.staff_id) throw new Error("請選擇日期與人員");
      if (!startTime || !endTime || endTime <= startTime) {
        throw new Error("請輸入有效的上班與下班時間");
      }
      if (!isQuarterHour(startTime) || !isQuarterHour(endTime)) {
        throw new Error("班次時間須以 15 分鐘為單位");
      }
      const cleanPayload = {
        id: payload.id || globalThis.crypto?.randomUUID?.() || String(Date.now()),
        shift_date: payload.shift_date,
        staff_id: payload.staff_id,
        employee_name: payload.employee_name || "",
        home_store_code: payload.home_store_code || "",
        assigned_store_code: payload.assigned_store_code || payload.home_store_code || "",
        start_time: startTime,
        end_time: endTime,
        shift_type: payload.shift_type === "support" ? "support" : "override",
        note: payload.note || "",
      };
      if (!client) return cleanPayload;
      const userId = await currentUserId();
      const { data, error } = await client
        .from("daily_staff_shifts")
        .upsert({
          ...cleanPayload,
          created_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" })
        .select(DAILY_STAFF_SHIFT_FIELDS)
        .single();
      if (error?.code === "23P01") throw new Error("此人員在同一天已有重疊班次，請調整起迄時間");
      if (error) throw error;
      return data;
    },

    async deleteDailyStaffShift(shiftId) {
      if (!client || !shiftId) return;
      const { error } = await client.from("daily_staff_shifts").delete().eq("id", shiftId);
      if (error) throw error;
    },
  };
}
