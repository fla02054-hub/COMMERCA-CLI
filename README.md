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
- Retry support
- Resume from the failed/current Node
- Execution history
- Dry-run planning
- Idempotency key reserved for the POST side-effect boundary
- Backward-compatible loading of older Job files

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

## Data boundary

Each Node receives a `NodeContext` containing the Job, the connected input payload, and the current attempt number. Each Node returns a payload containing its declared output ports. The engine validates and persists that output before moving to the next connection.

This means future Agents/Models are implementation details inside Nodes, not dependencies of the Core.
