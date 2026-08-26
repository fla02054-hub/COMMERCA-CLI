(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const card = link.closest('[data-sqe]') || link.closest('div') || link;
      const text = card.innerText || link.innerText || '';
      const lines = text.split(/\n+/).map(clean).filter(Boolean);
      products.push({
        name: lines.find((line) => line.length >= 3 && !/^(฿|THB|ขายแล้ว|sold|%|ลด|Mall)/i.test(line)) || clean(link.innerText) || 'Shopee product',
        price: money(text),
        url,
        source: 'shopee-extension'
      });
      if (products.length >= 50) break;
    }
    return products;
  };

  const findSearchInput = () => document.querySelector(
    'input[placeholder*="ค้นหา"], input[placeholder*="Search"], input[aria-label*="ค้นหา"], input[type="search"]'
  );

  const search = async (query) => {
    const input = findSearchInput();
    if (!input) throw new Error('ไม่พบช่องค้นหา Shopee ในแท็บปัจจุบัน');

    input.scrollIntoView({ block: 'center' });
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);

    const form = input.closest('form');
    const button = form?.querySelector('button[type="submit"], button') ||
      [...document.querySelectorAll('button')].find((b) => /ค้นหา|search/i.test(b.innerText || b.getAttribute('aria-label') || ''));

    if (button) {
      button.click();
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (readCards().length > 0) break;
    }

    return { url: location.href, products: readCards() };
  };

  const readDetail = () => {
    const body = clean(document.body?.innerText || '');
    const prices = [...body.matchAll(/(?:฿|THB\s*)[0-9][0-9,.]*/gi)]
      .map((m) => Number(m[0].replace(/[^0-9.]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const lines = body.split(/\n+/).map(clean).filter(Boolean);
    const promotions = lines.filter((line) => /คูปอง|โค้ด|voucher|coupon|โปรโมชั่น|ส่งฟรี|ส่วนลด/i.test(line));
    return {
      name: document.querySelector('meta[property="og:title"]')?.content || document.title,
      price: prices.length ? Math.min(...prices) : undefined,
      originalPrice: prices.length > 1 ? Math.max(...prices) : undefined,
      promotion: promotions.join(' | ') || undefined,
      coupon: promotions.find((x) => /คูปอง|coupon/i.test(x)) || undefined,
      voucher: promotions.find((x) => /โค้ด|voucher/i.test(x)) || undefined,
      url: location.href,
      source: 'shopee-extension'
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SEARCH') {
      search(message.query).then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message?.type === 'DETAIL') {
      try { sendResponse(readDetail()); } catch (error) { sendResponse({ error: String(error) }); }
      return false;
    }
    return false;
  });
})();
