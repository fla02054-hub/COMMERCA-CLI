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

/** Resolve Shopee short/share links before opening them in the browser.
 * Shopee share links commonly redirect through one or more intermediate URLs.
 * Keeping this outside BrowserController also makes the product command reliable
 * when Chrome is already running with another tab selected.
 */
export async function resolveShopeeUrl(input: string): Promise<string> {
  let current = input.trim();
  if (!/^https?:\/\//i.test(current)) return current;

  for (let attempt = 0; attempt < 5; attempt++) {
    const isShortLink = /^https?:\/\/s\.shopee\.[^/]+\//i.test(current);
    if (!isShortLink) return current;

    try {
      const response = await fetch(current, { redirect: "manual" });
      const location = response.headers.get("location");
      if (!location) return current;
      current = new URL(location, current).toString();
    } catch {
      // Browser navigation below can still resolve the link when direct HTTP
      // resolution is blocked by Shopee/CDN protection.
      return current;
    }
  }

  return current;
}

export async function readShopeeProductDetail(url: string, options: { browserPort?: number; waitMs?: number } = {}): Promise<ShopeeProductDetail> {
  const browser = new BrowserController({ port: options.browserPort ?? 9222 });
  const resolvedUrl = await resolveShopeeUrl(url);
  try {
    await browser.open(resolvedUrl);
    await browser.wait(options.waitMs ?? 10000);

    const extract = () => browser.evaluate<Record<string, unknown>>(`(() => {
      const clean = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const text = (node) => clean(node?.textContent || node?.innerText || '');
      const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || '';
      const parseNumber = (value) => {
        if (value === undefined || value === null || value === '') return undefined;
        const match = String(value).replace(/,/g, '').match(/([0-9]+(?:\\.[0-9]+)?)([KkMm])?/);
        if (!match) return undefined;
        let n = Number(match[1]);
        if (match[2]?.toLowerCase() === 'k') n *= 1000;
        if (match[2]?.toLowerCase() === 'm') n *= 1000000;
        return Number.isFinite(n) ? n : undefined;
      };
      const lines = (document.body?.innerText || '').split('\\n').map(clean).filter(Boolean);
      const jsonValues = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((node) => { try { return JSON.parse(node.textContent || ''); } catch { return undefined; } })
        .flatMap((value) => Array.isArray(value) ? value : [value]);
      const product = jsonValues.find((value) => value && typeof value === 'object' && value['@type'] === 'Product');
      const offers = product?.offers && typeof product.offers === 'object' ? product.offers : undefined;
      const aggregate = product?.aggregateRating && typeof product.aggregateRating === 'object' ? product.aggregateRating : undefined;
      const metaTitle = attr('meta[property="og:title"]', 'content');
      const pageTitle = document.title || '';
      const title = clean(product?.name) || (metaTitle && !/^Shopee Thailand\\s*\\|/i.test(metaTitle) ? metaTitle : '') || (!/^Shopee Thailand\\s*\\|/i.test(pageTitle) ? pageTitle.replace(/\\s*\\|\\s*Shopee.*$/i, '') : '');
      const image = attr('meta[property="og:image"]', 'content') || undefined;
      let price = parseNumber(offers?.price);
      if (price === undefined) price = parseNumber(text(document.querySelector('[data-sqe="price"], [class*="product-price"], [class*="ProductPrice"]')));
      let originalPrice = parseNumber(product?.priceSpecification?.price);
      if (originalPrice === undefined) originalPrice = parseNumber(text(document.querySelector('del, s, [class*="price--old"], [class*="Price--old"]')));
      if (originalPrice !== undefined && price !== undefined && originalPrice <= price) originalPrice = undefined;
      const rating = parseNumber(aggregate?.ratingValue) ?? parseNumber(attr('[itemprop="ratingValue"]', 'content'));
      const reviewCount = parseNumber(aggregate?.reviewCount) ?? parseNumber(aggregate?.ratingCount) ?? parseNumber(attr('[itemprop="reviewCount"]', 'content'));
      const soldLine = lines.find((line) => /(?:ขายแล้ว|sold)/i.test(line));
      const salesCount = parseNumber(soldLine?.match(/(?:ขายแล้ว|sold)[^0-9]*([0-9,.]+\\s*[KkMm]?)/i)?.[1]);
      let seller = '';
      for (const selector of ['[data-sqe="shop-name"]','[data-testid="shop-name"]','[class*="shop-name"]','[class*="ShopName"]','[class*="shopName"]']) {
        const value = text(document.querySelector(selector));
        if (value && value.length <= 120 && !/seller centre|เปิดร้านค้า|ติดตามเราบน|ช่วยเหลือ|shopping cart/i.test(value)) { seller = value; break; }
      }
      const body = clean(document.body?.innerText || '');
      const discountMatch = body.match(/(?:ลด|discount|off)\\s*([0-9]{1,3})%/i) || body.match(/([0-9]{1,3})%\\s*(?:ลด|off)/i);
      const discount = discountMatch ? Number(discountMatch[1]) : undefined;
      const promotions = lines.filter((line) => /คูปอง|coupon|voucher|โค้ด|โปรโมชั่น|ส่งฟรี/i.test(line) && line.length <= 200);
      const href = String(location.href || '');
      const productUrl = /(?:\\/product\\/|\\/i\\.\\d+\\.\\d+|\\.\\d+\\.\\d+)/i.test(href);
      const isProductPage = Boolean(product?.name) || Boolean(title) || price !== undefined || productUrl;
      return { name: title || undefined, price, originalPrice, discount, seller: seller || undefined, rating, reviewCount, salesCount, promotion: promotions.join(' | ') || undefined, coupon: promotions.find((line) => /คูปอง|coupon/i.test(line)) || undefined, voucher: promotions.find((line) => /voucher|โค้ด/i.test(line)) || undefined, mall: /Shopee Mall/i.test(body), image, isProductPage, currentUrl: href };
    })()`);

    let data = await extract();
    if (!data.isProductPage || !data.name) {
      await browser.wait(5000);
      data = await extract();
    }
    if (!data.name || !data.isProductPage) throw new Error("Shopee link did not resolve to a product page. Please retry the same product link.");

    return {
      id: `shopee-${Date.now()}`,
      name: String(data.name), url,
      price: typeof data.price === 'number' ? data.price : undefined,
      originalPrice: typeof data.originalPrice === 'number' ? data.originalPrice : undefined,
      discount: typeof data.discount === 'number' ? data.discount : undefined,
      seller: typeof data.seller === 'string' ? data.seller : undefined,
      rating: typeof data.rating === 'number' ? data.rating : undefined,
      reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : undefined,
      salesCount: typeof data.salesCount === 'number' ? data.salesCount : undefined,
      promotion: typeof data.promotion === 'string' ? data.promotion : undefined,
      coupon: typeof data.coupon === 'string' ? data.coupon : undefined,
      voucher: typeof data.voucher === 'string' ? data.voucher : undefined,
      mall: data.mall === true,
      image: typeof data.image === 'string' ? data.image : undefined,
      source: 'shopee-browser', discoveredAt: new Date().toISOString(),
    };
  } finally { browser.close(); }
}
