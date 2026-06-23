const appUrlInput = document.getElementById("appUrl");
const tokenInput = document.getElementById("token");
const statusEl = document.getElementById("status");
const connectButton = document.getElementById("connect");
const stopButton = document.getElementById("stop");

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
  appUrlInput.value = saved.appUrl || "http://localhost:3000";
  tokenInput.value = saved.token || "";
  const state = await chrome.runtime.sendMessage({ type: "STATUS" });
  renderStatus(state || {});
}

connectButton.addEventListener("click", async () => {
  const appUrl = appUrlInput.value.trim().replace(/\/+$/, "");
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
