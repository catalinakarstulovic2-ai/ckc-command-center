// api/notifications.js
'use strict';

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM notificaciones ORDER BY created_at DESC LIMIT 100');
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const { type, icon, title, message } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO notificaciones (type,icon,title,message) VALUES ($1,$2,$3,$4) RETURNING *',
        [type||'info', icon||'🔔', title, message]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Marcar una como leída
  router.patch('/:id/read', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'UPDATE notificaciones SET read=TRUE WHERE id=$1 RETURNING *', [req.params.id]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Marcar todas como leídas
  router.post('/read-all', async (_req, res) => {
    try {
      await pool.query('UPDATE notificaciones SET read=TRUE');
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
