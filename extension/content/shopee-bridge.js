(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const money = (value) => {
    const match = clean(value).match(/(?:฿|THB\s*)[0-9][0-9,.]*/i);
    return match ? Number(match[0].replace(/[^0-9.]/g, '')) : undefined;
  };

  const isProductHref = (href) => {
    try {
      const url = new URL(href, location.href);
      return url.hostname.endsWith('shopee.co.th') && (/\/product\//i.test(url.pathname) || /-[0-9]+\.[0-9]+(?:\?|$)/.test(url.pathname));
    } catch { return false; }
  };

  const readCards = () => {
    const anchors = [...document.querySelectorAll('a[href]')].filter((a) => isProductHref(a.href));
    const seen = new Set();
    const products = [];

    for (const link of anchors) {
      const url = link.href;
      if (seen.has(url)) continue;
      seen.add(url);

      let card = link;
      for (let i = 0; i < 6 && card.parentElement; i++) {
        const text = clean(card.innerText);
        if (text.length >= 20 && text.length <= 1500) break;
        card = card.parentElement;
      }

      const text = clean(card.innerText || link.innerText);
      const lines = text.split(/\n+/).map(clean).filter(Boolean);
      const name = lines.find((line) =>
        line.length >= 3 &&
        line.length <= 300 &&
        !/^(฿|THB|ขายแล้ว|sold|%|ลด|Mall|ใหม่|พร้อมส่ง)/i.test(line) &&
        !/^\d[\d,.]*$/.test(line)
      ) || clean(link.innerText) || 'Shopee product';

      products.push({ name, price: money(text), url, source: 'shopee-extension' });
      if (products.length >= 50) break;
    }
    return products;
  };

  const findSearchInput = () => document.querySelector(
    'input[placeholder*="ค้นหา"], input[placeholder*="Search"], input[aria-label*="ค้นหา"], input[aria-label*="Search"], input[type="search"]'
  );

  const search = async (query) => {
    const input = findSearchInput();
    if (!input) throw new Error('ไม่พบช่องค้นหา Shopee ในแท็บปัจจุบัน');

    input.scrollIntoView({ block: 'center' });
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, query);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: query }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);

    const form = input.closest('form');
    const button = form?.querySelector('button[type="submit"], button') ||
      [...document.querySelectorAll('button')].find((b) => /ค้นหา|search/i.test(b.innerText || b.getAttribute('aria-label') || b.title || ''));

    if (button) button.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

    let products = [];
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      products = readCards();
      if (products.length) break;
    }

    if (!products.length) {
      const body = clean(document.body?.innerText || '');
      if (/verify|captcha|robot|traffic\/error|access denied|ไม่สามารถ/i.test(body) || /verify\/traffic\/error/i.test(location.href)) {
        throw new Error(`Shopee blocked/verification page: ${location.href}`);
      }
      throw new Error(`ค้นหาเสร็จแต่ไม่พบรายการสินค้าใน DOM: ${location.href}`);
    }

    return { url: location.href, products };
  };

  const readDetail = () => {
    const body = clean(document.body?.innerText || '');
    const prices = [...body.matchAll(/(?:฿|THB\s*)[0-9][0-9,.]*/gi)].map((m) => Number(m[0].replace(/[^0-9.]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    const lines = body.split(/\n+/).map(clean).filter(Boolean);
    const promotions = lines.filter((line) => /คูปอง|โค้ด|voucher|coupon|โปรโมชั่น|ส่งฟรี|ส่วนลด/i.test(line));
    return { name: document.querySelector('meta[property="og:title"]')?.content || document.title, price: prices.length ? Math.min(...prices) : undefined, originalPrice: prices.length > 1 ? Math.max(...prices) : undefined, promotion: promotions.join(' | ') || undefined, coupon: promotions.find((x) => /คูปอง|coupon/i.test(x)), voucher: promotions.find((x) => /โค้ด|voucher/i.test(x)), url: location.href, source: 'shopee-extension' };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SEARCH') { search(message.query).then(sendResponse).catch((error) => sendResponse({ error: String(error) })); return true; }
    if (message?.type === 'DETAIL') { try { sendResponse(readDetail()); } catch (error) { sendResponse({ error: String(error) }); } return false; }
    return false;
  });
})();
