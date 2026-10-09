import { createClient } from "@supabase/supabase-js";

const allowedCategories = [
  "營運管理",
  "產品品質",
  "前台服務",
  "冰箱整潔",
  "作業區衛生",
  "店內衛生",
  "店外環境",
  "設備安全",
  "其他",
];

const inspectionRoles = new Set([
  "ceo",
  "coo",
  "general_affairs",
  "cso",
  "admin",
  "hq",
  "supervisor",
]);

export async function authorizeInspectionRequest(request, env = process.env, clientFactory = createClient) {
  const token = /^Bearer (\S+)$/.exec(request.headers?.authorization || "")?.[1];
  if (!token) return { status: 401, error: "請重新登入" };

  const url = env.OPS_PUSH_SUPABASE_URL;
  const key = env.OPS_PUSH_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: 503, error: "巡檢解析服務尚未啟用" };

  const service = clientFactory(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth?.user) return { status: 401, error: "請重新登入" };

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.is_active === false || !inspectionRoles.has(profile.role)) {
    return { status: 403, error: "無權使用巡檢解析" };
  }

  return { status: 200, user: auth.user, profile };
}

const inspectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    storeName: { type: "string" },
    date: { type: "string" },
    supervisor: { type: "string" },
    manager: { type: "string" },
    score: { type: "number" },
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: allowedCategories },
          title: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" },
          severity: { type: "string", enum: ["一般", "重要", "緊急"] },
          dueDate: { type: "string" },
          status: { type: "string", enum: ["待確認", "待改善", "已改善"] },
        },
        required: ["category", "title", "description", "suggestion", "severity", "dueDate", "status"],
      },
    },
  },
  required: ["storeName", "date", "supervisor", "manager", "score", "summary", "issues"],
};

function getOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const message = response.output?.find((item) => item.type === "message");
  const text = message?.content?.find((item) => item.type === "output_text");
  return text?.text || "";
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ error: "只接受 POST 請求" });
    return;
  }

  try {
    const authorization = await authorizeInspectionRequest(request);
    if (authorization.status !== 200) {
      response.status(authorization.status).json({ error: authorization.error });
      return;
    }
  } catch {
    response.status(503).json({ error: "巡檢解析驗證暫時無法使用" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "尚未設定 OPENAI_API_KEY" });
    return;
  }

  try {
    const { storeName, manager, date, supervisor, images = [] } = request.body || {};
    if (!Array.isArray(images) || images.length === 0 || images.length > 8) {
      response.status(400).json({ error: "請至少上傳一張巡檢表照片" });
      return;
    }
    const validImages = images.every((image) =>
      image && typeof image.url === "string" && /^(data:image\/(?:jpeg|png|webp);base64,|https:\/\/)/i.test(image.url),
    );
    if (!validImages) {
      response.status(400).json({ error: "巡檢表照片格式不正確" });
      return;
    }

    const prompt = [
      "你是門市巡檢表解析助手，請讀取台灣繁體中文巡檢表照片。",
      "照片可能包含印刷表格、藍筆手寫、勾選框、分數與背面補充文字。",
      "請把巡檢內容整理成可追蹤的缺失清單，不要只做逐字稿。",
      "若手寫不確定，請在 description 標示「疑似」或「需人工確認」。",
      "問題分類只能使用指定 enum。嚴重度：食品安全、消防、設備失效、過期設備為緊急；清潔大量缺失或保存時效為重要；其他為一般。",
      "dueDate 若照片沒有明確期限，緊急用巡檢日期，一般或重要可用巡檢日期後 3 天；無法判斷則留空字串。",
      `已知門市：${storeName || ""}`,
      `已知店長：${manager || ""}`,
      `已知巡檢日期：${date || ""}`,
      `已知督導：${supervisor || ""}`,
    ].join("\n");

    const content = [
      { type: "input_text", text: prompt },
      ...images.map((image) => ({
        type: "input_image",
        image_url: image.url,
        detail: "high",
      })),
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INSPECTION_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "inspection_parse",
            schema: inspectionSchema,
            strict: true,
          },
        },
      }),
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      response.status(openaiResponse.status).json({
        error: data.error?.message || "OpenAI 解析失敗",
      });
      return;
    }

    const text = getOutputText(data);
    if (!text) {
      response.status(502).json({ error: "OpenAI 未回傳可解析文字" });
      return;
    }

    response.status(200).json(JSON.parse(text));
  } catch (error) {
    response.status(500).json({ error: error.message || "巡檢表解析失敗" });
  }
}
