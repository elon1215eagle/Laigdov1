export const REPORT_STATUS = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  NEEDS_REVISION: "needs_revision",
  APPROVED: "approved",
  FOLLOW_UP: "follow_up",
});

export const CHANGE_REQUEST_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CLOSED: "closed",
});

const CONFIRM_ROLES = new Set(["ceo", "coo", "cfo", "admin", "hq", "cso"]);
const EDITABLE_REPORT_STATUSES = new Set([
  REPORT_STATUS.DRAFT,
  REPORT_STATUS.NEEDS_REVISION,
]);

export function canConfirmDailyReport(roleName) {
  return CONFIRM_ROLES.has(roleName);
}

export function findOpenChangeRequest(changeRequests = [], reportId) {
  return changeRequests.find(
    (request) => request.report_id === reportId
      && [CHANGE_REQUEST_STATUS.PENDING, CHANGE_REQUEST_STATUS.APPROVED].includes(request.status),
  ) || null;
}

export function deriveDailyReportAccess({
  roleName,
  reportStatus = REPORT_STATUS.DRAFT,
  reportId = null,
  changeRequests = [],
}) {
  const isStoreManager = roleName === "store_manager";
  const canConfirm = canConfirmDailyReport(roleName);
  const changeRequest = findOpenChangeRequest(changeRequests, reportId);
  const hasApprovedChangeRequest = changeRequest?.status === CHANGE_REQUEST_STATUS.APPROVED;
  const isLocked = reportStatus === REPORT_STATUS.APPROVED && !hasApprovedChangeRequest;

  return {
    canConfirm,
    canEdit: canConfirm
      || (isStoreManager && (EDITABLE_REPORT_STATUSES.has(reportStatus) || hasApprovedChangeRequest)),
    canSubmit: isStoreManager
      && (EDITABLE_REPORT_STATUSES.has(reportStatus) || hasApprovedChangeRequest),
    canRequestChange: isStoreManager
      && Boolean(reportId)
      && reportStatus === REPORT_STATUS.APPROVED
      && !changeRequest,
    canReviewChangeRequest: canConfirm,
    changeRequest,
    isLocked,
  };
}

export function buildDailyReportChangeRequest({ reportId, storeId, reason }) {
  const normalizedReason = String(reason || "").trim();
  if (!reportId || !storeId) {
    throw new Error("缺少每日回報或門店資料");
  }
  if (normalizedReason.length < 3) {
    throw new Error("修改原因至少需填寫 3 個字");
  }
  return {
    report_id: reportId,
    store_id: storeId,
    reason: normalizedReason,
    status: CHANGE_REQUEST_STATUS.PENDING,
  };
}

export function nextReportStatus(action, currentStatus) {
  const transitions = {
    submit: {
      [REPORT_STATUS.DRAFT]: REPORT_STATUS.SUBMITTED,
      [REPORT_STATUS.NEEDS_REVISION]: REPORT_STATUS.SUBMITTED,
      [REPORT_STATUS.APPROVED]: REPORT_STATUS.SUBMITTED,
    },
    confirm: {
      [REPORT_STATUS.SUBMITTED]: REPORT_STATUS.APPROVED,
      [REPORT_STATUS.FOLLOW_UP]: REPORT_STATUS.APPROVED,
    },
    request_revision: {
      [REPORT_STATUS.SUBMITTED]: REPORT_STATUS.NEEDS_REVISION,
      [REPORT_STATUS.FOLLOW_UP]: REPORT_STATUS.NEEDS_REVISION,
    },
    follow_up: {
      [REPORT_STATUS.SUBMITTED]: REPORT_STATUS.FOLLOW_UP,
    },
  };
  return transitions[action]?.[currentStatus] || null;
}
