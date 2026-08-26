import type { Product } from "./types.js";
import { BrowserController } from "../browser/controller.js";

export interface ShopeeProductDetail extends Product {
  originalPrice?: number;
  discount?: number;
  seller?: string;
  rating?: number;
  reviewCount?: number;
  salesCount?: number;
  promotion?: string;
  coupon?: string;
  voucher?: string;
  mall?: boolean;
  image?: string;
}

export async function readShopeeProductDetail(
  url: string,
  options: { browserPort?: number; waitMs?: number } = {},
): Promise<ShopeeProductDetail> {
  const browser = new BrowserController({ port: options.browserPort ?? 9222 });
  try {
    await browser.open(url);
    await browser.wait(options.waitMs ?? 3000);

    const data = await browser.evaluate<Record<string, unknown>>(`(() => {
      const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const body = clean(document.body?.innerText || '');
      const meta = (name) => document.querySelector(name)?.getAttribute('content') || '';
      const ogTitle = meta('meta[property="og:title"]');
      const ogImage = meta('meta[property="og:image"]');
      const prices = [...body.matchAll(/(?:฿|THB\\s*)[0-9][0-9,.]*/gi)]
        .map((m) => Number(m[0].replace(/[^0-9.]/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0);
      const ratingMatch = body.match(/(?:คะแนน|rating)[^0-9]{0,20}([0-5](?:\\.[0-9])?)/i);
      const reviewMatch = body.match(/([0-9,.]+)\\s*(?:รีวิว|ratings|reviews)/i);
      const soldMatch = body.match(/(?:ขายแล้ว|sold)[^0-9]{0,20}([0-9,.]+[KkMm]?)/i);
      const discountMatch = body.match(/([0-9]{1,3})%\\s*(?:ลด|off)/i);
      const lines = body.split('\\n').map(clean).filter(Boolean);
      const promotionTerms = lines.filter((line) => /คูปอง|โค้ด|voucher|coupon|โปรโมชั่น|ส่งฟรี|ส่วนลด/i.test(line));
      const seller = lines.find((line) => /(?:ผู้ขาย|ร้านค้า|seller|shop)/i.test(line));
      const mall = /Shopee Mall/i.test(body);
      return {
        name: ogTitle || document.title || lines[0] || '',
        price: prices.length ? Math.min(...prices) : undefined,
        originalPrice: prices.length > 1 ? Math.max(...prices) : undefined,
        discount: discountMatch ? Number(discountMatch[1]) : undefined,
        rating: ratingMatch ? Number(ratingMatch[1]) : undefined,
        reviewCount: reviewMatch ? Number(reviewMatch[1].replace(/,/g, '')) : undefined,
        salesCount: soldMatch ? soldMatch[1] : undefined,
        seller: seller || undefined,
        promotion: promotionTerms.join(' | ') || undefined,
        coupon: promotionTerms.find((line) => /คูปอง|coupon/i.test(line)) || undefined,
        voucher: promotionTerms.find((line) => /โค้ด|voucher/i.test(line)) || undefined,
        mall,
        image: ogImage || undefined,
      };
    })()`);

    return {
      id: `shopee-${Date.now()}`,
      name: String(data.name || 'Shopee product'),
      url,
      price: typeof data.price === 'number' ? data.price : undefined,
      originalPrice: typeof data.originalPrice === 'number' ? data.originalPrice : undefined,
      discount: typeof data.discount === 'number' ? data.discount : undefined,
      seller: typeof data.seller === 'string' ? data.seller : undefined,
      rating: typeof data.rating === 'number' ? data.rating : undefined,
      reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : undefined,
      salesCount: typeof data.salesCount === 'string' ? Number(data.salesCount.replace(/[^0-9.]/g, '')) : undefined,
      promotion: typeof data.promotion === 'string' ? data.promotion : undefined,
      source: 'shopee-browser',
      discoveredAt: new Date().toISOString(),
    };
  } finally {
    browser.close();
  }
}
