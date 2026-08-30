export type BrowserControl = { tag: string; role: string; name: string; placeholder: string; selector: string };

const RAKA_URL = "https://rakatookyang.com/";
const URL_RE = /https?:\/\/\S+/i;
const RAKA_RE = /rakatookyang|raka\s*took\s*yang|ราคาถูกยัง/i;
const INPUT_RE = /url|link|ลิงก์|สินค้า|product|shopee|ค้นหา|search|query/i;
const SUBMIT_RE = /เช็กราคา|เช็ค|ตรวจ|เช็ก|ค้นหา|search|check|price|ดูราคา|วางเช็คราคา/i;

export function chooseRakatookyangAction(input: { goal: string; controls: BrowserControl[]; lastBrowserAction?: any }) {
  const url = input.goal.match(URL_RE)?.[0];
  if (!url || !RAKA_RE.test(input.goal)) return undefined;

  if (!input.lastBrowserAction) return { action: "open", url: RAKA_URL };

  const target = input.controls.find(c => /^(input|textarea)$/i.test(c.tag) && INPUT_RE.test(`${c.name} ${c.placeholder} ${c.role}`))
    ?? input.controls.find(c => /^(input|textarea)$/i.test(c.tag));

  if (input.lastBrowserAction.action === "open" && target) {
    return { action: "type", selector: target.selector, text: url };
  }

  if (input.lastBrowserAction.action === "type" && target && input.lastBrowserAction.selector === target.selector) {
    const submit = input.controls.find(c => /^(button|input)$/i.test(c.tag) && SUBMIT_RE.test(`${c.name} ${c.placeholder} ${c.role}`));
    if (submit) return { action: "click", selector: submit.selector };
    return { action: "press", selector: target.selector, key: "Enter" };
  }

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
