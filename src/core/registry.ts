import type { FlowNode, NodeName } from "./types.js";

export class NodeRegistry {
  private readonly nodes = new Map<NodeName, FlowNode>();

  register(node: FlowNode): void {
    if (this.nodes.has(node.name)) throw new Error(`Node already registered: ${node.name}`);
    this.nodes.set(node.name, node);
  }

  registerAll(nodes: readonly FlowNode[]): void {
    for (const node of nodes) this.register(node);
  }

  get(name: NodeName): FlowNode {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`Node is not registered: ${name}`);
    return node;
  }

  has(name: NodeName): boolean {
    return this.nodes.has(name);
  }

  list(): FlowNode[] {
    return [...this.nodes.values()];
  }
}
