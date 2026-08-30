export interface Product {
  id: string;
  name: string;
  image?: string;
  images?: string[];
  url?: string;
  price?: number;
  originalPrice?: number;
  discount?: number;
  lowestPrice?: number;
  averagePrice?: number;
  commission?: number;
  rating?: number;
  reviewCount?: number;
  salesCount?: number;
  seller?: string;
  promotion?: string;
  source: string;
  discoveredAt: string;
}
