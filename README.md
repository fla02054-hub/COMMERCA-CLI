# COMMERCA-CLI

Clean n8n-style workflow engine.

## Flow

AIDEN (manager, outside the flow) -> PRODUCT -> ANALYSIS -> CONTENT -> PRODUCTION -> POST -> POST ANALYSIS -> AIDEN.

There are exactly six flow Nodes. No model, AI provider, credentials, Discord gateway, or external service is connected in this base build.

## Run

npm install
npm run dev -- workflow run --product "Product name" --price 7795 --original-price 9999 --url "https://example.com/product" --image "C:\\path\\image.jpg"

## Inspect

npm run dev -- flow
npm run dev -- job list
npm run dev -- job show --id JOB_ID
npm run build
