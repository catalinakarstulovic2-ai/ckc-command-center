// api/tareas.js
'use strict';

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM tareas ORDER BY done ASC, due_date ASC NULLS LAST, created_at DESC');
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const { title, priority, due_date } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      const { rows } = await pool.query(
        'INSERT INTO tareas (title,priority,due_date) VALUES ($1,$2,$3) RETURNING *',
        [title, priority||'Media', due_date||null]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const { title, priority, due_date, done } = req.body;
      const { rows } = await pool.query(
        `UPDATE tareas SET
           title    = COALESCE($1, title),
           priority = COALESCE($2, priority),
           due_date = COALESCE($3, due_date),
           done     = COALESCE($4, done)
         WHERE id=$5 RETURNING *`,
        [title, priority, due_date, done, req.params.id]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM tareas WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
