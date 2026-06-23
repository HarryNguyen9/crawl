const appUrlInput = document.getElementById("appUrl");
const tokenInput = document.getElementById("token");
const statusEl = document.getElementById("status");
const connectButton = document.getElementById("connect");
const stopButton = document.getElementById("stop");
const DEFAULT_WEB_APP_URL = "https://crawl-pi.vercel.app";

function normalizeAppUrl(value) {
  return (value || DEFAULT_WEB_APP_URL).trim().replace(/\/+$/, "");
}

function renderStatus(state) {
  statusEl.textContent = [
    `Status: ${state.enabled ? "connected" : "disconnected"}`,
    `Login: ${state.loginRequired ? "login required" : "ok/unchecked"}`,
    `Client: ${state.clientId || "-"}`,
    `Current: ${state.currentLink || "-"}`,
    `Last heartbeat: ${state.lastHeartbeat || "-"}`,
    `Message: ${state.statusMessage || "-"}`
  ].join("\n");
}

async function loadState() {
  const saved = await chrome.storage.local.get(["appUrl", "token"]);
  appUrlInput.value = saved.appUrl || DEFAULT_WEB_APP_URL;
  tokenInput.value = saved.token || "";
  const state = await chrome.runtime.sendMessage({ type: "STATUS" });
  renderStatus(state || {});
}

connectButton.addEventListener("click", async () => {
  const appUrl = normalizeAppUrl(appUrlInput.value);
  const token = tokenInput.value.trim();
  await chrome.storage.local.set({ appUrl, token });
  const state = await chrome.runtime.sendMessage({ type: "CONNECT", appUrl, token });
  renderStatus(state || {});
});

stopButton.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "STOP" });
  renderStatus(state || {});
});

void loadState();
