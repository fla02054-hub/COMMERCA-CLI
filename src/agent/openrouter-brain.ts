import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";
import { chooseSearchAction } from "./autonomous-progress-guard.js";
type BrowserControl = { tag:string; role:string; name:string; placeholder:string; selector:string };
export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey=process.env.OPENROUTER_API_KEY; private model?:string;
  async decide(input:{goal:string;observation?:unknown;history:AgentAction[]}) {
    if(!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if(!this.model) this.model=process.env.OPENROUTER_MODEL||(await selectFreeModel(this.apiKey)).id;
    const observation=input.observation as any; const controls:BrowserControl[]=Array.isArray(observation?.controls)?observation.controls:[];
    const hasObservation=Boolean(observation&&!observation.error);
    const lastBrowserAction=[...input.history].reverse().find(x=>x.type==="use_tool"&&x.tool==="browser")?.input as any;
    const forced=hasObservation?chooseSearchAction({goal:input.goal,controls,lastBrowserAction}):undefined;
    if(forced) return {action:"use_tool" as const,tool:"browser",input:forced,reason:`Autonomous progress guard selected ${forced.action}.`};
    const actionEnum=hasObservation?["click","type","press","scroll","find","extract"]:["open","observe","click","type","press","scroll","find","extract"];
    const tools=[{type:"function",function:{name:"browser",description:"Execute one browser action in real Chrome.",parameters:{type:"object",additionalProperties:false,properties:{action:{type:"string",enum:actionEnum},url:{type:"string"},selector:{type:"string"},text:{type:"string"},key:{type:"string"},amount:{type:"number"}},required:["action"]}}}];
    const response=await fetch(OPENROUTER_URL,{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json","HTTP-Referer":"https://github.com/fla02054-hub/COMMERCA-CLI","X-Title":"COMMERCA Autonomous Agent"},body:JSON.stringify({model:this.model,temperature:0,max_tokens:500,tools,tool_choice:"required",messages:[{role:"system",content:"You are an autonomous browser agent. Return exactly one executable browser tool call. Never choose observe when an observation already exists. Use only selectors supplied by observation. Continue until the goal is verifiably achieved."},{role:"user",content:JSON.stringify({goal:input.goal,page:hasObservation?{url:observation.url,title:observation.title,text:observation.text?.slice(0,12000)}:null,controls:controls.slice(0,80),lastBrowserAction:lastBrowserAction||null,history:input.history.slice(-16)})}]})});
    if(!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload=await response.json() as any; const call=payload.choices?.[0]?.message?.tool_calls?.[0];
    if(!call?.function?.arguments) throw new Error(`OpenRouter model ${this.model} did not return a browser tool call.`);
    const action=JSON.parse(call.function.arguments);
    if(hasObservation&&action.action==="observe") return {action:"use_tool" as const,tool:"browser",input:{action:"extract"},reason:"Prevented an observation loop."};
    return {action:"use_tool" as const,tool:"browser",input:action,reason:`OpenRouter ${this.model} selected ${action.action}.`};
  }
  getModel(){return this.model;}
}
