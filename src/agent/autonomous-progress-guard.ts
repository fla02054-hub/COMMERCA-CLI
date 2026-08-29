export function chooseSearchAction(input:{goal:string;controls:Array<{tag:string;role:string;name:string;placeholder:string;selector:string}>;lastBrowserAction?:any}) {
  const query=input.goal.match(/(?:ค้นหา|search)\s+(.+?)(?:\s+(?:บน|on|ใน|in)\s+|$)/i)?.[1]?.trim();
  const target=input.controls.find(c=>/^(input|textarea)$/i.test(c.tag)&&/ค้นหา|search|query/i.test(`${c.name} ${c.placeholder} ${c.role}`));
  if(!query||!target) return undefined;
  if(input.lastBrowserAction?.action==="open") return {action:"type",selector:target.selector,text:query};
  if(input.lastBrowserAction?.action==="type"&&input.lastBrowserAction?.selector===target.selector) return {action:"press",selector:target.selector,key:"Enter"};
  return undefined;
}
