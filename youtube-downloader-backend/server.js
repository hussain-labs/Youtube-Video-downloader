const express = require("express");
const cors = require("cors");
const youtubedl = require("yt-dlp-exec");
const path = require("path");
const fs = require("fs");

// ─── Never silently crash ────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

const app = express();
app.use(cors());
app.use(express.json());

// Auto-create downloads folder
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// ── Progress Tracker ──────────────────────────────────────────────────────────
let downloadProgress = {}; // Store progress by URL

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 Health Check (Ping) received`);
  res.json({ status: "ok" });
});

// ── Get Progress ──────────────────────────────────────────────────────────────
app.get("/progress", (req, res) => {
  const { url } = req.query;
  res.json(downloadProgress[url] || { percent: 0, status: "waiting" });
});

// ── Download ──────────────────────────────────────────────────────────────────
app.post("/download", async (req, res) => {
  const { url, type, format, overwriteAction } = req.body;

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  downloadProgress[url] = { percent: 0, status: "starting" };

  try {
    // 1. Get metadata
    console.log(`[${new Date().toLocaleTimeString()}] 🔍 Fetching details...`);
    const meta = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, extractorArgs: 'youtube:player-client=android' });
    const title = meta.title.replace(/[\\\/:*?"<>|]/g, ""); // Clean title

    // 💡 Determine the label for the filename
    let resLabel = "High Quality";
    if (type === "audio") {
      resLabel = "audio";
    } else if (format === "worst") {
      resLabel = "Low Quality";
    }

    console.log("\n" + "═".repeat(50));
    console.log(`[${new Date().toLocaleTimeString()}] 📥 NEW DOWNLOAD REQUEST`);
    console.log(`    🎬 Title: ${title}`);
    console.log(`    📊 Quality: ${resLabel}`);
    console.log("═".repeat(50));

    // 2. Prepare yt-dlp options
    const outputPath = path.join(downloadsDir, `%(title)s [${resLabel}].%(ext)s`);

    let options = {
      output: outputPath,
      noPlaylist: true,
      noUpdate: true,
      noCheckCertificates: true,
      noCacheDir: true,
      extractorArgs: 'youtube:player-client=android',
    };

    if (type === "audio") {
      options.format = "best";
    } else {
      options.format = format || "best";
    }

    console.log("⚙️  Starting yt-dlp...");
    const ytProcess = youtubedl.exec(url, options);

    ytProcess.stdout.on("data", (data) => {
      const line = data.toString();
      // Match percentage like " 45.3%"
      const match = line.match(/(\d+\.\d+)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        downloadProgress[url] = { percent, status: "downloading" };
        process.stdout.write(`\r🚀 Progress: ${percent}%   `);
      }
    });

    await ytProcess;

    // ── 💡 NEW: Rename video file to MP3 if audio was requested ──
    if (type === "audio") {
      try {
        const files = fs.readdirSync(downloadsDir);
        // Find the latest file created in the last 10 seconds
        const now = Date.now();
        const latestFile = files
          .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
          .filter(f => now - f.time < 10000)
          .sort((a, b) => b.time - a.time)[0];

        if (latestFile && !latestFile.name.endsWith(".mp3")) {
          const oldPath = path.join(downloadsDir, latestFile.name);
          const newPath = oldPath.replace(/\.[^/.]+$/, ".mp3");
          fs.renameSync(oldPath, newPath);
          console.log(`[${new Date().toLocaleTimeString()}] 📝 Auto-renamed to MP3: ${path.basename(newPath)}`);
        }
      } catch (renameErr) {
        console.error("Warning: Could not rename file to .mp3", renameErr.message);
      }
    }

    console.log(`\n[${new Date().toLocaleTimeString()}] ✅ DOWNLOAD SUCCESSFUL: ${url}`);
    downloadProgress[url] = { percent: 100, status: "complete" };

    res.json({
      success: true,
      message: "Download complete. Check the downloads folder.",
      path: downloadsDir
    });

  } catch (err) {
    const errMsg = err.stderr || err.message || String(err);
    console.error("\n❌  yt-dlp FAILED:");
    console.error(errMsg);
    downloadProgress[url] = { percent: 0, status: "error", error: errMsg };

    res.status(500).json({
      error: errMsg.length > 300 ? errMsg.substring(0, 300) + "..." : errMsg
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 7777;
const server = app.listen(PORT, () => {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅  YouTube Downloader Backend — RUNNING");
  console.log("🌐  http://localhost:" + PORT);
  console.log("📁  Downloads →", downloadsDir);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use!`);
    console.error(`    Run: lsof -ti:${PORT} | xargs kill -9\n`);
  } else {
    console.error("❌  Server error:", err.message);
  }
  process.exit(1);
});

// Keep alive
setInterval(() => { }, 30000);
