import type { FlowNode, NodeContext } from "../core/types.js";

export class ContentNode implements FlowNode {
  readonly name = "CONTENT" as const;
  async execute({ job }: NodeContext): Promise<void> {
    const p = job.product;
    const a = job.analysis;
    if (!p || !a) throw new Error("CONTENT requires PRODUCT and ANALYSIS outputs.");
    const price = p.price !== undefined ? ` ราคา ${p.price} บาท` : "";
    const discount = p.discountPercent > 0 ? ` ลด ${p.discountPercent}%` : "";
    const hook = `${p.name}${discount}${price} — ดูจุดเด่นก่อนตัดสินใจ`;
    const angle = a.sellingPoints.join(" + ");
    const story = `เริ่มจากปัญหาของคนที่กำลังหา ${p.name} แล้วนำเสนอจุดเด่นที่เกี่ยวข้องกับการใช้งานจริง ก่อนปิดด้วยข้อเสนอและการตัดสินใจซื้อ`;
    const caption = `${hook}\n\nจุดเด่น: ${a.benefits.join(" • ")}\n\nเหมาะกับ: ${a.audience.join(" • ")}`;
    const cta = "สนใจสินค้า กดดูรายละเอียดและตรวจสอบข้อเสนอก่อนสั่งซื้อ";
    job.content = { hook, angle, story, caption, cta };
  }
}
