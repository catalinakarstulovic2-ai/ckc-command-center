// api/clientes.js — CRUD + sync desde Agente Ads externo
'use strict';

const ADS_URL = 'https://web-production-385c9.up.railway.app';

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  // ── GET /api/clientes ───────────────────────────────────────
  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM clientes ORDER BY created_at DESC');
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/clientes/:id ───────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM clientes WHERE id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/clientes ──────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const { name, nicho, email, phone, services, notes } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });
      const { rows } = await pool.query(`
        INSERT INTO clientes (name,nicho,email,phone,services,notes)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, nicho||'', email||'', phone||'', services||'', notes||'']
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/clientes/:id ─────────────────────────────────
  router.patch('/:id', async (req, res) => {
    try {
      const allowed = ['name','nicho','email','phone','services','notes'];
      const body = req.body;
      const keys = Object.keys(body).filter(k => allowed.includes(k));
      if (!keys.length) return res.status(400).json({ error: 'No valid fields' });

      const vals = keys.map(k => body[k]);
      const set  = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
      vals.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE clientes SET ${set}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── DELETE /api/clientes/:id ────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM clientes WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/clientes/sync/ads ──────────────────────────────
  // Trae clientes desde el Agente Ads externo y los devuelve al frontend
  router.get('/sync/ads', async (_req, res) => {
    try {
      const adsRes = await fetch(`${ADS_URL}/clientes`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!adsRes.ok) throw new Error(`HTTP ${adsRes.status} desde Agente Ads`);
      const data = await adsRes.json();

      // Normalizar: el endpoint puede devolver array directo, o { clientes: [] }, etc.
      const list = Array.isArray(data) ? data
                 : data.clientes  ? data.clientes
                 : data.data      ? data.data
                 : Object.values(data).find(v => Array.isArray(v)) || [];

      res.json({ ok: true, count: list.length, data: list });
    } catch(e) {
      res.status(502).json({ ok: false, error: e.message, data: [] });
    }
  });

  // ── GET /api/clientes/sync/ads-campaigns ───────────────────
  // Trae campañas/alertas del Agente Ads para el Hub Central
  router.get('/sync/ads-campaigns', async (_req, res) => {
    try {
      // Intentar endpoints comunes del Agente Ads
      const endpoints = ['/campaigns', '/alertas', '/dashboard', '/stats'];
      let found = null;

      for (const ep of endpoints) {
        try {
          const r = await fetch(`${ADS_URL}${ep}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(4000),
          });
          if (r.ok) {
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('json')) { found = await r.json(); break; }
          }
        } catch{ /* intentar siguiente */ }
      }

      res.json({ ok: !!found, data: found });
    } catch(e) {
      res.status(502).json({ ok: false, error: e.message });
    }
  });

  return router;
};
