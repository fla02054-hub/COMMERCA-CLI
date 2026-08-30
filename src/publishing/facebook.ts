import { createReadStream } from "node:fs";

export interface FacebookPublishInput {
  videoUrl?: string;
  videoPath?: string;
  imageUrl?: string;
  caption: string;
  pageId?: string;
  pageAccessToken?: string;
}

export interface FacebookPublishResult {
  provider: "meta";
  platform: "facebook";
  mediaType: "video" | "photo";
  id: string;
  permalink?: string;
}

function config(input: FacebookPublishInput): { pageId: string; token: string } {
  const pageId = input.pageId ?? process.env.META_PAGE_ID;
  const token = input.pageAccessToken ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId) throw new Error("META_PAGE_ID is required for Facebook publishing.");
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is required for Facebook publishing.");
  return { pageId, token };
}

export async function publishToFacebookPage(input: FacebookPublishInput): Promise<FacebookPublishResult> {
  const { pageId, token } = config(input);
  const graph = process.env.META_GRAPH_VERSION ?? "v23.0";
  const base = `https://graph.facebook.com/${graph}`;

  if (input.videoPath) {
    const form = new FormData();
    form.append("source", new Blob([await new Response(createReadStream(input.videoPath) as any).arrayBuffer()], { type: "video/mp4" }), "video.mp4");
    form.append("description", input.caption);
    form.append("access_token", token);
    const response = await fetch(`${base}/${encodeURIComponent(pageId)}/videos`, { method: "POST", body: form });
    if (!response.ok) throw new Error(`Meta video upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const result = await response.json() as { id?: string; post_id?: string };
    const id = result.post_id ?? result.id;
    if (!id) throw new Error("Meta video publish returned no post id.");
    return { provider: "meta", platform: "facebook", mediaType: "video", id };
  }

  if (input.videoUrl) {
    const response = await fetch(`${base}/${encodeURIComponent(pageId)}/videos`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ file_url: input.videoUrl, description: input.caption, access_token: token }),
    });
    if (!response.ok) throw new Error(`Meta video publish failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const result = await response.json() as { id?: string; post_id?: string };
    const id = result.post_id ?? result.id;
    if (!id) throw new Error("Meta video publish returned no post id.");
    return { provider: "meta", platform: "facebook", mediaType: "video", id };
  }

  if (input.imageUrl) {
    const response = await fetch(`${base}/${encodeURIComponent(pageId)}/photos`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: input.imageUrl, caption: input.caption, access_token: token }),
    });
    if (!response.ok) throw new Error(`Meta photo publish failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const result = await response.json() as { id?: string; post_id?: string };
    const id = result.post_id ?? result.id;
    if (!id) throw new Error("Meta photo publish returned no post id.");
    return { provider: "meta", platform: "facebook", mediaType: "photo", id };
  }

  throw new Error("Facebook publishing requires a local videoPath, public videoUrl, or imageUrl.");
}
