// NOTE:
// - This script never holds API keys or Chatbase details.
// - It only calls a Nubra backend URL, which must be configured separately.

// Placeholder to be wired to your actual backend base URL (e.g. https://api.yourdomain.com)
// Do NOT put secrets here. We will decide together how to inject the real value.
const BACKEND_BASE_URL = "__NUBRA_BACKEND_URL__";
const CONVERT_ENDPOINT_PATH = "/convert";

const MAX_CODE_LENGTH_CHARS = 20000; // basic UX guard; backend will enforce its own limits

document.addEventListener("DOMContentLoaded", () => {
  const brokerSelect = document.getElementById("brokerSelect");
  const languageSelect = document.getElementById("languageSelect");
  const inputCode = document.getElementById("inputCode");
  const outputCode = document.getElementById("outputCode");
  const convertButton = document.getElementById("convertButton");
  const copyButton = document.getElementById("copyButton");
  const statusMessage = document.getElementById("statusMessage");

  const optStrictSemantics = document.getElementById("optStrictSemantics");
  const optAddRiskChecks = document.getElementById("optAddRiskChecks");
  const optExplainChanges = document.getElementById("optExplainChanges");

  function setStatus(message, type = "") {
    statusMessage.textContent = message || "";
    statusMessage.className = "status-message" + (type ? ` ${type}` : "");
  }

  async function handleConvertClicked() {
    const broker = brokerSelect.value;
    const language = languageSelect.value;
    const code = inputCode.value || "";

    setStatus("", "");

    if (!broker) {
      setStatus("Please select a broker.", "error");
      return;
    }
    if (!language) {
      setStatus("Please select a language.", "error");
      return;
    }
    if (!code.trim()) {
      setStatus("Please paste some broker code to convert.", "error");
      return;
    }
    if (code.length > MAX_CODE_LENGTH_CHARS) {
      setStatus("Code is too large for the extension. Please trim it and try again.", "error");
      return;
    }

    if (!BACKEND_BASE_URL || BACKEND_BASE_URL === "__NUBRA_BACKEND_URL__") {
      setStatus(
        "Backend URL is not configured. Please set BACKEND_BASE_URL in the extension code/build.",
        "error"
      );
      return;
    }

    const options = {
      strictSemantics: !!optStrictSemantics?.checked,
      addRiskChecks: !!optAddRiskChecks?.checked,
      explainChanges: !!optExplainChanges?.checked,
    };

    const payload = {
      broker,
      language,
      code,
      options,
    };

    const url = BACKEND_BASE_URL.replace(/\/+$/, "") + CONVERT_ENDPOINT_PATH;

    convertButton.disabled = true;
    setStatus("Converting via Nubra backend…", "");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          data && data.message
            ? data.message
            : `Conversion failed with status ${response.status}.`;
        setStatus(message, "error");
        outputCode.value = "";
        return;
      }

      if (!data || typeof data.convertedCode !== "string") {
        setStatus("Backend responded without convertedCode field.", "error");
        outputCode.value = "";
        return;
      }

      outputCode.value = data.convertedCode;
      setStatus("Conversion completed.", "success");
    } catch (err) {
      console.error("Conversion error", err);
      setStatus("Unexpected error calling backend. Please try again.", "error");
      outputCode.value = "";
    } finally {
      convertButton.disabled = false;
    }
  }

  async function handleCopyClicked() {
    const text = outputCode.value || "";
    if (!text.trim()) {
      setStatus("Nothing to copy.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied Nubra SDK code to clipboard.", "success");
    } catch (err) {
      console.error("Clipboard error", err);
      setStatus("Failed to copy to clipboard.", "error");
    }
  }

  convertButton.addEventListener("click", () => {
    handleConvertClicked();
  });

  copyButton.addEventListener("click", () => {
    handleCopyClicked();
  });
});

