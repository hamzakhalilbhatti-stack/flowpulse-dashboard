/**
 * FlowPulse — Cloudflare Worker
 * ─────────────────────────────────────────────────────────────────
 * Acts as:
 *   1. Webhook RECEIVER  — n8n POSTs execution data here
 *   2. Data API          — Dashboard GETs stored executions here
 *
 * Uses Cloudflare KV for storage (free tier: 100k reads/day)
 *
 * SETUP:
 *   1. After deploying this worker, go to Settings → Variables
 *   2. Under "KV Namespace Bindings" click "Add binding"
 *   3. Variable name: FLOWPULSE_KV
 *   4. Create a new KV namespace called "flowpulse"
 *   5. Save and redeploy
 *
 * ROUTES:
 *   POST   /webhook       ← n8n sends execution data here
 *   GET    /executions    ← dashboard reads all executions
 *   DELETE /executions    ← clear all data
 *   GET    /ping          ← health check
 */

const ALLOWED_ORIGINS = [
  'https://yourusername.github.io',  // ← REPLACE with your GitHub Pages URL
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url    = new URL(request.url);
    const path   = url.pathname;

    if (request.method === 'OPTIONS') return cors(null, 204, origin);

    // GET /ping
    if (request.method === 'GET' && path === '/ping') {
      return cors(JSON.stringify({ ok: true, ts: Date.now() }), 200, origin);
    }

    // POST /webhook  — n8n sends execution results here
    if (request.method === 'POST' && path === '/webhook') {
      if (env.WEBHOOK_SECRET) {
        const token = request.headers.get('X-FlowPulse-Secret') || '';
        if (token !== env.WEBHOOK_SECRET)
          return cors(JSON.stringify({ error: 'Unauthorized' }), 401, origin);
      }

      let body;
      try { body = await request.json(); }
      catch { return cors(JSON.stringify({ error: 'Invalid JSON' }), 400, origin); }

      if (!body.workflowName)
        return cors(JSON.stringify({ error: 'workflowName required' }), 400, origin);

      const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const record = {
        id,
        workflowName:   body.workflowName   || 'Unknown',
        workflowId:     body.workflowId     || null,
        status:         body.status         || 'unknown',
        startedAt:      body.startedAt      || new Date().toISOString(),
        finishedAt:     body.finishedAt     || new Date().toISOString(),
        durationMs:     body.durationMs     || 0,
        itemsProcessed: body.itemsProcessed || 0,
        errorMessage:   body.errorMessage   || null,
        failedNode:     body.failedNode     || null,
        receivedAt:     new Date().toISOString(),
      };

      if (env.FLOWPULSE_KV) {
        await env.FLOWPULSE_KV.put(id, JSON.stringify(record), {
          expirationTtl: 60 * 60 * 24 * 30,
        });
        const raw   = await env.FLOWPULSE_KV.get('__index__');
        let index   = raw ? JSON.parse(raw) : [];
        index.unshift(id);
        if (index.length > 200) index = index.slice(0, 200);
        await env.FLOWPULSE_KV.put('__index__', JSON.stringify(index));
      }

      return cors(JSON.stringify({ ok: true, id }), 201, origin);
    }

    // GET /executions — dashboard polls this
    if (request.method === 'GET' && path === '/executions') {
      if (!env.FLOWPULSE_KV)
        return cors(JSON.stringify({ executions: getDemoData() }), 200, origin);

      const raw   = await env.FLOWPULSE_KV.get('__index__');
      const index = raw ? JSON.parse(raw) : [];
      if (!index.length)
        return cors(JSON.stringify({ executions: [] }), 200, origin);

      const records = await Promise.all(
        index.slice(0,100).map(k => env.FLOWPULSE_KV.get(k).then(v => v ? JSON.parse(v) : null))
      );
      const executions = records
        .filter(Boolean)
        .sort((a,b) => new Date(b.receivedAt) - new Date(a.receivedAt));

      return cors(JSON.stringify({ executions }), 200, origin);
    }

    // DELETE /executions
    if (request.method === 'DELETE' && path === '/executions') {
      if (env.FLOWPULSE_KV) {
        const raw   = await env.FLOWPULSE_KV.get('__index__');
        const index = raw ? JSON.parse(raw) : [];
        await Promise.all(index.map(k => env.FLOWPULSE_KV.delete(k)));
        await env.FLOWPULSE_KV.delete('__index__');
      }
      return cors(JSON.stringify({ ok: true }), 200, origin);
    }

    return cors(JSON.stringify({ error: 'Not found' }), 404, origin);
  }
};

function cors(body, status, origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || !origin;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowed ? (origin || '*') : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-FlowPulse-Secret',
    },
  });
}

function getDemoData() {
  const n = Date.now();
  return [
    { id:'d1', workflowName:'Lead Enrichment',   status:'success', startedAt:new Date(n-120000).toISOString(),  durationMs:1200, itemsProcessed:34, errorMessage:null,  failedNode:null,         receivedAt:new Date(n-119000).toISOString() },
    { id:'d2', workflowName:'Email Notifier',     status:'error',   startedAt:new Date(n-300000).toISOString(),  durationMs:500,  itemsProcessed:0,  errorMessage:'SMTP connection refused port 587', failedNode:'Send Email', receivedAt:new Date(n-299000).toISOString() },
    { id:'d3', workflowName:'CRM Sync',           status:'success', startedAt:new Date(n-600000).toISOString(),  durationMs:2200, itemsProcessed:12, errorMessage:null,  failedNode:null,         receivedAt:new Date(n-598000).toISOString() },
    { id:'d4', workflowName:'Slack Reporter',     status:'success', startedAt:new Date(n-900000).toISOString(),  durationMs:900,  itemsProcessed:5,  errorMessage:null,  failedNode:null,         receivedAt:new Date(n-899000).toISOString() },
    { id:'d5', workflowName:'Invoice Generator',  status:'error',   startedAt:new Date(n-1800000).toISOString(), durationMs:800,  itemsProcessed:0,  errorMessage:'Template not found', failedNode:'Generate PDF', receivedAt:new Date(n-1799000).toISOString() },
    { id:'d6', workflowName:'Data Backup',        status:'success', startedAt:new Date(n-3600000).toISOString(), durationMs:6000, itemsProcessed:201,errorMessage:null,  failedNode:null,         receivedAt:new Date(n-3594000).toISOString() },
    { id:'d7', workflowName:'Lead Enrichment',    status:'success', startedAt:new Date(n-7200000).toISOString(), durationMs:1100, itemsProcessed:28, errorMessage:null,  failedNode:null,         receivedAt:new Date(n-7198000).toISOString() },
  ];
}
