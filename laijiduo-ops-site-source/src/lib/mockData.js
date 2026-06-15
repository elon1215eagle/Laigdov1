export const storesSeed = [
  ["S01", "鳳山五甲店", "鳳山區", "阿暄店長", 68000, 18300, 24300, 28700, "approved", 0, "正常", "22:18"],
  ["S02", "鳳山凱旋店", "鳳山區", "阿斌店長", 62000, 15200, 22900, 22500, "submitted", -300, "待覆核", "21:56"],
  ["S03", "鳳山武廟店", "鳳山區", "愛庭副店長", 59000, 14100, 19600, 21100, "follow_up", -850, "需追蹤", "21:40"],
  ["S04", "鳳山中山店", "鳳山區", "樂樂店長", 64000, 17600, 23300, 26300, "approved", 0, "正常", "22:04"],
  ["S05", "鳳山南華店", "鳳山區", "人力不足暫停", 0, 0, 0, 0, "draft", null, "暫停營業", "暫停"],
  ["S06", "前鎮隆興店", "前鎮區", "威廷副店長", 72000, 22100, 26100, 31900, "approved", 200, "正常", "22:21"],
  ["S07", "三民大昌店", "三民區", "仕鈞副店長", 76000, 19800, 31300, 31200, "submitted", 0, "待審核", "22:07"],
  ["S08", "三民義華店", "三民區", "晉銘店長", 53000, 11900, 15500, 21400, "draft", null, "尚未回報", "19:03"],
  ["S09", "三民鼎山店", "三民區", "超哥店長", 66000, 16700, 22400, 30400, "submitted", -120, "待覆核", "22:01"],
  ["S10", "屏東潮州店", "屏東區", "以得店長", 74000, 20500, 26700, 31400, "approved", 0, "正常", "22:24"],
  ["S11", "屏東潮二店", "屏東區", "耀呈副店長", 47000, 9800, 15300, 18800, "follow_up", -520, "待覆核", "21:31"],
].map((row, index) => ({
  id: row[0],
  store_code: row[0],
  name: row[1],
  area: row[2],
  manager_name: row[3],
  target: row[4],
  target_daily_revenue: row[4],
  target_monthly_revenue: row[4] * 30,
  opened_to_1400_revenue: row[5],
  revenue_1400_to_1900: row[6],
  revenue_1900_to_close: row[7],
  status: row[8],
  cash_difference: row[9],
  inventory_status: row[10],
  updated_at_label: row[11],
  is_active: row[1] !== "鳳山南華店",
  sort_order: index + 1,
}));

const productRows = [
  ["雞翅", "箱"],
  ["雞腿", "箱"],
  ["雞排", "箱"],
  ["腿排", "箱"],
  ["雞米花", "箱"],
  ["三角骨", "箱"],
  ["雞脖子", "箱"],
  ["地瓜", "箱"],
  ["米血", "包"],
  ["花枝丸", "包"],
  ["熱狗", "包"],
  ["雞塊", "包"],
  ["黑輪", "包"],
  ["雞皮", "串"],
  ["炸油", "桶"],
  ["湯翅粉", "包"],
  ["醃粉", "包"],
  ["薯脆粉", "包"],
];

export const productsSeed = productRows.map(([name, unit], index) => ({
  id: `P${String(index + 1).padStart(2, "0")}`,
  name,
  unit,
  sort_order: index + 1,
  current_stock: 0,
  safety_stock: 0,
  loss_count: 0,
  incoming_count: 0,
  stock_unit: unit,
  incoming_unit: unit,
  current_stock_boxes: 0,
  current_stock_packs: 0,
  incoming_boxes: 0,
  incoming_packs: 0,
  incoming_source: "廠商進貨",
  transfer_note: "",
}));

export const salaryStructureSeed = [
  ["店長", "60000", "委任經理人", "須自保", "", "", "11", "2", "9"],
  ["副店長", "50000", "聘僱制", "保勞健保", "5000", "", "11", "2", "9"],
  ["資深人員", "46000", "聘僱制", "保勞健保", "4000", "7", "11", "2", "9"],
  ["正式人員", "42000", "聘僱制", "保勞健保", "3000", "6", "11", "2", "9"],
  ["新進人員", "38500", "聘僱制", "保勞健保", "2500", "6", "11", "2", "9"],
  ["兼職後勤", "33000", "聘僱制", "保勞健保", "2500", "6", "8", "1", "7"],
  ["送貨人員", "1150 / 日", "承攬制", "", "", "", "", "", ""],
].map((row) => ({
  role: row[0],
  base_salary: row[1],
  employment_type: row[2],
  insurance_note: row[3],
  performance_bonus: row[4],
  monthly_rest_days: row[5],
  work_hours: row[6],
  break_hours: row[7],
  actual_work_hours: row[8],
}));

export const storeHoursSeed = [
  ["鳳山五甲店", "10:00", "23:00", "11:30-13:30", "17:00-19:00", "3", "14:00", "19:00", "23:00"],
  ["鳳山凱旋店", "09:30", "22:30", "11:30-13:30", "17:00-19:00", "3", "14:00", "19:00", "22:30"],
  ["鳳山武廟店", "10:30", "22:30", "11:30-13:30", "17:00-19:00", "2", "14:00", "19:00", "22:30"],
  ["鳳山中山店", "10:00", "22:30", "11:30-13:30", "17:00-19:00", "2", "14:00", "19:00", "22:30"],
  ["鳳山南華店", "09:00", "21:00", "11:30-13:30", "17:00-19:00", "2", "14:00", "19:00", "21:00"],
  ["前鎮隆興店", "10:00", "22:30", "11:30-13:30", "17:00-19:00", "2", "14:00", "19:00", "22:30"],
  ["三民大昌店", "09:30", "22:30", "11:30-13:30", "17:00-19:00", "3", "14:00", "19:00", "22:30"],
  ["三民義華店", "09:30", "22:30", "11:30-13:30", "17:00-19:00", "3", "14:00", "19:00", "22:30"],
  ["三民鼎山店", "10:00", "23:00", "11:30-13:30", "17:00-19:00", "3", "14:00", "19:00", "23:00"],
  ["屏東潮州店", "09:00", "21:30", "11:30-13:30", "17:00-19:00", "2", "14:00", "19:00", "21:30"],
  ["屏東潮二店", "09:00", "21:30", "11:30-13:30", "17:00-19:00", "2", "13:00", "18:00", "21:30"],
].map((row) => ({
  storeName: row[0],
  open_time: row[1],
  close_time: row[2],
  lunch_peak: row[3],
  dinner_peak: row[4],
  duty_staff: row[5],
  lunch_report_time: row[6],
  dinner_report_time: row[7],
  close_report_time: row[8],
}));

export const staffRosterSeed = [
  ["鳳山五甲店", "店長", "阿暄"], ["鳳山五甲店", "正式人員", "穎德"], ["鳳山五甲店", "新進人員", "韋呈"], ["鳳山五甲店", "新進人員", "銘泉"], ["鳳山五甲店", "新進人員", "慶彰"], ["鳳山五甲店", "兼職後勤", "欣樺"], ["鳳山五甲店", "兼職後勤", "錡錡"], ["鳳山五甲店", "兼職後勤", "娟姨"], ["鳳山五甲店", "送貨人員", "彥璋"], ["鳳山五甲店", "兼職後勤", "斌媽"], ["鳳山五甲店", "兼職後勤", "晹晹"],
  ["鳳山凱旋店", "店長", "阿斌"], ["鳳山凱旋店", "正式人員", "柏誌"], ["鳳山凱旋店", "正式人員", "若芸"], ["鳳山凱旋店", "新進人員", "斯鴻"],
  ["鳳山武廟店", "副店長", "愛庭"], ["鳳山武廟店", "正式人員", "仁彰"], ["鳳山武廟店", "新進人員", "宜樺"],
  ["鳳山中山店", "店長", "樂樂"], ["鳳山中山店", "資深人員", "小白"], ["鳳山中山店", "新進人員", "家妤"],
  ["前鎮隆興店", "副店長", "威廷"], ["前鎮隆興店", "資深人員", "易勳"], ["前鎮隆興店", "新進人員", "道豐"],
  ["三民大昌店", "副店長", "仕鈞"], ["三民大昌店", "資深人員", "俊雄"], ["三民大昌店", "正式人員", "慧萍"], ["三民大昌店", "新進人員", "恩惠"],
  ["三民義華店", "店長", "晉銘"], ["三民義華店", "資深人員", "羽晴"], ["三民義華店", "新進人員", "虹伶"], ["三民義華店", "新進人員", "季稐"],
  ["三民鼎山店", "店長", "超哥"], ["三民鼎山店", "資深人員", "永欣"], ["三民鼎山店", "新進人員", "惠津"], ["三民鼎山店", "新進人員", "東益"],
  ["屏東潮州店", "店長", "以得"], ["屏東潮州店", "正式人員", "峻翊"], ["屏東潮州店", "新進人員", "炘慈"],
  ["屏東潮二店", "副店長", "耀呈"], ["屏東潮二店", "新進人員", "允翔"], ["屏東潮二店", "新進人員", "惠華"],
].map((row, index) => ({
  id: `staff-${index + 1}`,
  storeName: row[0],
  role: row[1],
  employeeName: row[2],
}));

export const hqSystemSeed = [
  ["每日營收回報", "店長 / 副店長", "每日 14:00、19:00、打烊", "三段營收、現金差異、庫存使用量", "缺報或現金差異由執行督導追蹤"],
  ["交接管理", "店長 / 值班主管", "每班交接", "現金、庫存、設備、清潔、待辦事項", "未完成交接列入門店稽核缺失"],
  ["巡檢稽核", "督導長 / 執行督導", "每週巡檢，每月複盤", "巡檢分數、照片、改善期限、店長簽名", "重大缺失 24 小時內回報總部"],
  ["人員績效獎懲", "店長回報 / 總部覆核", "每月", "遲到、請假、曠職、出餐延遲與改善紀錄", "C 等以下排定輔導，連續未改善啟動汰換"],
  ["排班與人力配置", "店長", "每週排班，每日確認", "尖峰值班人數、缺員、代班紀錄", "尖峰人力不足由督導協調支援"],
  ["加盟展店流程", "總部", "展店專案制", "選址、訓練、驗收、試營運紀錄", "未通過驗收不得正式開幕"],
].map((row, index) => ({
  id: `system-${index + 1}`,
  module: row[0],
  owner: row[1],
  frequency: row[2],
  evidence: row[3],
  escalation: row[4],
}));

export const mockProfile = {
  id: "mock-user",
  full_name: "總部示範帳號",
  role: "hq",
  store_id: null,
};

export const handoverSeed = storesSeed.slice(0, 6).map((store, index) => ({
  id: `handover-${store.id}`,
  store_id: store.id,
  storeName: store.name,
  handover_date: new Date().toISOString().slice(0, 10),
  shift_type: index % 3 === 0 ? "早班" : index % 3 === 1 ? "晚班" : "打烊",
  cash_status: index % 4 === 0 ? "需追蹤" : "正常",
  inventory_status: index % 3 === 0 ? "品項待補" : "正常",
  equipment_status: "正常",
  cleaning_status: index % 5 === 0 ? "未完成" : "完成",
  customer_issue: index % 4 === 0 ? "顧客反映等候時間偏長，需店長補充說明" : "",
  pending_tasks: index % 2 === 0 ? "追蹤尖峰出餐速度與備料量" : "",
  manager_name: store.manager_name,
  status: index % 4 === 0 ? "需追蹤" : "已完成",
  created_at: new Date().toISOString(),
}));

export const performanceSeed = [
  ["鳳山五甲店", "阿暄", "店長", 96, 0, 0, 0, 0, 0, "A", "績效正常"],
  ["鳳山凱旋店", "阿斌", "店長", 88, 5, 0, 0, 0, -3000, "B", "獎金 -3,000"],
  ["鳳山武廟店", "愛庭", "副店長", 91, 0, 0, 0, 5, 0, "A", "績效正常"],
  ["三民大昌店", "仕鈞", "副店長", 76, 10, 1, 0, 10, -4000, "C", "獎金 -4,000，需輔導"],
  ["屏東潮州店", "以得", "店長", 93, 0, 0, 0, 0, 0, "A", "績效正常"],
].map((row, index) => ({
  id: `performance-${index + 1}`,
  storeName: row[0],
  employee_name: row[1],
  role_name: row[2],
  score: row[3],
  late_count: row[4],
  leave_count: row[5],
  absence_count: row[6],
  service_delay_count: row[7],
  bonus_adjustment: row[8],
  grade: row[9],
  action: row[10],
  period_month: new Date().toISOString().slice(0, 7),
  status: row[3] >= 90 ? "正常" : row[3] >= 80 ? "提醒" : "需輔導",
  note: row[3] >= 80 ? "" : "需由店長提出改善計畫並由督導追蹤",
}));

export const scheduleSeed = storeHoursSeed.flatMap((store, storeIndex) => {
  const roster = staffRosterSeed.filter((person) => person.storeName === store.storeName);
  const isClosed = store.storeName === "鳳山南華店";
  const required = Number(store.duty_staff || 0);
  const available = roster.filter((person) => person.role !== "送貨人員");
  const lead = available.find((person) => person.role === "店長" || person.role === "副店長") || available[0];
  const shifts = [
    ["開店", store.open_time, store.lunch_report_time],
    ["晚峰", store.dinner_peak.split("-")[0], store.dinner_peak.split("-")[1]],
    ["打烊", store.dinner_report_time, store.close_report_time],
  ];
  return shifts.map(([shiftName, start, end], shiftIndex) => {
    const assigned = isClosed ? [] : available.slice(shiftIndex, shiftIndex + required);
    if (!assigned.some((person) => person.employeeName === lead?.employeeName) && lead) assigned.unshift(lead);
    const uniqueAssigned = assigned.filter((person, index, rows) => rows.findIndex((item) => item.employeeName === person.employeeName) === index);
    return {
      id: `schedule-${storeIndex + 1}-${shiftIndex + 1}`,
      storeName: store.storeName,
      shift_name: shiftName,
      start_time: start,
      end_time: end,
      required_staff: required,
      assigned_staff: uniqueAssigned.map((person) => person.employeeName),
      owner: lead?.employeeName || "待補主管",
      status: isClosed ? "暫停營業" : uniqueAssigned.length >= required ? "足夠" : "人力不足",
      action: isClosed ? "等待總部確認復店人力" : uniqueAssigned.length >= required ? "維持排班" : "督導協調代班或支援",
    };
  });
});

export const supervisorTaskSeed = [
  ["task-1", "營收缺報追蹤", "三民義華店", "督導長", "高", "進行中", "今日 19:03 尚未完成完整回報", "要求店長補報並確認缺報原因"],
  ["task-2", "交接異常追蹤", "鳳山五甲店", "執行督導", "中", "待處理", "交接現金與清潔狀態需追蹤", "明日開店前完成照片與現金說明"],
  ["task-3", "績效輔導", "三民大昌店", "執行督導", "高", "進行中", "仕鈞績效 76 分，達 C 等", "安排 7 日改善追蹤與店長約談"],
  ["task-4", "人力補編", "鳳山南華店", "督導長", "高", "待處理", "人力不足已暫停營業", "確認補人名單、復店日期與訓練安排"],
  ["task-5", "現金差異覆核", "鳳山武廟店", "執行督導", "中", "待處理", "現金差異 -850", "要求副店長補充說明並交叉核對庫存"],
  ["task-6", "巡檢改善結案", "屏東潮二店", "執行督導", "中", "已完成", "前次巡檢待改善項目已完成照片回傳", "納入週會複盤"],
].map((row, index) => ({
  id: row[0],
  task_type: row[1],
  storeName: row[2],
  owner: row[3],
  priority: row[4],
  status: row[5],
  evidence: row[6],
  action: row[7],
  due_date: new Date(Date.now() + (index - 2) * 86400000).toISOString().slice(0, 10),
}));

export const hrChangeSeed = [
  ["hr-1", "斯鴻", "鳳山凱旋店", "新進追蹤", "新進人員", "正式人員", "試用觀察", "店長阿斌", "補齊 30 日試用評核與出勤紀錄"],
  ["hr-2", "韋呈", "鳳山五甲店", "轉正評估", "新進人員", "正式人員", "待總部覆核", "督導長", "依績效與出勤判斷是否轉正"],
  ["hr-3", "愛庭", "鳳山武廟店", "主管任用", "副店長", "副店長", "已納入制度", "總部", "副店長列入門店主管角色，可代理店長責任"],
  ["hr-4", "仕鈞", "三民大昌店", "績效改善", "副店長", "副店長", "改善中", "執行督導", "C 等需 7 日改善，未改善啟動調整"],
  ["hr-5", "鳳山南華補編", "鳳山南華店", "人力補編", "無", "店長 / 正式人員", "待招募", "督導長", "完成主管與基本人力後再評估復店"],
].map((row) => ({
  id: row[0],
  employeeName: row[1],
  storeName: row[2],
  change_type: row[3],
  from_role: row[4],
  to_role: row[5],
  status: row[6],
  owner: row[7],
  note: row[8],
  due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
}));
