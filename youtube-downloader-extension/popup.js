// ── Globals ──────────────────────────────────────────────────────────────────
let downloadType = "video"; // 'video' or 'audio'

// ── UI Helpers ────────────────────────────────────────────────────────────────
function setType(type) {
  downloadType = type;
  const btnVideo = document.getElementById("btnVideo");
  const btnAudio = document.getElementById("btnAudio");
  const qualitySelect = document.getElementById("qualitySelect");

  if (type === "audio") {
    btnAudio.classList.add("active");
    btnVideo.classList.remove("active");
    document.querySelector(".quality-section").style.display = "none";
  } else {
    btnVideo.classList.add("active");
    btnAudio.classList.remove("active");
    document.querySelector(".quality-section").style.display = "block";
    qualitySelect.innerHTML = `
      <option value="best">High Quality</option>
      <option value="worst">Low Quality</option>
    `;
  }
}

function showStatus(type, message) {
  const statusDiv = document.getElementById("status");
  statusDiv.style.display = "block";
  statusDiv.textContent = message;

  // Basic inline styles for status
  statusDiv.style.padding = "10px";
  statusDiv.style.borderRadius = "8px";
  statusDiv.style.marginTop = "10px";
  statusDiv.style.fontSize = "13px";

  if (type === "loading") {
    statusDiv.style.background = "rgba(255, 255, 255, 0.1)";
    statusDiv.style.color = "#aaa";
    statusDiv.style.border = "1px solid #444";
  } else if (type === "success") {
    statusDiv.style.background = "rgba(0, 255, 0, 0.1)";
    statusDiv.style.color = "#2ecc71";
    statusDiv.style.border = "1px solid #27ae60";
  } else if (type === "error") {
    statusDiv.style.background = "rgba(255, 0, 0, 0.1)";
    statusDiv.style.color = "#e74c3c";
    statusDiv.style.border = "1px solid #c0392b";
  } else if (type === "warning") {
    statusDiv.style.background = "rgba(255, 165, 0, 0.1)";
    statusDiv.style.color = "#f39c12";
    statusDiv.style.border = "1px solid #e67e22";
  }
}

// ── Core Logic ──────────────────────────────────────────────────────────────
async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const display = document.getElementById("urlDisplay");
  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    display.textContent = tab.url;
    display.style.color = "#fff";
  } else {
    display.textContent = "Please open a YouTube video or Short";
    display.style.color = "#888";
  }
}

async function checkServer() {
  const dot = document.getElementById("serverDot");
  try {
    const res = await fetch("http://localhost:7777/ping");
    if (res.ok) {
      dot.style.background = "#2ecc71";
      dot.style.boxShadow = "0 0 8px #2ecc71";
    }
  } catch (e) {
    dot.style.background = "#e74c3c";
    dot.style.boxShadow = "0 0 8px #e74c3c";
  }
}

async function startDownload() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const isVideo = tab.url.includes("youtube.com/watch");
  const isShort = tab.url.includes("youtube.com/shorts");

  if (!isVideo && !isShort) {
    showStatus("error", "❌ Please open a YouTube Video or Short first.");
    return;
  }

  const btn = document.getElementById("downloadBtn");
  const format = document.getElementById("qualitySelect").value;

  // ── Aggressive URL Cleaning ──
  let cleanUrl = tab.url;
  try {
    const urlObj = new URL(tab.url);
    if (isShort) {
      // Convert to regular watch URL for better backend compatibility
      const videoId = urlObj.pathname.split("/").pop();
      cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      // Regular video ID
      const videoId = urlObj.searchParams.get("v");
      if (videoId) cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }
    console.log("🚀 Sending Clean URL to backend:", cleanUrl);
  } catch (e) {
    console.error("URL parsing error:", e);
  }

  // ── Show progress UI ──
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  showStatus("loading", "Starting download...");

  // ── Start Polling ──
  const pollInterval = setInterval(async () => {
    try {
      const pRes = await fetch(`http://localhost:7777/progress?url=${encodeURIComponent(cleanUrl)}`);
      const pData = await pRes.json();

      if (pData.status === "downloading" || pData.status === "complete") {
        const p = pData.percent || 0;
        progressBar.style.width = `${p}%`;
        progressPercent.textContent = `${p}%`;
      }

      if (pData.status === "complete" || pData.status === "error") {
        clearInterval(pollInterval);
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, 1000);

  try {
    btn.disabled = true;
    btn.textContent = "⏳ Downloading...";
    showStatus("loading", "Starting download...");

    const res = await fetch("http://localhost:7777/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: cleanUrl, format, type: downloadType })
    });

    clearInterval(pollInterval);

    const data = await res.json();
    btn.disabled = false;
    btn.textContent = "⬇ Download Now";

    if (res.ok && data.success) {
      progressBar.style.width = "100%";
      progressPercent.textContent = "100%";
      showStatus("success", "Download complete! Check your 'downloads' folder.");
    } else {
      progressContainer.style.display = "none";
      showStatus("error", `❌ ${data.error || "Download failed."}`);
    }
  } catch (err) {
    clearInterval(pollInterval);
    btn.disabled = false;
    btn.textContent = "⬇ Download Now";
    progressContainer.style.display = "none";
    showStatus("error", "❌ Backend is offline. Run 'node server.js' first.");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadTab();
checkServer();

// ── Event Listeners (Required for Manifest V3) ───────────────────────────────
document.getElementById("btnVideo").addEventListener("click", () => setType("video"));
document.getElementById("btnAudio").addEventListener("click", () => setType("audio"));
document.getElementById("downloadBtn").addEventListener("click", startDownload);
