(() => {
  const SOURCE = 'COMMERCA_EXTENSION';
  const TARGET = 'COMMERCA_CLI';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = (requestId, result, error) => window.postMessage({ source: SOURCE, requestId, result, error }, '*');

  const readProducts = () => [...document.querySelectorAll('a[href*="/product/"]')]
    .map((a) => ({ url: a.href, name: (a.innerText || '').trim() }))
    .filter((x, i, arr) => x.url && arr.findIndex((y) => y.url === x.url) === i)
    .slice(0, 50);

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== TARGET) return;
    const { requestId, type, query } = event.data;
    try {
      if (type === 'PING') {
        send(requestId, { ok: true, url: location.href });
        return;
      }
      if (type === 'SEARCH') {
        const input = document.querySelector('input[placeholder*="ค้นหา"], input[placeholder*="Search"], input[type="search"]');
        if (!input) throw new Error('ไม่พบช่องค้นหา Shopee');
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, query);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await sleep(7000);
        send(requestId, { url: location.href, products: readProducts() });
      }
    } catch (error) {
      send(requestId, undefined, String(error));
    }
  });
})();
