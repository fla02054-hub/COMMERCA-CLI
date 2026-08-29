# COMMERCA-CLI Workflow Blueprint

## Purpose

Define the complete automation flow before implementing downstream stages. Each stage has a stable boundary: input -> process -> output artifacts -> QC/decision -> next stage.

## End-to-end flow

`Goal -> Product Discovery -> Product Research -> Market Research -> Product Analysis -> Product Scoring -> Product Selection -> Content Strategy -> Creative Strategy -> Production -> QC -> Publishing -> Performance -> Decision/Learning -> feedback to Research`

## Stage contracts

| # | Stage | Primary input | Primary output | Gate |
|---|---|---|---|---|
| 1 | Goal | user objective | normalized goal | valid goal |
| 2 | Product Discovery | goal | product candidates | candidates found |
| 3 | Product Research | candidates | enriched product data | required fields/evidence |
| 4 | Market Research | products + goal | market/competitor evidence | evidence sufficient |
| 5 | Product Analysis | product + market evidence | analysis + reasons | analysis complete |
| 6 | Product Scoring | analysis | scored candidates | score calculated |
| 7 | Product Selection | scored candidates | selected product(s) | selection criteria met |
| 8 | Content Strategy | selected product + evidence | angles, hooks, copy brief, CTA | strategy complete |
| 9 | Creative Strategy | content strategy | creative concepts, storyboard, prompts | concept approved |
| 10 | Production | creative package | media assets/package | assets produced |
| 11 | QC | product + content + creative + assets | QC result | pass or revision |
| 12 | Publishing | QC-passed package | published records | publish success |
| 13 | Performance | published records + metrics | performance report | data available |
| 14 | Decision/Learning | performance + prior evidence | winner/loser + next actions | decision recorded |

## Required runtime behavior

- Preserve one workflow context across every stage.
- Every stage records status, attempt count, timestamps, errors, and artifact types.
- A failed stage must stop downstream execution unless an explicit retry/revision policy permits continuation.
- QC can route back to the producing stage for revision.
- Decision/Learning can route back to Product Research or Content Strategy for iteration.
- Providers are adapters behind interfaces; workflow stages must not depend on a single vendor.
- Secrets/API keys never belong in workflow artifacts.

## Artifact families

- Goal: `goal`
- Discovery: `product-candidate-list`
- Research: `product-profile`, `price-history`, `commission-data`, `market-evidence`, `competitor-evidence`
- Analysis: `product-analysis`, `scorecard`, `selection`
- Content: `content-strategy`, `content-package`
- Creative: `creative-brief`, `storyboard`, `creative-prompt`
- Production: `image`, `video`, `audio`, `subtitle`, `production-package`
- QC: `qc-report`
- Publishing: `publication`
- Performance: `performance-report`
- Learning: `decision`, `learning-record`

## Revision loops

`Production -> QC -> Production`

`Content Strategy -> Creative Strategy -> QC -> Content Strategy`

`Performance -> Decision/Learning -> Product Research / Content Strategy`

## Implementation order

1. Keep this blueprint and contracts stable.
2. Refactor runtime around the stage list and context/state model.
3. Add stage interfaces/adapters.
4. Implement stages one by one.
5. Add integration tests for the complete path and revision loops.
