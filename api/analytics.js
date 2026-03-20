// api/analytics.js — Métricas calculadas desde datos reales
'use strict';

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  // ── GET /api/analytics/summary ─────────────────────────────
  router.get('/summary', async (_req, res) => {
    try {
      const [leadsRes, tareasRes, notifsRes, clientesRes] = await Promise.all([
        pool.query('SELECT status FROM leads'),
        pool.query('SELECT done FROM tareas'),
        pool.query('SELECT read FROM notificaciones'),
        pool.query('SELECT COUNT(*) AS count FROM clientes'),
      ]);

      const leads    = leadsRes.rows;
      const tareas   = tareasRes.rows;
      const notifs   = notifsRes.rows;
      const clientCount = parseInt(clientesRes.rows[0].count);

      const statuses = ['Nuevo','Contactado','Respondió','Cerrado','Perdido'];
      const byStatus = {};
      statuses.forEach(s => { byStatus[s] = leads.filter(l => l.status === s).length; });

      const total    = leads.length;
      const cerrados = byStatus['Cerrado'];
      const activos  = total - byStatus['Cerrado'] - byStatus['Perdido'];

      res.json({
        leads:   { total, activos, byStatus, conversionRate: total ? +(cerrados/total*100).toFixed(1) : 0 },
        tareas:  { total: tareas.length, pending: tareas.filter(t => !t.done).length, done: tareas.filter(t => t.done).length },
        notifs:  { unread: notifs.filter(n => !n.read).length },
        clientes: { total: clientCount },
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/leads-by-nicho ──────────────────────
  router.get('/leads-by-nicho', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT nicho, COUNT(*) AS count
        FROM leads
        WHERE nicho IS NOT NULL AND nicho <> ''
        GROUP BY nicho ORDER BY count DESC LIMIT 10
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/leads-by-month ──────────────────────
  router.get('/leads-by-month', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') AS month,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='Cerrado') AS cerrados
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month ORDER BY month ASC
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/leads-by-source ─────────────────────
  router.get('/leads-by-source', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT source, COUNT(*) AS count
        FROM leads
        WHERE source IS NOT NULL
        GROUP BY source ORDER BY count DESC
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/leads-by-country ────────────────────
  router.get('/leads-by-country', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT country, COUNT(*) AS count
        FROM leads
        WHERE country IS NOT NULL AND country <> ''
        GROUP BY country ORDER BY count DESC LIMIT 8
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/services ────────────────────────────
  router.get('/services', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT service, COUNT(*) AS count
        FROM leads
        WHERE service IS NOT NULL AND service <> ''
        GROUP BY service ORDER BY count DESC LIMIT 8
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/pipeline-value ──────────────────────
  router.get('/pipeline-value', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT status, SUM(deal_value) AS value, COUNT(*) AS count
        FROM leads
        GROUP BY status
      `);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/analytics/stale-leads ─────────────────────────
  // Leads en "Contactado" sin respuesta > N días (para alertas)
  router.get('/stale-leads', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 3;
      const { rows } = await pool.query(`
        SELECT id, name, nicho, last_contact,
               NOW()::date - last_contact AS days_since
        FROM leads
        WHERE status = 'Contactado'
          AND last_contact IS NOT NULL
          AND NOW()::date - last_contact >= $1
        ORDER BY days_since DESC
      `, [days]);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
