const {
  validateConvertRequest,
  detectPromptInjectionIndicators,
  buildChatbaseUserMessage,
} = require("../src/convertCore");
const { chatbaseConvert } = require("../src/chatbaseClient");

const MAX_BODY_BYTES = 256 * 1024; // 256kb

// Simple in-memory rate limiting (per warm function instance, per IP).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitStore = new Map();

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

function setCors(req, res) {
  // For production, prefer setting ALLOWED_ORIGINS to a comma-separated list.
  const allowed = process.env.ALLOWED_ORIGINS;
  const origin = req.headers.origin;

  if (allowed && origin) {
    const allowList = allowed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowList.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  } else {
    // Development-friendly default (tighten in production)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJsonBody(req) {
  const contentLength = req.headers["content-length"];
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    const err = new Error("Request too large.");
    err.code = "REQUEST_TOO_LARGE";
    throw err;
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("Request too large.");
      err.code = "REQUEST_TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON.");
    err.code = "INVALID_JSON";
    throw err;
  }
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ errorCode: "METHOD_NOT_ALLOWED", message: "POST only." }));
  }

  if (!rateLimit(req)) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        errorCode: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please slow down.",
      })
    );
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    const code = e && e.code;
    res.statusCode = code === "REQUEST_TOO_LARGE" ? 413 : 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        errorCode: code || "BAD_REQUEST",
        message: "Invalid request.",
      })
    );
  }

  const errors = validateConvertRequest(body);
  if (errors.length > 0) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        errorCode: "VALIDATION_ERROR",
        message: errors.join(" "),
      })
    );
  }

  const { broker, language, code, options } = body;

  if (detectPromptInjectionIndicators(code)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        errorCode: "UNSAFE_INPUT",
        message:
          "Input appears to contain prompt-injection style instructions. Please remove such content and try again.",
      })
    );
  }

  const userMessage = buildChatbaseUserMessage({ broker, language, code, options });

  try {
    const result = await chatbaseConvert({ userMessage });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        convertedCode: result.text,
        metadata: { broker, language },
      })
    );
  } catch (e) {
    // Never leak provider details or config requirements to the client.
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        errorCode: "CONVERSION_FAILED",
        message: "Conversion service is not available. Please try again later.",
      })
    );
  }
};

