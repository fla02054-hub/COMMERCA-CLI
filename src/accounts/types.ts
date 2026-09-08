export type AccountService =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "shopee"
  | "lazada"
  | "higgsfield";

export type AccountStatus = "CONNECTED" | "NOT_CONNECTED";

export type AccountRecord = {
  service: AccountService;
  label: string;
  status: AccountStatus;
  profileDir: string;
  lastLoginAt?: string;
};

export const ACCOUNT_SERVICES: Record<AccountService, { label: string; url: string }> = {
  facebook: { label: "Facebook", url: "https://www.facebook.com/" },
  instagram: { label: "Instagram", url: "https://www.instagram.com/" },
  tiktok: { label: "TikTok", url: "https://www.tiktok.com/" },
  youtube: { label: "YouTube", url: "https://www.youtube.com/" },
  shopee: { label: "Shopee", url: "https://shopee.co.th/" },
  lazada: { label: "Lazada", url: "https://www.lazada.co.th/" },
  higgsfield: { label: "Higgsfield", url: "https://higgsfield.ai/" },
};
