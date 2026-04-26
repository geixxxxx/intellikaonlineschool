const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const JSON_BODY_LIMIT = 1_000_000;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/assistant" && request.method === "POST") {
    await handleAssistantRequest(request, response);
    return;
  }

  if (url.pathname === "/api/firebase/student-account" && request.method === "POST") {
    await handleStudentAccountRequest(request, response);
    return;
  }

  const safePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        fs.readFile(path.join(ROOT, "index.html"), (fallbackError, fallbackContent) => {
          if (fallbackError) {
            send(response, 404, "Not found", "text/plain; charset=utf-8");
            return;
          }
          send(response, 200, fallbackContent, MIME_TYPES[".html"]);
        });
        return;
      }

      send(response, 500, "Internal server error", "text/plain; charset=utf-8");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, content, MIME_TYPES[extension] || "application/octet-stream");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Intellika is running on http://${HOST}:${PORT}`);
});

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  send(response, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

async function handleAssistantRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || "").trim();
    const model = String(body.model || "gpt-4o-mini").trim();
    const role = body.role === "student" ? "student" : "tutor";
    const context = String(body.context || "").trim().slice(0, 8000);
    const messages = normalizeAssistantMessages(body.messages);

    if (!apiKey) {
      sendJson(response, 400, {
        code: "assistant/missing-api-key",
        message: "Добавь OpenAI API key в настройках нейросети или запусти сервер с OPENAI_API_KEY."
      });
      return;
    }

    if (!messages.length) {
      sendJson(response, 400, {
        code: "assistant/empty-messages",
        message: "Сообщение для нейросети пустое."
      });
      return;
    }

    const systemPrompt = role === "student"
      ? "Ты AI-ассистент на платформе репетитора. Помогаешь ученику понять тему, разобрать домашнее задание по шагам и подготовиться к занятию. Объясняй понятно, структурно и дружелюбно. Не притворяйся, что видишь данные, которых нет. Если нужен ответ с формулами или планом, давай его в удобном виде."
      : "Ты AI-ассистент на платформе репетитора. Помогаешь репетитору готовить объяснения, планы уроков, домашние задания, разбор ошибок и сообщения ученикам. Отвечай как сильный методист и аккуратный редактор: практично, четко и без воды.";

    const upstream = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: `Контекст платформы:\n${context || "Контекст не передан."}` },
          ...messages
        ]
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      sendJson(response, upstream.status, {
        code: "assistant/upstream-error",
        message: result?.error?.message || "OpenAI не принял запрос."
      });
      return;
    }

    const reply = String(result?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      sendJson(response, 502, {
        code: "assistant/empty-response",
        message: "Нейросеть не вернула текстовый ответ."
      });
      return;
    }

    sendJson(response, 200, {
      reply,
      model: result?.model || model
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      code: error.code || "assistant/request-failed",
      message: error.message || "Не удалось выполнить запрос к нейросети."
    });
  }
}

async function handleStudentAccountRequest(request, response) {
  let signupResult = null;
  let requestBody = null;

  try {
    requestBody = await readJsonBody(request);
    const idToken = String(requestBody.idToken || "").trim();
    const tutorId = String(requestBody.tutorId || "").trim();
    const studentId = String(requestBody.studentId || "").trim();
    const apiKey = String(requestBody.firebase?.apiKey || "").trim();
    const projectId = String(requestBody.firebase?.projectId || "").trim();
    const email = String(requestBody.credentials?.email || "").trim();
    const password = String(requestBody.credentials?.password || "");
    const displayName = String(requestBody.credentials?.displayName || requestBody.student?.name || "").trim();
    const studentName = String(requestBody.student?.name || displayName || "").trim();

    if (!idToken || !tutorId || !studentId || !apiKey || !projectId || !email || !password) {
      throw createHttpError(400, "student-account/invalid-request", "Не хватает данных для создания кабинета ученика.");
    }
    if (password.length < 6) {
      throw createHttpError(400, "auth/weak-password", "Пароль слишком слабый. Минимум 6 символов.");
    }

    signupResult = await identityToolkitRequest(apiKey, "accounts:signUp", {
      email,
      password,
      returnSecureToken: true
    });

    if (displayName) {
      await identityToolkitRequest(apiKey, "accounts:update", {
        idToken: signupResult.idToken,
        displayName,
        returnSecureToken: true
      });
    }

    const accountCreatedAt = new Date().toISOString();

    await writeFirestoreDocument({
      projectId,
      idToken,
      pathSegments: ["users", signupResult.localId],
      data: {
        role: "student",
        tutorId,
        studentId,
        displayName: displayName || studentName,
        email,
        disabled: false,
        createdAt: accountCreatedAt
      }
    });

    await patchFirestoreDocument({
      projectId,
      idToken,
      pathSegments: ["users", tutorId, "students", studentId],
      data: {
        email,
        accountUid: signupResult.localId,
        hasPortalAccess: true,
        accountCreatedAt
      }
    });

    sendJson(response, 200, {
      uid: signupResult.localId,
      accountCreatedAt
    });
  } catch (error) {
    if (signupResult?.idToken) {
      try {
        const apiKey = String(requestBody?.firebase?.apiKey || "").trim();
        if (apiKey) {
          await identityToolkitRequest(apiKey, "accounts:delete", { idToken: signupResult.idToken });
        }
      } catch {}
    }

    sendJson(response, error.statusCode || 500, {
      code: error.code || "student-account/request-failed",
      message: error.message || "Не удалось создать Firebase-аккаунт ученика."
    });
  }
}

async function identityToolkitRequest(apiKey, endpoint, payload) {
  const upstream = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await upstream.json().catch(() => ({}));
  if (upstream.ok) {
    return result;
  }

  throw mapIdentityToolkitError(result?.error?.message || "AUTH_REQUEST_FAILED", upstream.status);
}

async function writeFirestoreDocument({ projectId, idToken, pathSegments, data }) {
  const endpoint = firestoreDocumentUrl(projectId, pathSegments);
  const upstream = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      fields: toFirestoreFields(data)
    })
  });

  if (upstream.ok) return;
  throw await mapFirestoreError(upstream);
}

async function patchFirestoreDocument({ projectId, idToken, pathSegments, data }) {
  const params = new URLSearchParams();
  Object.keys(data).forEach((key) => {
    params.append("updateMask.fieldPaths", key);
  });
  params.set("currentDocument.exists", "true");

  const endpoint = `${firestoreDocumentUrl(projectId, pathSegments)}?${params.toString()}`;
  const upstream = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      fields: toFirestoreFields(data)
    })
  });

  if (upstream.ok) return;
  throw await mapFirestoreError(upstream);
}

function firestoreDocumentUrl(projectId, pathSegments) {
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodedPath}`;
}

function toFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item))
      }
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value)
      }
    };
  }
  return { stringValue: String(value) };
}

async function mapFirestoreError(upstream) {
  const result = await upstream.json().catch(() => ({}));
  const status = result?.error?.status || "";
  const message = result?.error?.message || "Firestore request failed.";

  if (status === "PERMISSION_DENIED") {
    return createHttpError(upstream.status, "permission-denied", "Firestore отклонил запрос. Проверь и заново опубликуй firestore.rules.");
  }

  return createHttpError(upstream.status, "firestore/request-failed", message);
}

function mapIdentityToolkitError(code, statusCode = 400) {
  const normalized = String(code || "").toUpperCase();

  if (normalized.includes("EMAIL_EXISTS")) {
    return createHttpError(statusCode, "auth/email-already-in-use", "Этот email уже используется другим аккаунтом.");
  }
  if (normalized.includes("WEAK_PASSWORD")) {
    return createHttpError(statusCode, "auth/weak-password", "Пароль слишком слабый. Минимум 6 символов.");
  }
  if (normalized.includes("INVALID_EMAIL")) {
    return createHttpError(statusCode, "auth/invalid-email", "Укажи корректный email.");
  }
  if (normalized.includes("OPERATION_NOT_ALLOWED")) {
    return createHttpError(statusCode, "auth/operation-not-allowed", "В Firebase выключен вход по email/password. Включи его в Authentication -> Sign-in method.");
  }
  if (normalized.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
    return createHttpError(statusCode, "auth/too-many-requests", "Firebase временно ограничил попытки. Подожди немного и попробуй снова.");
  }
  if (normalized.includes("API_KEY")) {
    return createHttpError(statusCode, "auth/api-key-error", normalized);
  }

  return createHttpError(statusCode, "auth/identity-toolkit-error", normalized);
}

function normalizeAssistantMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").trim().slice(0, 4000)
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > JSON_BODY_LIMIT) {
        reject(createHttpError(413, "request/entity-too-large", "Слишком большой запрос."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(createHttpError(400, "request/invalid-json", "Тело запроса должно быть JSON."));
      }
    });

    request.on("error", (error) => {
      reject(createHttpError(500, "request/read-failed", error.message || "Не удалось прочитать запрос."));
    });
  });
}

function createHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
