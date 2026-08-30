import { continueWorkflow, runWorkflowWithProduct } from "../runtime/index.js";
import { loadJob, saveJob } from "../runtime/job-store.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";
configureUtf8Console();
const args = process.argv.slice(2);
function valueAfter(flag: string): string | undefined { const i=args.indexOf(flag); const v=i<0?undefined:args[i+1]; return v&&!v.startsWith("--")?v:undefined; }
function valuesAfter(flag: string): string[] { const i=args.indexOf(flag); if(i<0)return[]; const out:string[]=[]; for(const v of args.slice(i+1)){if(v.startsWith("--"))break;out.push(v);} return out; }
function price(v:string|undefined,label:string):number|undefined { if(v===undefined)return; const n=Number(v.replace(/,/g,"")); if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a valid non-negative number.`); return n; }

if(args[0]==="workflow"&&args[1]==="approve"){
  const jobId=valueAfter("--job-id");
  if(!jobId) throw new Error("usage: workflow approve --job-id <job-id>");
  const saved=await loadJob(jobId);
  const product=saved.workflow.artifacts.find(x=>x.type==="product-input")?.data as Product|undefined;
  if(!product) throw new Error(`Job ${jobId} has no product input.`);
  const workflow=await continueWorkflow(saved.workflow,product);
  await saveJob(jobId,workflow);
  console.log(JSON.stringify({jobId,...workflow},null,2));
  if(workflow.state.status==="failed")process.exit(1);
  process.exit(0);
}

if(args[0]==="workflow"&&args[1]==="run"&&args.includes("--product")){
  const name=valueAfter("--product"), special=price(valueAfter("--price"),"Special price"), original=price(valueAfter("--original-price"),"Original price"), url=valueAfter("--url"), image=valueAfter("--image"), extra=valuesAfter("--images");
  if(!name||special===undefined||original===undefined||!url||!image) throw new Error("usage: workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
  if(original<special) throw new Error("Original price cannot be lower than the special price.");
  const images=[...new Set([image,...extra].filter(Boolean))];
  const product:Product={id:`manual-${crypto.randomUUID()}`,name,price:special,originalPrice:original,discount:original>0?Math.round(((original-special)/original)*100):0,promotion:original!==special?`ลดเหลือ ฿${special.toLocaleString("th-TH")} จากราคาปกติ ฿${original.toLocaleString("th-TH")}`:undefined,url,image,images,source:"manual",discoveredAt:new Date().toISOString()};
  const jobId=`JOB-${new Date().toISOString().replace(/\D/g,"").slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const workflow=await runWorkflowWithProduct(name,product,{pauseAfterQc:true});
  await saveJob(jobId,workflow);
  console.log(`COMMERCA-CLI\n\nJOB ID: ${jobId}\nPRODUCT: ${name}\nSTATUS: ${workflow.state.status}`);
  console.log(JSON.stringify(workflow,null,2));
  if(workflow.state.status==="failed")process.exit(1);
  process.exit(0);
}

console.log("COMMERCA-CLI");
console.log("  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
console.log("  workflow approve --job-id <job-id>");
