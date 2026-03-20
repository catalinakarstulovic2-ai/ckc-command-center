// api/eventos.js
'use strict';

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const { from, to } = req.query;
      let q = `SELECT e.*, c.name AS client_name
               FROM eventos_calendario e
               LEFT JOIN clientes c ON c.id = e.client_id
               WHERE 1=1`;
      const params = [];
      if (from) { params.push(from); q += ` AND date >= $${params.length}`; }
      if (to)   { params.push(to);   q += ` AND date <= $${params.length}`; }
      q += ' ORDER BY date ASC, time ASC';
      const { rows } = await pool.query(q, params);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const { title, date, time, type, client_id, notes } = req.body;
      if (!title || !date) return res.status(400).json({ error: 'title y date requeridos' });
      const { rows } = await pool.query(`
        INSERT INTO eventos_calendario (title,date,time,type,client_id,notes)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [title, date, time||null, type||'Otro', client_id||null, notes||'']
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const { title, date, time, type, client_id, notes } = req.body;
      const { rows } = await pool.query(`
        UPDATE eventos_calendario SET
          title     = COALESCE($1, title),
          date      = COALESCE($2, date),
          time      = COALESCE($3, time),
          type      = COALESCE($4, type),
          client_id = COALESCE($5, client_id),
          notes     = COALESCE($6, notes)
        WHERE id=$7 RETURNING *`,
        [title, date, time, type, client_id, notes, req.params.id]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM eventos_calendario WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
