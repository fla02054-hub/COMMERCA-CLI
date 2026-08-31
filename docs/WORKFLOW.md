# COMMERCA-CLI Workflow Blueprint

## Purpose

Define the direct-product automation flow with one clear responsibility per stage. Each stage has a stable boundary: input -> process -> output artifacts -> gate -> next stage.

## End-to-end flow

`Goal -> Product Input -> Product Analysis (analyze + score + select) -> Content Strategy -> Creative Strategy -> Production -> QC -> Publishing -> Final Package -> Performance -> Decision/Learning`

The current CLI accepts a selected/manual product directly. Product discovery and research are outside this direct-product workflow.

## Stage contracts

| # | Stage | Primary input | Primary output | Gate |
|---|---|---|---|---|
| 1 | Goal | user objective | `goal` | valid goal |
| 2 | Product Input | product supplied by user/provider | `product-input` | name, price, URL, image |
| 3 | Product Analysis | product | `product-analysis`, `scorecard`, `selection` | evaluation complete |
| 4 | Content Strategy | selected product + evaluation | `content-package` | content/product URL aligned |
| 5 | Creative Strategy | content package | `creative-strategy` | creative validation |
| 6 | Production | creative strategy | `production-package` | media generated |
| 7 | QC | product + content + creative + production | `qc-report` | pass or revision |
| 8 | Publishing | QC-passed production package | `publication` | publish/ready record |
| 9 | Final Package | all approved artifacts + publication | `final-package`, `post.txt` | serializable post-ready bundle |
| 10 | Performance | publication + metrics | `performance-report` | metrics available |
| 11 | Decision/Learning | performance + publication | `decision` | decision recorded |

## Responsibility boundaries

- **Product Analysis owns analysis, scoring and selection together.** The workflow does not run ranking/scoring again in Content Strategy.
- **Creative Strategy owns specifications** (concepts, storyboard, prompts). **Production owns actual media generation.**
- **Publishing owns the external publication action only.** It does not assemble or serialize the final package.
- **Final Package owns assembly and file serialization only.** It never publishes.
- **QC is the gate before publishing and revision routing.**
- **Performance reports metrics; Decision/Learning decides what to optimize.**

## Revision loops

`Production -> QC -> Production`

`Creative Strategy -> QC -> Creative Strategy`

`Content Strategy -> QC -> Content Strategy`

`Performance -> Decision/Learning -> Content Strategy`

## Runtime behavior

- Preserve one workflow context across every stage.
- Every stage records status, attempt count, timestamps, errors, and artifact types.
- Failed stages stop downstream execution unless retry/revision policy permits continuation.
- Providers remain adapters behind stage boundaries.
- Secrets/API keys never belong in workflow artifacts.
