(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const money = (value) => {
    const match = clean(value).match(/(?:฿|THB\s*)[0-9][0-9,.]*/i);
    return match ? Number(match[0].replace(/[^0-9.]/g, '')) : undefined;
  };

  const readCards = () => {
    const links = [...document.querySelectorAll('a[href*="/product/"]')];
    const seen = new Set();
    const products = [];
    for (const link of links) {
      const url = link.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const card = link.closest('div') || link;
      const text = card.innerText || '';
      const lines = text.split(/\n+/).map(clean).filter(Boolean);
      products.push({ name: lines.find((line) => line.length >= 3 && !/^(฿|THB|ขายแล้ว|sold|%|ลด|Mall)/i.test(line)) || clean(link.innerText) || 'Shopee product', price: money(text), url, source: 'shopee-extension' });
      if (products.length >= 50) break;
    }
    return products;
  };

  const search = async (query) => {
    const input = document.querySelector('input[placeholder*="ค้นหา"], input[placeholder*="Search"], input[type="search"]');
    if (!input) throw new Error('ไม่พบช่องค้นหา Shopee');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 7000));
    return { url: location.href, products: readCards() };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SEARCH') return false;
    search(message.query).then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
    return true;
  });

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'COMMERCA_CLI') return;
    const { requestId, type, query } = event.data;
    try {
      let result;
      if (type === 'PING') result = { ok: true, url: location.href };
      else if (type === 'SEARCH') result = await search(query);
      else return;
      window.postMessage({ source: 'COMMERCA_EXTENSION', requestId, result }, '*');
    } catch (error) {
      window.postMessage({ source: 'COMMERCA_EXTENSION', requestId, error: String(error) }, '*');
    }
  });
})();
