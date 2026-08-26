(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const readProducts = () => [...document.querySelectorAll('a[href*="/product/"]')]
    .map((a) => ({ url: a.href, name: (a.innerText || '').trim() }))
    .filter((x, i, arr) => x.url && arr.findIndex((y) => y.url === x.url) === i)
    .slice(0, 50);

  const search = async (query) => {
    const input = document.querySelector('input[placeholder*="ค้นหา"], input[placeholder*="Search"], input[type="search"]');
    if (!input) throw new Error('ไม่พบช่องค้นหา Shopee ในแท็บปัจจุบัน');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    await sleep(7000);
    return { url: location.href, products: readProducts() };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SEARCH') return;
    search(message.query).then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
    return true;
  });
})();
