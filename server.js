const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Cross-platform yt-dlp binary ─────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';
const BINARY_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const BINARY_URL  = IS_WIN
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const YTDLP_PATH = path.join(__dirname, BINARY_NAME);

// ── Download yt-dlp binary from GitHub if not present ───────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (location) => {
      https.get(location, { headers: { 'User-Agent': 'node' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${location}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
      }).on('error', reject);
    };
    request(url);
  });
}

async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log(`✅ ${BINARY_NAME} found`);
    return;
  }
  console.log(`⬇  Downloading ${BINARY_NAME} from GitHub...`);
  await downloadFile(BINARY_URL, YTDLP_PATH);
  // Make executable on Linux/Mac
  if (!IS_WIN) fs.chmodSync(YTDLP_PATH, '755');
  console.log(`✅ ${BINARY_NAME} ready`);
}

// ── Run yt-dlp --dump-json and return parsed result ──────────────────────────
function ytdlpJSON(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `yt-dlp exited ${code}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
    });
    proc.on('error', reject);
  });
}

// ── Format seconds → "H:MM:SS" ──────────────────────────────────────────────
function fmtDuration(sec) {
  if (!sec) return 'Unknown';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ── Quality presets (progressive mp4, no ffmpeg needed) ─────────────────────
const QUALITY_PRESETS = [
  { label: 'Best',  selector: 'best[ext=mp4]/best' },
  { label: '1080p', selector: 'best[height<=1080][ext=mp4]/best[height<=1080]' },
  { label: '720p',  selector: 'best[height<=720][ext=mp4]/best[height<=720]' },
  { label: '480p',  selector: 'best[height<=480][ext=mp4]/best[height<=480]' },
  { label: '360p',  selector: 'best[height<=360][ext=mp4]/best[height<=360]' },
];

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/info?url= ───────────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const info = await ytdlpJSON([
      '--dump-json',
      '--no-playlist',
      '--skip-download',
      url,
    ]);

    res.json({
      title:     info.title,
      author:    info.uploader || info.channel || 'Unknown',
      duration:  fmtDuration(info.duration),
      thumbnail: info.thumbnail,
      views:     (info.view_count || 0).toLocaleString(),
      formats:   QUALITY_PRESETS,
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: 'Could not fetch video info. It may be private or unavailable.' });
  }
});

// ── GET /api/download?url=&selector=&title= ──────────────────────────────────
app.get('/api/download', (req, res) => {
  const { url, selector, title } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Sanitise filename — keep only safe ASCII chars
  const safeTitle = (title || 'video')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim() || 'video';

  const fmt = selector || 'best[ext=mp4]/best';

  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp4"`);
  res.setHeader('Content-Type', 'video/mp4');

  const args = ['-f', fmt, '--no-playlist', '-o', '-', url];
  const proc = spawn(YTDLP_PATH, args);

  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trimEnd()));
  proc.on('error', (err) => {
    console.error('Spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed to start.' });
  });
  proc.on('close', (code) => {
    if (code !== 0) console.warn(`[yt-dlp] exited with code ${code}`);
  });

  req.on('close', () => proc.kill('SIGTERM'));
});

// ── Fallback → SPA ───────────────────────────────────────────────────────────
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── Boot ─────────────────────────────────────────────────────────────────────
ensureYtDlp()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`\n🚀  YouTube Downloader → http://localhost:${PORT}\n`)
    );
  })
  .catch((err) => {
    console.error('❌  Failed to initialise yt-dlp:', err.message);
    process.exit(1);
  });
