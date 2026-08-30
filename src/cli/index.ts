import { runWorkflowWithProduct, createStageRegistry, executeWorkflow, type RuntimeWorkflow } from "../runtime/index.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";
import { loadJob, saveJob, type JobRecord } from "../jobs/store.js";

configureUtf8Console();
const args = process.argv.slice(2);
function valueAfter(flag: string): string | undefined { const i=args.indexOf(flag); const v=i<0?undefined:args[i+1]; return v&&!v.startsWith("--")?v:undefined; }
function valuesAfter(flag: string): string[] { const i=args.indexOf(flag); if(i<0)return[]; const out:string[]=[]; for(const v of args.slice(i+1)){if(v.startsWith("--"))break;out.push(v);} return out; }
function price(v:string|undefined,label:string):number|undefined { if(v===undefined)return; const n=Number(v.replace(/,/g,"")); if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a valid non-negative number.`); return n; }
function id(prefix:string):string { return `${prefix}-${new Date().toISOString().replace(/\D/g,"").slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`; }
function latestArtifact<T>(workflow:RuntimeWorkflow,type:string):T|undefined { return [...workflow.artifacts].reverse().find(a=>a.type===type)?.data as T|undefined; }
function usage(){ console.log("COMMERCA-CLI\n\n  workflow run --job-id <JOB-ID>\n  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]\n  workflow approve --job-id <JOB-ID> [--caption <caption>] [--sub-id <sub-id>]"); }
async function startWorkflow(jobId:string, product:Product){
 console.log(`COMMERCA-CLI\n\nJOB ID: ${jobId}\nSUB ID: ${product.subId??"-"}\nPRODUCT: ${product.name}\nSTATUS: RUNNING`);
 const workflow=await runWorkflowWithProduct(product.name,product,{stopAfterQc:true});
 const status:JobRecord["status"]=workflow.state.status==="awaiting_approval"?"awaiting-approval":workflow.state.status==="failed"?"failed":"published";
 await saveJob({jobId,subId:product.subId??id("SUB"),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status,workflow});
 const qc=latestArtifact<{passed?:boolean}>(workflow,"qc-report");
 console.log(`QC: ${qc?.passed?"PASS":"FAIL"}\nSTATUS: ${workflow.state.status}`);
 if(workflow.state.status==="awaiting_approval")console.log("ACTION: REVIEW / EDIT / APPROVE");
 if(workflow.state.status==="failed")process.exit(1);
}
async function runNewJob(){
 const name=valueAfter("--product"),special=price(valueAfter("--price"),"Special price"),original=price(valueAfter("--original-price"),"Original price"),url=valueAfter("--url"),image=valueAfter("--image"),extra=valuesAfter("--images");
 if(!name||special===undefined||original===undefined||!url||!image)throw new Error("usage: workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
 if(original<special)throw new Error("Original price cannot be lower than the special price.");
 const product:Product={id:`manual-${crypto.randomUUID()}`,name,price:special,originalPrice:original,discount:original>0?Math.round(((original-special)/original)*100):0,promotion:original!==special?`ลดเหลือ ฿${special.toLocaleString("th-TH")} จากราคาปกติ ฿${original.toLocaleString("th-TH")}`:undefined,url,image,images:[...new Set([image,...extra].filter(Boolean))],subId:id("SUB"),source:"manual",discoveredAt:new Date().toISOString()};
 await startWorkflow(id("JOB"),product);
}
async function runFromJob(){
 const sourceJobId=valueAfter("--job-id");if(!sourceJobId)throw new Error("--job-id is required.");
 const source=await loadJob(sourceJobId);const product=latestArtifact<Product>(source.workflow,"product-input");if(!product)throw new Error(`Job ${sourceJobId} has no product input.`);
 const copy={...product,id:`manual-${crypto.randomUUID()}`,images:product.images?[...product.images]:undefined,subId:id("SUB"),discoveredAt:new Date().toISOString()};
 await startWorkflow(id("JOB"),copy);
}
async function approveJob(){
 const jobId=valueAfter("--job-id");if(!jobId)throw new Error("--job-id is required.");
 const job=await loadJob(jobId);if(job.status!=="awaiting-approval")throw new Error(`Job ${jobId} is not waiting at the QC approval point.`);
 const product=latestArtifact<Product>(job.workflow,"product-input"),content=latestArtifact<any>(job.workflow,"content-package");if(!product||!content)throw new Error("Job content is incomplete.");
 const caption=valueAfter("--caption"),subId=valueAfter("--sub-id");if(caption!==undefined)content.caption=caption;if(subId!==undefined){product.subId=subId;job.subId=subId;}
 job.workflow.state.status="running";job.workflow.state.currentStage="publishing";const publishing=job.workflow.state.stages.find(s=>s.stage==="publishing");if(!publishing)throw new Error("Publishing stage is missing.");publishing.status="pending";delete publishing.error;
 const workflow=await executeWorkflow(job.workflow,createStageRegistry({product}));job.workflow=workflow;job.status=workflow.state.status==="completed"?"published":"failed";job.updatedAt=new Date().toISOString();await saveJob(job);
 console.log(`JOB ID: ${jobId}\nSUB ID: ${product.subId??job.subId}\nSTATUS: ${job.status.toUpperCase()}`);if(workflow.state.status==="failed")process.exit(1);
}
async function main(){if(args[0]!=="workflow")return usage();if(args[1]==="run"&&args.includes("--job-id"))return runFromJob();if(args[1]==="run")return runNewJob();if(args[1]==="approve")return approveJob();usage();}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
