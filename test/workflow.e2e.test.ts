import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";
import { FunctionStage, WorkflowStageRegistry } from "../src/runtime/stages.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";
import type { Product } from "../src/product/types.js";

const fixtureProduct: Product = { id:"e2e-product-1",name:"COMMERCA E2E Test Product",image:"fixture://product-1",url:"https://example.invalid/product/1",price:299,originalPrice:599,discount:50,commission:100,rating:4.9,reviewCount:1500,salesCount:12000,promotion:"E2E promotion",source:"e2e-fixture",discoveredAt:new Date().toISOString() };

test("COMMERCA seven-stage direct-product workflow completes without search or research", async()=>{
  const result=await executeWorkflow(createRuntimeWorkflow(fixtureProduct.name),createStageRegistry({product:fixtureProduct}));
  assert.equal(result.state.status,"completed");
  assert.equal(result.state.stages.length,7);
  assert.deepEqual(result.state.stages.map(s=>s.status),WORKFLOW_STAGES.map(()=>"completed"));
  assert.deepEqual(result.state.transitionHistory,WORKFLOW_STAGES);
  assert.equal(result.state.currentStage,"final-package");
  for(const type of ["product-input","product-analysis","scorecard","selection","content-package","creative-strategy","production-package","qc-report","publication","final-package"]) assert.ok(result.artifacts.some(x=>x.type===type),`missing artifact: ${type}`);
  assert.equal(result.artifacts.some(x=>x.type==="product-profile"||x.type==="market-evidence"||x.type==="performance-report"||x.type==="decision"),false);
});

test("manual product input is required",async()=>{ const result=await executeWorkflow(createRuntimeWorkflow("manual input validation"),createStageRegistry()); assert.equal(result.state.status,"failed"); assert.equal(result.state.stages.find(s=>s.stage==="product-input")?.status,"failed"); assert.match(result.state.stages.find(s=>s.stage==="product-input")?.error??"",/Manual product input requires/); });

test("runtime retries a failed stage and marks workflow failed",async()=>{ const registry=new WorkflowStageRegistry(); for(const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage,async()=>{if(stage==="product-input")throw new Error("fixture failure"); return {artifacts:[{stage,type:`${stage}-ok`,data:{},createdAt:new Date().toISOString()}]}; })); const result=await executeWorkflow(createRuntimeWorkflow("retry test"),registry); const failed=result.state.stages.find(s=>s.stage==="product-input"); assert.equal(result.state.status,"failed"); assert.equal(failed?.status,"failed"); assert.equal(failed?.attempts,2); });

test("QC failure stops before final package",async()=>{ const registry=new WorkflowStageRegistry(); for(const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage,async()=>stage==="qc"?{artifacts:[{stage,type:"qc-report",data:{passed:false,issues:["fixture"]},createdAt:new Date().toISOString()}]}:{artifacts:[{stage,type:`${stage}-ok`,data:{},createdAt:new Date().toISOString()}]})); const result=await executeWorkflow(createRuntimeWorkflow("qc gate test"),registry); assert.equal(result.state.status,"failed"); assert.equal(result.state.stages.find(s=>s.stage==="qc")?.status,"failed"); assert.equal(result.state.stages.find(s=>s.stage==="final-package")?.status,"pending"); assert.equal(result.state.transitionHistory.at(-1),"qc"); });

test("successful workflow has an explicit terminal state",async()=>{ const registry=new WorkflowStageRegistry(); for(const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage,async()=>({artifacts:[{stage,type:`${stage}-ok`,data:{},createdAt:new Date().toISOString()}]}))); const result=await executeWorkflow(createRuntimeWorkflow("terminal test"),registry); assert.equal(result.state.status,"completed"); assert.equal(result.state.currentStage,"final-package"); assert.deepEqual(result.state.transitionHistory,WORKFLOW_STAGES); assert.equal(result.state.transitionHistory.length,7); });
