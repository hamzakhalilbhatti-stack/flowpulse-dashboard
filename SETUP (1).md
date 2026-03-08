# ⚡ FlowPulse Setup Guide
## Webhook Mode (n8n Trial Compatible)

Get live n8n data flowing into your dashboard in ~15 minutes.

---

## Architecture

```
n8n Workflow finishes
        ↓  HTTP POST (Code node)
Cloudflare Worker  ← stores data in KV (free)
        ↓  GET every 10s
FlowPulse Dashboard (GitHub Pages)
```

---

## Step 1 — Deploy Cloudflare Worker (5 min)

1. Go to **https://workers.cloudflare.com** → Sign up free
2. Click **Workers & Pages** → **Create** → **Start with Hello World!**
3. Name it `flowpulse` → click **Deploy**
4. Click **Edit Code**
5. Select all default code → delete it
6. Open `worker.js` from this repo → copy everything → paste it
7. Find this line and replace with your GitHub Pages URL:
   ```js
   'https://yourusername.github.io',  // ← your URL
   ```
8. Click **Deploy**
9. **Copy your Worker URL** — looks like `https://flowpulse.yourname.workers.dev`

### Set Up KV Storage (so data persists)

1. In your worker, go to **Settings → Variables**
2. Scroll to **KV Namespace Bindings** → **Add binding**
3. Variable name: `FLOWPULSE_KV`
4. Click **Create namespace** → name it `flowpulse` → confirm
5. Click **Save and deploy**

> Without KV, the worker still works but uses demo data.
> With KV, real n8n execution data is stored and retrieved.

---

## Step 2 — Deploy Dashboard to GitHub Pages (3 min)

1. Create a new GitHub repo: `flowpulse-dashboard`
2. Upload these files:
   - `index.html`
   - `worker.js`
   - `flowpulse-reporter.json`
   - `SETUP.md`
3. Go to **Settings → Pages → Source** → select `main` → `/root`
4. Click **Save**
5. Your URL: `https://yourusername.github.io/flowpulse-dashboard`

---

## Step 3 — Add Reporter to Your n8n Workflows (5 min per workflow)

### Option A: Import the template
1. In n8n, go to **Workflows → Import**
2. Upload `flowpulse-reporter.json`
3. You'll see two Code nodes: **Report Success** and **Report Error**
4. Copy these nodes into your existing workflows

### Option B: Add a Code node manually
1. Open any workflow in n8n
2. Add a **Code** node at the very end (after your last node)
3. Paste this code:

```javascript
const WORKER_URL    = 'https://flowpulse.yourname.workers.dev'; // ← your URL
const WORKFLOW_NAME = 'My Workflow Name'; // ← change to match your workflow

const startedAt  = new Date($execution.startedAt);
const finishedAt = new Date();
const durationMs = finishedAt - startedAt;

let itemsProcessed = 0;
try { itemsProcessed = $input.all().length; } catch(e) {}

await fetch(WORKER_URL + '/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflowName:   WORKFLOW_NAME,
    workflowId:     $workflow.id,
    status:         'success',
    startedAt:      startedAt.toISOString(),
    finishedAt:     finishedAt.toISOString(),
    durationMs:     durationMs,
    itemsProcessed: itemsProcessed,
    errorMessage:   null,
    failedNode:     null,
  }),
});

return $input.all();
```

4. For **error reporting**, add another Code node connected to node error outputs:

```javascript
const WORKER_URL    = 'https://flowpulse.yourname.workers.dev';
const WORKFLOW_NAME = 'My Workflow Name';

let errorMessage = 'Unknown error';
let failedNode   = 'Unknown';
try {
  const d = $input.first()?.json;
  errorMessage = d?.error?.message || d?.message || 'Execution failed';
  failedNode   = d?.execution?.lastNodeExecuted || 'Unknown';
} catch(e) {}

await fetch(WORKER_URL + '/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflowName:   WORKFLOW_NAME,
    workflowId:     $workflow.id,
    status:         'error',
    startedAt:      new Date($execution.startedAt).toISOString(),
    finishedAt:     new Date().toISOString(),
    durationMs:     Date.now() - new Date($execution.startedAt),
    itemsProcessed: 0,
    errorMessage:   errorMessage,
    failedNode:     failedNode,
  }),
});

return $input.all();
```

---

## Step 4 — Open the Dashboard

1. Go to your GitHub Pages URL
2. Log in with any email + password (6+ chars)
3. Check **"Connect FlowPulse Worker on login"**
4. Enter your Worker URL
5. Click **Sign In**

Every time an n8n workflow runs, your dashboard updates within 10 seconds! ✅

---

## Data Each Workflow Sends

| Field | Example |
|---|---|
| workflowName | "Lead Enrichment" |
| status | "success" or "error" |
| durationMs | 1420 |
| itemsProcessed | 34 |
| errorMessage | "SMTP timeout" (if failed) |
| failedNode | "Send Email" (if failed) |

---

## Troubleshooting

**Dashboard shows demo data**
→ KV storage not set up. See Step 1 → KV section.

**Webhook not receiving data**
→ Check WORKER_URL in your n8n Code node matches your worker URL exactly.

**CORS error in browser**
→ Update `ALLOWED_ORIGINS` in `worker.js` with your GitHub Pages URL and redeploy.

**n8n Code node fails**
→ Make sure your n8n trial allows outbound HTTP requests (it does by default).

---

## Upgrading Later

When you upgrade to n8n paid plan:
- Keep the webhooks (they still work)
- Add the n8n Cloud API key in Settings
- Get even more data: scheduled executions, all historical data, workflow metadata

---

*FlowPulse — n8n Automation Intelligence*
