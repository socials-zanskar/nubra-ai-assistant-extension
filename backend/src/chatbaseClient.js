const fetch = require("node-fetch");

function getRequiredEnv(name) {
  const val = process.env[name];
  if (!val || typeof val !== "string" || !val.trim()) return null;
  return val.trim();
}

async function chatbaseConvert({ userMessage }) {
  const apiKey = getRequiredEnv("CHATBASE_API_KEY");
  const chatbotId = getRequiredEnv("CHATBASE_CHATBOT_ID");
  const baseUrl = getRequiredEnv("CHATBASE_BASE_URL");

  if (!apiKey || !chatbotId || !baseUrl) {
    const missing = ["CHATBASE_API_KEY", "CHATBASE_CHATBOT_ID", "CHATBASE_BASE_URL"].filter(
      (k) => !getRequiredEnv(k)
    );
    const err = new Error("Chatbase is not configured.");
    err.code = "CHATBASE_NOT_CONFIGURED";
    err.missing = missing;
    throw err;
  }

  const url = baseUrl.replace(/\/+$/, "") + "/api/v1/chat";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatbotId,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = new Error("Chatbase request failed.");
    err.code = "CHATBASE_REQUEST_FAILED";
    err.status = resp.status;
    // Do NOT attach secrets; do NOT return raw provider errors to clients.
    err.providerMessage =
      data && typeof data === "object" && typeof data.message === "string" ? data.message : null;
    throw err;
  }

  const text = data && typeof data.text === "string" ? data.text : null;
  if (!text) {
    const err = new Error("Chatbase returned an unexpected response.");
    err.code = "CHATBASE_BAD_RESPONSE";
    throw err;
  }

  return { text };
}

module.exports = { chatbaseConvert };

