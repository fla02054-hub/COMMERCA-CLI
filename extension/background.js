const BRIDGE = 'http://127.0.0.1:8765';
let busy = false;
let lastCommandId = null;

async function poll() {
  if (busy) return;
  try {
    const response = await fetch(`${BRIDGE}/command`, { cache: 'no-store' });
    if (!response.ok || response.status === 204) return;
    const command = await response.json();
    if (!command?.id || command.type !== 'SEARCH' || command.id === lastCommandId) return;

    busy = true;
    lastCommandId = command.id;
    try {
      const tabs = await chrome.tabs.query({ url: ['https://shopee.co.th/*'], active: true, currentWindow: true });
      const fallback = await chrome.tabs.query({ url: ['https://shopee.co.th/*'] });
      const tab = tabs[0] || fallback[0];
      if (!tab?.id) throw new Error('ไม่พบแท็บ Shopee ที่เปิดอยู่ใน Chrome');

      const result = await chrome.tabs.sendMessage(tab.id, { type: 'SEARCH', query: command.query });
      await postResult(command.id, result);
    } catch (error) {
      await postResult(command.id, undefined, String(error));
    } finally {
      busy = false;
    }
  } catch {}
}

async function postResult(id, result, error) {
  await fetch(`${BRIDGE}/result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, result, error })
  });
}

setInterval(poll, 500);
poll();
