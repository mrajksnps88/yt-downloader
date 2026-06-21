// ── State ────────────────────────────────────────────────────────────────────
let currentVideoData = null;
let selectedSelector = null;
let selectedLabel    = null;
let currentPlatform  = 'youtube';

// ── Quality presets per platform ─────────────────────────────────────────────
const PRESETS = {
  youtube: [
    { label: 'Best',  selector: 'best[ext=mp4]/best' },
    { label: '1080p', selector: 'best[height<=1080][ext=mp4]/best[height<=1080]' },
    { label: '720p',  selector: 'best[height<=720][ext=mp4]/best[height<=720]' },
    { label: '480p',  selector: 'best[height<=480][ext=mp4]/best[height<=480]' },
    { label: '360p',  selector: 'best[height<=360][ext=mp4]/best[height<=360]' },
  ],
  instagram: [
    { label: 'Best Quality', selector: 'best[ext=mp4]/best' },
  ],
  tiktok: [
    { label: 'Best Quality', selector: 'best[ext=mp4]/best' },
  ],
};

// ── Placeholders ─────────────────────────────────────────────────────────────
const PLACEHOLDERS = {
  youtube:   'https://www.youtube.com/watch?v=...',
  instagram: 'https://www.instagram.com/reel/...',
  tiktok:    'https://www.tiktok.com/@.../video/...',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const urlInput   = document.getElementById('url-input');
const fetchBtn   = document.getElementById('fetch-btn');
const btnText    = fetchBtn.querySelector('.btn-text');
const btnLoader  = fetchBtn.querySelector('.btn-loader');
const errorBanner  = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const videoCard    = document.getElementById('video-card');

// ── Platform switcher ─────────────────────────────────────────────────────────
function switchPlatform(platform) {
  currentPlatform = platform;

  // Update tabs
  document.getElementById('tab-youtube').classList.toggle('active', platform === 'youtube');
  document.getElementById('tab-instagram').classList.toggle('active', platform === 'instagram');
  document.getElementById('tab-tiktok').classList.toggle('active', platform === 'tiktok');

  // Update body class for CSS theming
  document.body.classList.remove('instagram-mode', 'tiktok-mode');
  if (platform !== 'youtube') {
    document.body.classList.add(`${platform}-mode`);
  }

  // Update placeholder
  urlInput.placeholder = PLACEHOLDERS[platform];

  // Reset state
  hideError();
  videoCard.classList.add('hidden');
  urlInput.value = '';
  currentVideoData = null;
}

// Auto-detect platform from pasted URL
function detectPlatform(url) {
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return null;
}

// ── Event listeners ───────────────────────────────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

urlInput.addEventListener('input', () => {
  const detected = detectPlatform(urlInput.value.trim());
  if (detected && detected !== currentPlatform) {
    switchPlatform(detected);
    urlInput.value = urlInput.value; // keep typed value after switch
  }
});

// Auto-paste from clipboard on focus if empty
urlInput.addEventListener('focus', async () => {
  if (urlInput.value.trim()) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && (text.includes('youtube.com') || text.includes('youtu.be') || text.includes('instagram.com') || text.includes('tiktok.com'))) {
      urlInput.value = text;
      const detected = detectPlatform(text);
      if (detected && detected !== currentPlatform) switchPlatform(detected);
    }
  } catch (_) { /* clipboard denied, ignore */ }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(loading) {
  fetchBtn.disabled = loading;
  btnText.classList.toggle('hidden', loading);
  btnLoader.classList.toggle('hidden', !loading);
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  videoCard.classList.add('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

// ── Fetch video info ──────────────────────────────────────────────────────────
async function fetchVideoInfo() {
  const url = urlInput.value.trim();
  if (!url) {
    let platformName = 'YouTube';
    if (currentPlatform === 'instagram') platformName = 'Instagram';
    if (currentPlatform === 'tiktok') platformName = 'TikTok';
    showError(`Please paste a ${platformName} video URL first.`);
    return;
  }

  hideError();
  setLoading(true);
  videoCard.classList.add('hidden');

  try {
    const res  = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to fetch video info.');
      return;
    }

    // Override formats with platform-specific presets
    data.formats = PRESETS[currentPlatform];
    currentVideoData = data;
    renderVideoCard(data);
  } catch (err) {
    showError('Network error. Make sure the server is running.');
  } finally {
    setLoading(false);
  }
}

// ── Render video card ─────────────────────────────────────────────────────────
function renderVideoCard(data) {
  document.getElementById('video-thumbnail').src = data.thumbnail || '';
  document.getElementById('video-title').textContent = data.title;
  document.getElementById('author-text').textContent = data.author;
  document.getElementById('duration-text').textContent = data.duration;
  document.getElementById('views-text').textContent = data.views ? `${data.views} views` : '';

  // Render quality options
  const grid = document.getElementById('quality-grid');
  grid.innerHTML = '';
  selectedSelector = null;
  selectedLabel    = null;

  data.formats.forEach((fmt, i) => {
    const id  = `quality-${i}`;
    const div = document.createElement('div');
    div.className = 'quality-option';

    const input = document.createElement('input');
    input.type  = 'radio';
    input.name  = 'quality';
    input.id    = id;
    input.value = fmt.selector;
    input.addEventListener('change', () => {
      selectedSelector = fmt.selector;
      selectedLabel    = fmt.label;
      updateDownloadBtn(fmt.label);
    });

    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `<span class="quality-badge">${fmt.label}</span>`;

    div.appendChild(input);
    div.appendChild(label);
    grid.appendChild(div);

    if (i === 0) {
      input.checked    = true;
      selectedSelector = fmt.selector;
      selectedLabel    = fmt.label;
      updateDownloadBtn(fmt.label);
    }
  });

  videoCard.classList.remove('hidden');
  videoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateDownloadBtn(label) {
  document.getElementById('download-btn-text').textContent = `Download ${label || 'Video'}`;
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadVideo() {
  if (!currentVideoData) return;

  const params = new URLSearchParams({
    url:      urlInput.value.trim(),
    selector: selectedSelector || 'best[ext=mp4]/best',
    title:    currentVideoData.title,
  });

  const a = document.createElement('a');
  a.href = `/api/download?${params.toString()}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Brief success flash
  const btn    = document.getElementById('download-btn');
  const btnTxt = document.getElementById('download-btn-text');
  btnTxt.textContent  = '⬇ Download Started!';
  btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
  setTimeout(() => {
    btn.style.background = '';
    updateDownloadBtn(selectedLabel || 'Video');
  }, 3000);
}


// ── Web Loading Screen Fade-out ──────────────────────────────────────────────
window.addEventListener('load', () => {
  const loadingScreen = document.getElementById('web-loading-screen');
  if (loadingScreen) {
    // Add a tiny delay to ensure a smooth transition
    setTimeout(() => {
      loadingScreen.style.opacity = '0';
      loadingScreen.style.visibility = 'hidden';
      // Remove from DOM after fade transition completes
      setTimeout(() => {
        if (loadingScreen.parentNode) {
          loadingScreen.parentNode.removeChild(loadingScreen);
        }
      }, 500);
    }, 200);
  }

  // Hide the App Download button if we are already inside the Android App (WebView)
  // Android WebViews typically include "wv" in their user agent string.
  const isAndroidWebView = /Android.*wv/.test(navigator.userAgent);
  if (isAndroidWebView) {
    const downloadZone = document.querySelector('.app-download-zone');
    if (downloadZone) {
      downloadZone.style.display = 'none';
  }
});

// ── PWA & Service Worker Logic ───────────────────────────────────────────────
let deferredPrompt;
const pwaPopup = document.getElementById('pwa-install-popup');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');
const pwaDescText = document.getElementById('pwa-desc-text');

// 1. Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed: ', err);
    });
  });
}

// Detect if app is already installed
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// Detect iOS Safari
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

// 2. Handle Android / Chrome install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show our custom Cyberpunk popup (if not already installed)
  if (!isStandalone) {
    setTimeout(() => {
      pwaPopup.style.display = 'flex';
    }, 2000); // Wait 2s before showing to not overwhelm user
  }
});

// 3. Handle iOS specific prompt (no automatic event available)
if (isIos() && !isStandalone) {
  // Wait a few seconds, then show instructions
  setTimeout(() => {
    pwaDescText.innerHTML = 'Install to home screen: Tap <b>Share 📤</b> below and select <b>Add to Home Screen ➕</b>';
    pwaInstallBtn.style.display = 'none'; // iOS has no install button, just instructions
    pwaPopup.style.display = 'flex';
  }, 3000);
}

// 4. Button Click Handlers
if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
    pwaPopup.style.display = 'none';
    if (deferredPrompt) {
      // Show the native install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
    }
  });
}

if (pwaDismissBtn) {
  pwaDismissBtn.addEventListener('click', () => {
    pwaPopup.style.display = 'none';
  });
}
