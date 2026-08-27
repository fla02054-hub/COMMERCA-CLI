const BRIDGE = 'http://127.0.0.1:8765';
let busy = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'POLL_COMMAND') {
    getCommand().then(sendResponse).catch(() => sendResponse(null));
    return true;
  }

  if (message?.type === 'SEARCH') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'SEARCH command came from a context without a Shopee tab.' });
      return false;
    }
    chrome.tabs.sendMessage(tabId, { type: 'SEARCH', query: message.query })
      .then(sendResponse)
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  if (message?.type === 'SEARCH_RESULT') {
    postResult(message.id, message.result, message.error).catch(() => {});
    return false;
  }

  return false;
});

async function getCommand() {
  if (busy) return null;
  const response = await fetch(`${BRIDGE}/command`, { cache: 'no-store' });
  if (!response.ok || response.status === 204) return null;
  const command = await response.json();
  if (!command?.id || command.type !== 'SEARCH') return null;
  busy = true;
  return command;
}

async function postResult(id, result, error) {
  try {
    await fetch(`${BRIDGE}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, result, error }),
    });
  } finally {
    busy = false;
  }
}
