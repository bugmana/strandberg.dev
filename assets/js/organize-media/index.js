import { CLIENT_ID, MOCK_UPLOAD, ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES } from './config.js';
import {
  setCookie,
  setIdTokenCookie,
  getCookie,
  getIdToken,
  showSignedIn,
  signOut,
} from './auth.js';
import { escapeHtml, updateProgress } from './utils.js';
import { getSignedUrl, uploadToSignedUrl } from './upload.js';
import { beginMetadataWait, showMetadata } from './metadata.js';
import { runMockUpload } from './mock.js';

window.showMetadata = function (metadata) {
  if (typeof window.__realShowMetadata === 'function') {
    window.__realShowMetadata(metadata);
    return;
  }
  const resultTextEl = document.getElementById('resultText');
  const raw = escapeHtml(JSON.stringify(metadata, null, 2));
  const html = `<pre class="metadata-json">${raw}</pre>`;
  if (resultTextEl) {
    resultTextEl.innerHTML = '';
    const parent = resultTextEl.parentNode;
    if (parent) {
      let rawEl = document.getElementById('rawMetadata');
      if (!rawEl) {
        rawEl = document.createElement('div');
        rawEl.id = 'rawMetadata';
        rawEl.className = 'metadata-json-container';
        parent.appendChild(rawEl);
      }
      rawEl.innerHTML = html;
    } else {
      resultTextEl.innerHTML = html;
    }
  } else {
    const metaDiv = document.getElementById('metadataDisplay');
    if (metaDiv) {
      metaDiv.innerHTML = `<div class="metadata-json-container">${html}</div>`;
      metaDiv.classList.remove('hidden');
    }
  }
};

window.onload = function () {
  // Make MOCK_UPLOAD available globally for auth.js
  window.MOCK_UPLOAD = MOCK_UPLOAD;

  // Cache DOM elements
  const elements = {
    banner: document.getElementById('mockBanner'),
    bannerMsg: document.getElementById('mockBannerMessage'),
    bannerSignout: document.getElementById('bannerSignout'),
    uploadButton: document.getElementById('uploadButton'),
    videoInput: document.getElementById('videoInput'),
    fileInfo: document.getElementById('fileInfo'),
    resultText: document.getElementById('resultText'),
    downloadLink: document.getElementById('downloadLink'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    signinStatus: document.getElementById('signin-status'),
  };

  // Initialize mode banner
  if (elements.banner && elements.bannerMsg) {
    const mode = MOCK_UPLOAD
      ? {
          text: 'MOCK UPLOAD MODE — calls are simulated',
          remove: 'mode-live',
          add: 'mode-mock',
        }
      : {
          text: 'LIVE MODE — performing real uploads and metadata polling',
          remove: 'mode-mock',
          add: 'mode-live',
        };

    elements.bannerMsg.textContent = mode.text;
    elements.banner.classList.remove(mode.remove);
    elements.banner.classList.add(mode.add);
    elements.banner.classList.remove('hidden');
  }

  // Helper to update upload button state
  const updateUploadButton = () => {
    if (elements.uploadButton && elements.videoInput) {
      elements.uploadButton.disabled = !(
        elements.videoInput.files.length &&
        (getIdToken() || MOCK_UPLOAD)
      );
    }
  };

  const cookieToken = getCookie('idToken');
  if (cookieToken) {
    try {
      setIdTokenCookie(cookieToken);
      window.idToken = cookieToken;
      updateUploadButton();
      showSignedIn();
      if (elements.fileInfo) {
        elements.fileInfo.innerHTML = '';
      }
    } catch (err) {
      console.warn('Stored idToken invalid or expired:', err);
      if (elements.fileInfo) {
        elements.fileInfo.innerHTML = `<span class="error">Saved sign-in invalid: ${escapeHtml(err.message)}</span>`;
      }
      setCookie('idToken', '', -1);
    }
  }

  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: response => {
        if (response?.credential) {
          try {
            setIdTokenCookie(response.credential);
            window.idToken = response.credential;
            updateUploadButton();
            showSignedIn();
            if (elements.fileInfo) {
              elements.fileInfo.innerHTML = '';
            }
          } catch (err) {
            console.error('Sign-in failed:', err);
            if (elements.fileInfo) {
              elements.fileInfo.innerHTML = `<span class="error">Sign-in failed: ${escapeHtml(err.message)}</span>`;
            }
            window.idToken = null;
          }
        }
      },
      auto_select: false,
    });

    google.accounts.id.renderButton(document.getElementById('g_id_signin'), {
      theme: 'filled_blue',
      size: 'large',
      width: 240,
    });

    elements.signinStatus?.classList.add('hidden');

    // Setup sign-out button
    if (elements.bannerSignout) {
      elements.bannerSignout.onclick = signOut;
    }
  }

  if (elements.videoInput) {
    elements.videoInput.addEventListener('change', function () {
      const file = this.files[0];

      if (!file) {
        if (elements.uploadButton) {
          elements.uploadButton.disabled = true;
        }
        if (elements.fileInfo) {
          elements.fileInfo.innerHTML = '';
        }
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        if (elements.fileInfo) {
          elements.fileInfo.innerHTML = '<span class="error">File too large. Max size: 5 GB</span>';
        }
        if (elements.uploadButton) {
          elements.uploadButton.disabled = true;
        }
        return;
      }

      const fileExtension = `.${file.name.split('.').pop().toLowerCase()}`;
      if (!(fileExtension in ALLOWED_CONTENT_TYPES)) {
        if (elements.fileInfo) {
          elements.fileInfo.innerHTML = `<span class="error">File type not allowed. Supported: ${Object.keys(ALLOWED_CONTENT_TYPES).join(', ')}</span>`;
        }
        if (elements.uploadButton) {
          elements.uploadButton.disabled = true;
        }
        return;
      }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      if (elements.fileInfo) {
        elements.fileInfo.innerHTML = `<span class="success">✓ ${file.name} (${sizeMB} MB)</span>`;
      }
      updateUploadButton();
    });
  }

  if (elements.uploadButton) {
    elements.uploadButton.addEventListener('click', async function () {
      const file = elements.videoInput?.files[0];
      if (!file) {
        return;
      }

      if (!getIdToken() && !MOCK_UPLOAD) {
        if (elements.fileInfo) {
          elements.fileInfo.innerHTML = '<span class="error">Sign in with Google first.</span>';
        }
        return;
      }

      elements.uploadButton.disabled = true;
      if (elements.resultText) {
        elements.resultText.textContent = '';
      }

      if (elements.downloadLink) {
        elements.downloadLink.textContent = '';
        elements.downloadLink.removeAttribute('href');
      }

      try {
        if (MOCK_UPLOAD) {
          await runMockUpload(file);
          beginMetadataWait(file);
          return;
        }

        updateProgress(elements.progressBar, elements.progressText, 25, 'Getting upload URL...');
        const url = await getSignedUrl(file);

        updateProgress(elements.progressBar, elements.progressText, 50, 'Uploading file...');
        await uploadToSignedUrl(url, file, {
          progressBarEl: elements.progressBar,
          progressTextEl: elements.progressText,
        });

        updateProgress(elements.progressBar, elements.progressText, 100, 'Upload complete!');
        if (elements.resultText) {
          elements.resultText.innerHTML =
            '<span class="success">✓ File uploaded successfully!</span>';
        }
        elements.downloadLink?.classList.add('hidden');

        beginMetadataWait(file);
      } catch (error) {
        const errorMsg = error.message || String(error);
        if (elements.resultText) {
          elements.resultText.innerHTML = `<span class="error">✗ ${escapeHtml(errorMsg)}</span>`;
        }
        updateUploadButton();
      }
    });
  }

  // Monitor the signed-in UI for unexpected changes and auto-restore when necessary

  window.beginMetadataWait = beginMetadataWait;
  window.__realShowMetadata = showMetadata;
};
