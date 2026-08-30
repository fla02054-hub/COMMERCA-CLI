import { readRakatookyangPriceHistory } from "./rakatookyang-price.js";

/**
 * Product-input entry point for RakaTookYang.
 *
 * The supplied product URL is opened in RakaTookYang and entered into its
 * search/input field. The existing browser implementation performs the
 * actual submit and reads the resulting product/price data.
 */
export async function searchRakatookyangProduct(url: string) {
  return readRakatookyangPriceHistory(url);
}
