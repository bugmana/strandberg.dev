import { SIGNED_URL_ENDPOINT, MOCK_UPLOAD } from './config.js';
import { getIdToken } from './auth.js';
import { updateProgress, escapeHtml, formatHttpError } from './utils.js';
import { simulateMockPoll } from './mock.js';

// Metadata polling configuration
const POLL_INTERVAL_MOCK = 1000;
const POLL_INTERVAL_LIVE = 15000;
const MAX_POLL_ATTEMPTS_MOCK = 2;
const MAX_POLL_ATTEMPTS_LIVE = 4;
const RESET_UI_DELAY = 2000;

export function showMetadata(metadata) {
  const raw = escapeHtml(JSON.stringify(metadata, null, 2));
  const resultTextEl = document.getElementById('resultText');
  const parent = resultTextEl ? resultTextEl.parentNode : document.getElementById('result');

  if (!parent) {
    const metaDiv = document.getElementById('metadataDisplay');
    if (metaDiv) {
      metaDiv.innerHTML = `<div id="rawMetadata" class="metadata-json-container"><pre class="metadata-json">${raw}</pre></div>`;
      metaDiv.classList.remove('hidden');
    }
    return;
  }

  let rawEl = parent.querySelector('#rawMetadata');
  if (!rawEl) {
    rawEl = document.createElement('div');
    rawEl.id = 'rawMetadata';
    rawEl.className = 'metadata-json-container';
    parent.appendChild(rawEl);
  }
  rawEl.innerHTML = `<pre class="metadata-json">${raw}</pre>`;
}

export function beginMetadataWait(file) {
  const metaDiv = document.getElementById('metadataDisplay');
  if (metaDiv) {
    metaDiv.classList.add('hidden');
    metaDiv.innerHTML = '';
  }

  let pollAttempts = 0;
  const pollInterval = MOCK_UPLOAD ? POLL_INTERVAL_MOCK : POLL_INTERVAL_LIVE;
  const maxAttempts = MOCK_UPLOAD ? MAX_POLL_ATTEMPTS_MOCK : MAX_POLL_ATTEMPTS_LIVE;
  let polling = true;

  const elements = {
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    resultText: document.getElementById('resultText'),
    uploadButton: document.getElementById('uploadButton'),
    videoInput: document.getElementById('videoInput'),
  };

  updateProgress(
    elements.progressBar,
    elements.progressText,
    100,
    `Waiting for metadata... (${pollInterval / 1000}s)`
  );
  if (elements.resultText) {
    elements.resultText.innerHTML = `<span>Waiting for metadata... (${pollInterval / 1000}s)</span>`;
  }

  setTimeout(pollForMetadata, pollInterval);

  async function pollForMetadata() {
    if (!polling) {
      return;
    }

    pollAttempts++;
    if (pollAttempts > maxAttempts) {
      showError('✗ Timed out waiting for metadata.');
      return;
    }

    updateProgress(
      elements.progressBar,
      elements.progressText,
      100,
      `Waiting for metadata... (poll ${pollAttempts}/${maxAttempts})`
    );
    if (elements.resultText) {
      elements.resultText.innerHTML = `<span>Waiting for metadata... (poll ${pollAttempts}/${maxAttempts})</span>`;
    }

    try {
      const response = await fetchMetadata();

      if (response.status === 200) {
        await handleSuccess(response);
      } else if (response.status !== 202) {
        const errorMsg = await formatHttpError(response);
        showError(`✗ ${escapeHtml(errorMsg)}`);
        console.error('Metadata fetch returned error status', response.status, response.statusText);
      } else if (pollAttempts < maxAttempts) {
        setTimeout(pollForMetadata, pollInterval);
      } else {
        showError('✗ Timed out waiting for metadata.');
      }
    } catch (err) {
      console.error('Error fetching metadata', err);
      const message = err?.message ? escapeHtml(err.message) : escapeHtml(String(err));
      showError(`✗ ${message}`);
    }
  }

  async function fetchMetadata() {
    if (MOCK_UPLOAD) {
      return simulateMockPoll(pollAttempts, file);
    }

    const token = getIdToken();
    const url = `${SIGNED_URL_ENDPOINT}?filename=${encodeURIComponent(file.name)}`;
    // eslint-disable-next-line no-console
    console.info('Fetching metadata for', file.name, 'url=', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    // eslint-disable-next-line no-console
    console.info('Received metadata fetch response', response.status, response.statusText);
    return response;
  }

  async function handleSuccess(response) {
    const metadata = await response.json();
    if (elements.resultText) {
      elements.resultText.innerHTML = '';
    }
    showMetadata(metadata);
    polling = false;

    setTimeout(() => {
      if (elements.videoInput) {
        elements.videoInput.value = '';
      }
      if (elements.uploadButton) {
        elements.uploadButton.disabled = true;
      }

      const fileInfo = document.getElementById('fileInfo');
      if (fileInfo) {
        fileInfo.innerHTML = '';
      }

      if (elements.progressBar) {
        elements.progressBar.style.width = '0%';
      }
      if (elements.progressText) {
        elements.progressText.textContent = '0%';
      }
    }, RESET_UI_DELAY);
  }

  function showError(message) {
    if (elements.resultText) {
      elements.resultText.innerHTML = `<span class="error">${message}</span>`;
    }
    polling = false;
    if (elements.uploadButton && elements.videoInput) {
      elements.uploadButton.disabled = !(
        elements.videoInput.files.length &&
        (getIdToken() || MOCK_UPLOAD)
      );
    }
  }
}
