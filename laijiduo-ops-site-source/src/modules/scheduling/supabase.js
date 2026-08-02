import { scheduleRepository } from "./data/supabaseScheduleRepository.js";

export const fetchMonthlyLeavePlans = (...args) => scheduleRepository.fetchMonthlyLeavePlans(...args);
export const fetchTemporarySupportSummary = (...args) => scheduleRepository.fetchTemporarySupportSummary(...args);
export const upsertMonthlyLeavePlan = (...args) => scheduleRepository.upsertMonthlyLeavePlan(...args);
export const upsertMonthlyLeavePlans = (...args) => scheduleRepository.upsertMonthlyLeavePlans(...args);
export const fetchMonthlyScheduleControl = (...args) => scheduleRepository.fetchMonthlyScheduleControl(...args);
export const confirmMonthlySchedule = (...args) => scheduleRepository.confirmMonthlySchedule(...args);
export const unlockMonthlySchedule = (...args) => scheduleRepository.unlockMonthlySchedule(...args);
export const submitMonthlyScheduleChangeRequest = (...args) => scheduleRepository.submitMonthlyScheduleChangeRequest(...args);
export const reviewMonthlyScheduleChangeRequest = (...args) => scheduleRepository.reviewMonthlyScheduleChangeRequest(...args);
export const submitSupportShiftRequest = (...args) => scheduleRepository.submitSupportShiftRequest(...args);
export const reviewSupportShiftRequest = (...args) => scheduleRepository.reviewSupportShiftRequest(...args);
export const setWorkforceRolloutMode = (...args) => scheduleRepository.setWorkforceRolloutMode(...args);
export const fetchDailyStaffShifts = (...args) => scheduleRepository.fetchDailyStaffShifts(...args);
export const upsertDailyStaffShift = (...args) => scheduleRepository.upsertDailyStaffShift(...args);
export const deleteDailyStaffShift = (...args) => scheduleRepository.deleteDailyStaffShift(...args);
