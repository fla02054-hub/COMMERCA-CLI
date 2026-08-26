(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const money = (value) => {
    const match = clean(value).match(/(?:฿|THB\s*)[0-9][0-9,.]*/i);
    return match ? Number(match[0].replace(/[^0-9.]/g, '')) : undefined;
  };

  function readCards() {
    const links = [...document.querySelectorAll('a[href*="/product/"]')];
    const seen = new Set();
    const products = [];
    for (const link of links) {
      const url = link.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const card = link.closest('div') || link;
      const lines = clean(card.innerText || '').split(/\n+/).map(clean).filter(Boolean);
      const price = money(card.innerText);
      const name = lines.find((line) => line.length >= 3 && !/^(฿|THB|ขายแล้ว|sold|%|ลด|Mall)/i.test(line)) || clean(link.innerText) || 'Shopee product';
      products.push({ name, price, url, source: 'shopee-extension' });
      if (products.length >= 50) break;
    }
    return products;
  }

  function readDetail() {
    const body = clean(document.body?.innerText || '');
    const meta = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
    const prices = [...body.matchAll(/(?:฿|THB\s*)[0-9][0-9,.]*/gi)]
      .map((m) => Number(m[0].replace(/[^0-9.]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const lines = body.split(/\n+/).map(clean).filter(Boolean);
    const promotions = lines.filter((line) => /คูปอง|โค้ด|voucher|coupon|โปรโมชั่น|ส่งฟรี|ส่วนลด/i.test(line));
    const sold = body.match(/(?:ขายแล้ว|sold)[^0-9]{0,20}([0-9,.]+[KkMm]?)/i);
    const rating = body.match(/(?:คะแนน|rating)[^0-9]{0,20}([0-5](?:\.[0-9])?)/i);
    const reviews = body.match(/([0-9,.]+)\s*(?:รีวิว|ratings|reviews)/i);
    const discount = body.match(/([0-9]{1,3})%\s*(?:ลด|off)/i);
    return {
      name: meta('meta[property="og:title"]') || document.title || lines[0] || 'Shopee product',
      price: prices.length ? Math.min(...prices) : undefined,
      originalPrice: prices.length > 1 ? Math.max(...prices) : undefined,
      discount: discount ? Number(discount[1]) : undefined,
      rating: rating ? Number(rating[1]) : undefined,
      reviewCount: reviews ? Number(reviews[1].replace(/,/g, '')) : undefined,
      salesCount: sold ? sold[1] : undefined,
      promotion: promotions.join(' | ') || undefined,
      coupon: promotions.find((x) => /คูปอง|coupon/i.test(x)) || undefined,
      voucher: promotions.find((x) => /โค้ด|voucher/i.test(x)) || undefined,
      mall: /Shopee Mall/i.test(body),
      image: meta('meta[property="og:image"]') || undefined,
      url: location.href,
      source: 'shopee-extension'
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== 'COMMERCA_CLI') return;
    let result;
    if (message.type === 'PING') result = { ok: true, url: location.href };
    else if (message.type === 'SEARCH_RESULTS') result = { products: readCards() };
    else if (message.type === 'PRODUCT_DETAIL') result = readDetail();
    else return;
    window.postMessage({ source: 'COMMERCA_SHOPEE_EXTENSION', requestId: message.requestId, result }, '*');
  });
})();
