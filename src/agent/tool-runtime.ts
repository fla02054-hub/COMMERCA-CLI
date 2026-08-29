export type Tool = {
  name: string;
  description: string;
  run(input: unknown): Promise<unknown>;
};

export class AgentToolRuntime {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown agent tool: ${name}`);
    return tool.run(input);
  }
}
