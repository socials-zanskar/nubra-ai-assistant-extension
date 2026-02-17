require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const {
  validateConvertRequest,
  validateChatRequest,
  detectPromptInjectionIndicators,
  buildChatbaseUserMessage,
  buildChatUserMessage,
} = require("./convertCore");
const { chatbaseConvert } = require("./chatbaseClient");

const app = express();

// Basic security & parsing middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // not serving HTML here; mostly JSON API
  })
);
app.use(
  express.json({
    limit: "256kb", // hard input size cap; adjust as needed
  })
);
app.use(
  cors({
    origin: "*", // for development; tighten for production
  })
);
app.use(morgan("combined"));

// Simple in-memory rate limiting (per-process, per-IP) for initial hardening.
// For production you should move this to a shared store (Redis, etc.).
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // per IP per window
const rateLimitStore = new Map();

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      errorCode: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down.",
    });
  }

  next();
}

app.use(rateLimitMiddleware);

// POST /convert
app.post("/convert", async (req, res) => {
  const errors = validateConvertRequest(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      errorCode: "VALIDATION_ERROR",
      message: errors.join(" "),
    });
  }

  const { broker, language, code, options } = req.body;

  if (detectPromptInjectionIndicators(code)) {
    return res.status(400).json({
      errorCode: "UNSAFE_INPUT",
      message:
        "Input appears to contain prompt-injection style instructions. Please remove such content and try again.",
    });
  }

  const userMessage = buildChatbaseUserMessage({ broker, language, code, options });

  try {
    const result = await chatbaseConvert({ userMessage });
    return res.json({
      convertedCode: result.text,
      metadata: {
        broker,
        language,
      },
    });
  } catch (e) {
    // Log minimal diagnostic info on the server only (no secrets).
    // This helps debugging Chatbase issues without exposing anything to clients.
    // eslint-disable-next-line no-console
    console.error(
      "[Chatbase error]",
      e && e.code,
      e && e.status,
      e && e.providerMessage ? e.providerMessage : e && e.message
    );

    // Never leak provider details or config requirements to the client.
    return res.status(500).json({
      errorCode: "CONVERSION_FAILED",
      message: "Conversion service is not available. Please try again later.",
    });
  }
});

// POST /chat
app.post("/chat", async (req, res) => {
  const errors = validateChatRequest(req.body);
  if (errors.length > 0) {
    return res.status(400).json({
      errorCode: "VALIDATION_ERROR",
      message: errors.join(" "),
    });
  }

  const { prompt } = req.body;
  if (detectPromptInjectionIndicators(prompt)) {
    return res.status(400).json({
      errorCode: "UNSAFE_INPUT",
      message:
        "Input appears to contain prompt-injection style instructions. Please remove such content and try again.",
    });
  }

  try {
    const result = await chatbaseConvert({ userMessage: buildChatUserMessage(prompt) });
    return res.json({ answer: result.text });
  } catch (e) {
    return res.status(500).json({
      errorCode: "CHAT_FAILED",
      message: "Chat service is not available. Please try again later.",
    });
  }
});

// Basic health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Nubra SDK Converter backend listening on port ${port}`);
});
