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
      const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const text = (node) => clean(node?.textContent || node?.innerText || '');
      const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || '';
      const body = clean(document.body?.innerText || '');
      const lines = body.split('\\n').map(clean).filter(Boolean);
      const parseNumber = (value) => {
        if (value === undefined || value === null || value === '') return undefined;
        const match = String(value).replace(/,/g, '').match(/([0-9]+(?:\\.[0-9]+)?)([KkMm])?/);
        if (!match) return undefined;
        let number = Number(match[1]);
        if (match[2]?.toLowerCase() === 'k') number *= 1000;
        if (match[2]?.toLowerCase() === 'm') number *= 1000000;
        return Number.isFinite(number) ? number : undefined;
      };
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((node) => { try { return JSON.parse(node.textContent || ''); } catch { return undefined; } })
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .find((value) => value && typeof value === 'object' && (value['@type'] === 'Product' || value.name));
      const ogTitle = attr('meta[property="og:title"]', 'content');
      const ogImage = attr('meta[property="og:image"]', 'content');
      const name = clean(jsonLd?.name) || ogTitle || document.title.replace(/\\s*\\|\\s*Shopee.*$/i, '') || '';
      const prices = [jsonLd?.offers?.price,
        ...[...document.querySelectorAll('[class*="price"], [class*="Price"]')].map(text),
        ...[...body.matchAll(/(?:฿|THB\\s*)[0-9][0-9,.]*/gi)].map((m) => m[0])]
        .map(parseNumber).filter((n) => typeof n === 'number' && n > 0);
      const uniquePrices = [...new Set(prices)];
      const price = uniquePrices.length ? Math.min(...uniquePrices) : undefined;
      const originalPrice = uniquePrices.length > 1 ? Math.max(...uniquePrices) : undefined;
      const rating = [jsonLd?.aggregateRating?.ratingValue, attr('[itemprop="ratingValue"]', 'content'),
        ...[...document.querySelectorAll('[class*="rating"], [class*="Rating"]')].map(text)]
        .map(parseNumber).find((n) => typeof n === 'number' && n >= 0 && n <= 5);
      const reviewCount = [jsonLd?.aggregateRating?.reviewCount, jsonLd?.aggregateRating?.ratingCount,
        attr('[itemprop="reviewCount"]', 'content'), ...lines.filter((line) => /(?:รีวิว|reviews?|ratings?)/i.test(line))]
        .map(parseNumber).find((n) => typeof n === 'number' && n >= 0);
      const soldLine = lines.find((line) => /(?:ขายแล้ว|sold)/i.test(line));
      const soldMatch = soldLine?.match(/(?:ขายแล้ว|sold)[^0-9]*([0-9,.]+\\s*[KkMm]?)/i);
      const salesCount = parseNumber(soldMatch?.[1]);
      const sellerSelectors = ['[data-sqe="shop-name"]', '[class*="shop-name"]', '[class*="ShopName"]', '[class*="shopName"]', 'a[href*="/shop/"]'];
      let seller = '';
      for (const selector of sellerSelectors) {
        const value = text(document.querySelector(selector));
        if (value && value.length < 200 && !/seller centre|เปิดร้านค้า|ติดตามเราบน|ช่วยเหลือ/i.test(value)) { seller = value; break; }
      }
      if (!seller && jsonLd?.brand?.name) seller = clean(jsonLd.brand.name);
      const promotions = lines.filter((line) => /คูปอง|โค้ด|voucher|coupon|โปรโมชั่น|ส่งฟรี|ส่วนลด/i.test(line) && line.length <= 300);
      const discountMatch = body.match(/([0-9]{1,3})%\\s*(?:ลด|off)/i);
      return {
        name, price, originalPrice,
        discount: discountMatch ? Number(discountMatch[1]) : undefined,
        rating, reviewCount, salesCount, seller: seller || undefined,
        promotion: promotions.join(' | ') || undefined,
        coupon: promotions.find((line) => /คูปอง|coupon/i.test(line)) || undefined,
        voucher: promotions.find((line) => /โค้ด|voucher/i.test(line)) || undefined,
        mall: /Shopee Mall/i.test(body), image: ogImage || undefined,
      };
    })()`);

    return {
      id: `shopee-${Date.now()}`,
      name: String(data.name || 'Shopee product'), url,
      price: typeof data.price === 'number' ? data.price : undefined,
      originalPrice: typeof data.originalPrice === 'number' ? data.originalPrice : undefined,
      discount: typeof data.discount === 'number' ? data.discount : undefined,
      seller: typeof data.seller === 'string' ? data.seller : undefined,
      rating: typeof data.rating === 'number' ? data.rating : undefined,
      reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : undefined,
      salesCount: typeof data.salesCount === 'number' ? data.salesCount : undefined,
      promotion: typeof data.promotion === 'string' ? data.promotion : undefined,
      source: 'shopee-browser', discoveredAt: new Date().toISOString(),
    };
  } finally { browser.close(); }
}
