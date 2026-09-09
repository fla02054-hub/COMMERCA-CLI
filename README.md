# COMMERCA-CLI

A CLI-only, n8n-style workflow engine for commerce automation.

## Architecture

AIDEN is the admin/controller boundary. The executable workflow contains exactly six business Nodes:

```text
AIDEN
  ↓
PRODUCT
  ↓
ANALYSIS
  ↓
CONTENT
  ↓
PRODUCTION
  ↓
POST
  ↓
POST ANALYSIS
  ↓
AIDEN
```

The Core Engine owns workflow execution. AIDEN starts/resumes jobs; the Engine follows the workflow connections automatically. A Node never decides which Node runs next.

The core is deliberately independent of Agent, Model, AI provider, credentials, Discord, Shopee, Facebook, Higgsfield, or any other external service. Those can be plugged into individual Nodes later without changing the workflow engine.

## Core guarantees

- Versioned Workflow Definition
- Node Registry
- Strict Node input/output port validation
- Linear graph validation and cycle detection
- Persistent Job State in `.commerca/jobs`
- Atomic job-file writes
- Execution ID and Workflow version on every new Job
- Per-Node execution state and attempt count
- Retry support without restarting completed Nodes
- Resume from the failed/current Node
- Execution history
- Per-node timeout with `AbortSignal`
- Dry-run planning
- Idempotency key reserved for the POST side-effect boundary
- Backward-compatible loading of older Job files
- Automated build and test in GitHub Actions

## Commands

```text
npm install
npm run build
npm test
```

Run a workflow:

```text
npm run dev -- workflow run --product "Product name" --price 7795 --original-price 9999 --url "https://example.com/product" --image "C:\\path\\image.jpg"
```

Retry a failed Node up to three attempts:

```text
npm run dev -- workflow run --product "Product name" --retry 3
```

Set a per-node timeout:

```text
npm run dev -- workflow run --product "Product name" --timeout-ms 60000
```

Resume a failed Job:

```text
npm run dev -- workflow resume --id JOB_ID --retry 3
```

Inspect the system:

```text
npm run dev -- flow
npm run dev -- workflow show
npm run dev -- workflow validate
npm run dev -- workflow plan
npm run dev -- job list
npm run dev -- job show --id JOB_ID
```

Dry run:

```text
npm run dev -- workflow run --product "Product name" --dry-run
```

## Execution model

The Engine executes the graph in this order:

```text
create Job
  ↓
PRODUCT
  ↓ save state
ANALYSIS
  ↓ save state
CONTENT
  ↓ save state
PRODUCTION
  ↓ save state
POST
  ↓ save state
POST ANALYSIS
  ↓
completed
```

For every Node the Engine:

1. marks the Node as `running`;
2. persists the Job;
3. creates an execution context and abort signal;
4. executes the Node, with retry and timeout handling;
5. validates the returned output ports;
6. persists the output and typed Job data;
7. follows the configured connection to the next Node.

If a Node fails, the Job becomes `failed` and the completed Nodes remain completed. `resume` reconstructs the failed Node's input from the persisted upstream output and continues from that Node.

## Data boundary

Each Node receives a `NodeContext` containing the Job, the connected input payload, execution metadata, and an `AbortSignal`. Each Node returns a payload containing its declared output ports. The Engine validates and persists that output before moving to the next connection.

This keeps workflow control separate from business logic. Future Agents/Models are implementation details inside Nodes, not dependencies of the Core.
