import type { FlowNode, NodeContext } from "../core/types.js";

export class AnalysisNode implements FlowNode {
  readonly name = "ANALYSIS" as const;
  async execute({ job }: NodeContext): Promise<void> {
    const p = job.product;
    if (!p) throw new Error("ANALYSIS requires PRODUCT output.");
    const text = p.name.toLowerCase();
    const category = text.includes("หมอน") ? "home" : text.includes("จักรยาน") ? "mobility" : text.includes("มือถือ") || text.includes("โทรศัพท์") ? "electronics" : "general";
    const audience = ["ผู้ที่กำลังมองหาสินค้านี้", "ผู้ซื้อที่สนใจความคุ้มค่า"];
    const problems = ["ต้องการเลือกสินค้าให้เหมาะกับการใช้งาน", "ต้องการเห็นเหตุผลว่าทำไมสินค้านี้จึงคุ้มค่า"];
    const benefits = ["เห็นข้อมูลสินค้าได้ชัดเจน", "เปรียบเทียบราคาและข้อเสนอได้ง่าย"];
    const sellingPoints = [p.name, ...(p.discountPercent > 0 ? [`ลด ${p.discountPercent}%`] : []), ...(p.price !== undefined ? [`ราคา ${p.price}`] : [])];
    job.analysis = { category, audience, problems, benefits, sellingPoints };
  }
}
