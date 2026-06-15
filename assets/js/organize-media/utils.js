export function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function updateProgress(progressBarEl, progressTextEl, percent, message) {
  if (progressBarEl) {
    progressBarEl.style.width = percent + '%';
  }
  if (progressTextEl) {
    progressTextEl.textContent = message;
  }
}

export async function formatHttpError(response) {
  let details = `HTTP ${response.status}`;
  if (response.statusText) {
    details += ` ${response.statusText}`;
  }

  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (data.error) {
        details += `: ${data.error}`;
      } else if (data.message) {
        details += `: ${data.message}`;
      } else {
        details += ` - ${JSON.stringify(data)}`;
      }
    } else {
      const text = await response.text();
      if (text && text.length < 200) {
        details += ` - ${text}`;
      }
    }
  } catch {
    // If we can't read the response body, just return the status
  }

  return details;
}
