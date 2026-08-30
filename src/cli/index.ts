import { continueWorkflow, runAutonomousAgent, resumeAutonomousAgent } from "../runtime/index.js";
import { listJobIds, loadJob, saveJob } from "../runtime/job-store.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";
import { join } from "node:path";
configureUtf8Console();
const args = process.argv.slice(2);
function valueAfter(flag: string): string | undefined { const i=args.indexOf(flag); const v=i<0?undefined:args[i+1]; return v&&!v.startsWith("--")?v:undefined; }
function valuesAfter(flag: string): string[] { const i=args.indexOf(flag); if(i<0)return[]; const out:string[]=[]; for(const v of args.slice(i+1)){if(v.startsWith("--"))break;out.push(v);} return out; }
function price(v:string|undefined,label:string):number|undefined { if(v===undefined)return; const n=Number(v.replace(/,/g,"")); if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a valid non-negative number.`); return n; }
function outputPaths(jobId:string) { const dir=join(process.env.COMMERCA_OUTPUT_ROOT ?? "./output", jobId); return { outputDir: dir, outputMp4: join(dir, "final.mp4") }; }
async function runAgentJob(jobId: string): Promise<boolean> {
  const saved=await loadJob(jobId);
  if(["completed","failed"].includes(saved.workflow.state.status)) return false;
  const product=saved.workflow.artifacts.find(x=>x.type==="product-input")?.data as Product|undefined;
  if(!product) throw new Error(`Job ${jobId} has no product input.`);
  const result=await resumeAutonomousAgent(saved.workflow,product,{...outputPaths(jobId),maxCycles:3,maxAutonomousRevisions:3});
  await saveJob(jobId,result.workflow);
  console.log(JSON.stringify({jobId,agent:"autonomous",decisions:result.decisions,status:result.workflow.state.status,currentStage:result.workflow.state.currentStage},null,2));
  return true;
}

if(args[0]==="workflow"&&args[1]==="agent"){
  const jobId=valueAfter("--job-id");
  if(jobId){
    const changed=await runAgentJob(jobId);
    if(!changed) console.log(JSON.stringify({jobId,agent:"autonomous",status:"already-terminal"},null,2));
    process.exit(0);
  }
  if(args.includes("--watch")){
    const intervalMs=Math.max(5000,Number(process.env.COMMERCA_AGENT_POLL_MS ?? "30000"));
    console.log(`COMMERCA autonomous agent worker started; polling every ${intervalMs}ms`);
    for(;;){
      for(const id of await listJobIds()){
        try { await runAgentJob(id); } catch(error) { console.error(`Agent job ${id} failed:`, error instanceof Error ? error.message : String(error)); }
      }
      await new Promise(resolve=>setTimeout(resolve,intervalMs));
    }
  }
  throw new Error("usage: workflow agent --job-id <job-id> | workflow agent --watch");
}

if(args[0]==="workflow"&&args[1]==="approve"){
  const jobId=valueAfter("--job-id");
  if(!jobId) throw new Error("usage: workflow approve --job-id <job-id>");
  const saved=await loadJob(jobId);
  const product=saved.workflow.artifacts.find(x=>x.type==="product-input")?.data as Product|undefined;
  if(!product) throw new Error(`Job ${jobId} has no product input.`);
  const workflow=await continueWorkflow(saved.workflow,product,{...outputPaths(jobId)});
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
  const result=await runAutonomousAgent(name,product,{...outputPaths(jobId),maxCycles:3,maxAutonomousRevisions:3});
  await saveJob(jobId,result.workflow);
  console.log(`COMMERCA-CLI\n\nJOB ID: ${jobId}\nAGENT: autonomous\nPRODUCT: ${name}\nSTATUS: ${result.workflow.state.status}`);
  console.log(JSON.stringify({decisions:result.decisions,...result.workflow},null,2));
  if(result.workflow.state.status==="failed")process.exit(1);
  process.exit(0);
}

console.log("COMMERCA-CLI");
console.log("  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
console.log("  workflow agent --job-id <job-id>");
console.log("  workflow agent --watch");
console.log("  workflow approve --job-id <job-id>");
