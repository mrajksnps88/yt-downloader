// State
let currentVideoData = null;
let selectedSelector = null;
let selectedLabel = null;

// DOM references
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const btnText = fetchBtn.querySelector('.btn-text');
const btnLoader = fetchBtn.querySelector('.btn-loader');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const videoCard = document.getElementById('video-card');

// Allow pressing Enter to fetch
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

// Auto-paste from clipboard on focus if empty
urlInput.addEventListener('focus', async () => {
  if (urlInput.value.trim()) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
      urlInput.value = text;
    }
  } catch (_) { /* clipboard permission denied, ignore */ }
});

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

async function fetchVideoInfo() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please paste a YouTube video URL first.');
    return;
  }

  hideError();
  setLoading(true);
  videoCard.classList.add('hidden');

  try {
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to fetch video info.');
      return;
    }

    currentVideoData = data;
    renderVideoCard(data);
  } catch (err) {
    showError('Network error. Make sure the server is running.');
  } finally {
    setLoading(false);
  }
}

function renderVideoCard(data) {
  document.getElementById('video-thumbnail').src = data.thumbnail;
  document.getElementById('video-title').textContent = data.title;
  document.getElementById('author-text').textContent = data.author;
  document.getElementById('duration-text').textContent = data.duration;
  document.getElementById('views-text').textContent = `${data.views} views`;

  // Render quality options
  const grid = document.getElementById('quality-grid');
  grid.innerHTML = '';
  selectedSelector = null;
  selectedLabel = null;

  if (!data.formats || data.formats.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No formats available.</p>';
  } else {
    data.formats.forEach((fmt, i) => {
      const id = `quality-${i}`;
      const div = document.createElement('div');
      div.className = 'quality-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'quality';
      input.id = id;
      input.value = fmt.selector;
      input.addEventListener('change', () => {
        selectedSelector = fmt.selector;
        selectedLabel = fmt.label;
        updateDownloadBtn(fmt.label);
      });

      const label = document.createElement('label');
      label.htmlFor = id;
      label.innerHTML = `<span class="quality-badge">${fmt.label}</span>`;

      div.appendChild(input);
      div.appendChild(label);
      grid.appendChild(div);

      // Auto-select first
      if (i === 0) {
        input.checked = true;
        selectedSelector = fmt.selector;
        selectedLabel = fmt.label;
        updateDownloadBtn(fmt.label);
      }
    });
  }

  videoCard.classList.remove('hidden');
  videoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateDownloadBtn(label) {
  document.getElementById('download-btn-text').textContent = `Download ${label || 'Video'}`;
}

function downloadVideo() {
  if (!currentVideoData) return;

  const url = urlInput.value.trim();
  const params = new URLSearchParams({
    url,
    selector: selectedSelector || 'best[ext=mp4]/best',
    title: currentVideoData.title,
  });

  const a = document.createElement('a');
  a.href = `/api/download?${params.toString()}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Brief success feedback
  const btn = document.getElementById('download-btn');
  const btnTxt = document.getElementById('download-btn-text');
  btnTxt.textContent = '⬇ Download Started!';
  btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
  setTimeout(() => {
    btn.style.background = '';
    updateDownloadBtn(selectedLabel || 'Video');
  }, 3000);
}
