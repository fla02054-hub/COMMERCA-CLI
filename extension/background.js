const BRIDGE = 'http://127.0.0.1:8765';
let busy = false;

async function poll() {
  if (busy) return;
  try {
    const response = await fetch(`${BRIDGE}/command`);
    if (!response.ok) return;
    const command = await response.json();
    if (!command?.id || command.type !== 'SEARCH') return;

    busy = true;
    const tabs = await chrome.tabs.query({ url: ['https://shopee.co.th/*'], active: true, currentWindow: true });
    const fallback = await chrome.tabs.query({ url: ['https://shopee.co.th/*'] });
    const tab = tabs[0] || fallback[0];
    if (!tab?.id) throw new Error('ไม่พบแท็บ Shopee ที่เปิดอยู่ใน Chrome');

    const result = await chrome.tabs.sendMessage(tab.id, { type: 'SEARCH', query: command.query });
    await fetch(`${BRIDGE}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: command.id, result })
    });
  } catch (error) {
    try {
      const command = await (await fetch(`${BRIDGE}/command`)).json();
      if (command?.id) {
        await fetch(`${BRIDGE}/result`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: command.id, error: String(error) })
        });
      }
    } catch {}
  } finally {
    busy = false;
  }
}

setInterval(poll, 500);
poll();
