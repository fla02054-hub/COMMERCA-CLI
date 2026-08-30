export type BrowserControl = { tag: string; role: string; name: string; placeholder: string; selector: string };

export function chooseRakatookyangAction(input: { goal: string; controls: BrowserControl[]; lastBrowserAction?: any }) {
  const url = input.goal.match(/https?:\/\/\S+/)?.[0];
  const wantsRaka = /rakatookyang|raka\s*took\s*yang|ราคาถูกยัง/i.test(input.goal);
  if (!url || !wantsRaka) return undefined;
  if (!input.lastBrowserAction) return { action: "open", url: "https://rakatookyang.com/" };
  const target = input.controls.find(c => /^(input|textarea)$/i.test(c.tag) && /url|link|ลิงก์|สินค้า|product|shopee|ค้นหา|search|query/i.test(`${c.name} ${c.placeholder} ${c.role}`)) ?? input.controls.find(c => /^(input|textarea)$/i.test(c.tag));
  if (input.lastBrowserAction.action === "open" && target) return { action: "type", selector: target.selector, text: url };
  if (input.lastBrowserAction.action === "type" && target && input.lastBrowserAction.selector === target.selector) return { action: "press", selector: target.selector, key: "Enter" };
  return undefined;
}

export function chooseSearchAction(input:{goal:string;controls:BrowserControl[];lastBrowserAction?:any}) {
  const query=input.goal.match(/(?:ค้นหา|search)\s+(.+?)(?:\s+(?:บน|on|ใน|in)\s+|$)/i)?.[1]?.trim();
  const target=input.controls.find(c=>/^(input|textarea)$/i.test(c.tag)&&/ค้นหา|search|query/i.test(`${c.name} ${c.placeholder} ${c.role}`));
  if(!query||!target) return undefined;
  if(input.lastBrowserAction?.action==="open") return {action:"type",selector:target.selector,text:query};
  if(input.lastBrowserAction?.action==="type"&&input.lastBrowserAction?.selector===target.selector) return {action:"press",selector:target.selector,key:"Enter"};
  return undefined;
}
