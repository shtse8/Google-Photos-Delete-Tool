import './popup.css';
import { formatElapsed } from '../../core/utils';

const maxCountInput = document.getElementById('max-count') as HTMLInputElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const progressFill = document.getElementById('progress-fill')!;
const progressText = document.getElementById('progress-text')!;
const statsEl = document.getElementById('stats')!;
const noteEl = document.getElementById('note')!;

// Load saved settings
chrome.storage.local.get(['maxCount'], (data) => {
  if (data.maxCount) maxCountInput.value = String(data.maxCount);
});

const sendToContent = async (message: Record<string, unknown>): Promise<unknown> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('photos.google.com')) {
    noteEl.textContent = 'Navigate to photos.google.com first';
    return null;
  }
  noteEl.textContent = '';
  return chrome.tabs.sendMessage(tab.id, message);
};

const setRunning = (running: boolean): void => {
  startBtn.classList.toggle('hidden', running);
  stopBtn.classList.toggle('hidden', !running);
  maxCountInput.disabled = running;
};

startBtn.addEventListener('click', async () => {
  const maxCount = parseInt(maxCountInput.value, 10) || 10_000;
  chrome.storage.local.set({ maxCount });
  await sendToContent({ action: 'start', maxCount });
  setRunning(true);
});

stopBtn.addEventListener('click', async () => {
  await sendToContent({ action: 'stop' });
  setRunning(false);
});

// Check if already running
sendToContent({ action: 'status' }).then((res: unknown) => {
  if (res && (res as { running: boolean }).running) {
    setRunning(true);
  }
});

// Listen for progress updates from content script (relayed through background)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'progress') {
    const { deleted, status, startedAt } = message.data;
    const maxCount = parseInt(maxCountInput.value, 10) || 10_000;

    // Status text
    const statusMap: Record<string, string> = {
      selecting: '🔍 Selecting...',
      deleting: '🗑️ Deleting...',
      scrolling: '📜 Scrolling...',
      done: '✅ Done!',
      error: '❌ Error',
      idle: '⏸ Idle',
    };
    statusEl.textContent = statusMap[status] ?? status;
    statusEl.className = `status ${status === 'done' ? 'done' : status === 'error' ? 'error' : 'running'}`;

    // Progress bar
    const pct = Math.min(100, (deleted / maxCount) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${deleted} deleted`;

    // Stats
    if (deleted > 0 && startedAt) {
      const elapsed = Date.now() - startedAt;
      const rate = (deleted / (elapsed / 60_000)).toFixed(0);
      statsEl.textContent = `${rate}/min · ${formatElapsed(elapsed)} elapsed`;
    }

    if (status === 'done' || status === 'error') {
      setRunning(false);
    }
  }
});
