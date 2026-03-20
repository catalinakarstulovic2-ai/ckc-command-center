// api/leads.js — Leads CRUD + Apify import + CSV bulk + deduplicación
'use strict';

const FIELDS = ['name','nicho','city','country','phone','email','service',
                'status','deal_value','source','notes','apify_id','apollo_id','last_contact',
                'tipo','ciudad_pais','problema','urgencia','probabilidad_cierre',
                'canal','fuente_verificacion','mensaje'];

module.exports = function(pool) {
  const { Router } = require('express');
  const router = Router();

  // ── GET /api/leads ──────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { status, nicho, search } = req.query;
      const params = [];
      const conds  = [];

      if (status) { params.push(status);       conds.push(`status = $${params.length}`); }
      if (nicho)  { params.push(nicho);        conds.push(`nicho  = $${params.length}`); }
      if (search) {
        params.push(`%${search}%`);
        const n = params.length;
        conds.push(`(name ILIKE $${n} OR email ILIKE $${n} OR nicho ILIKE $${n})`);
      }

      const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
      const { rows } = await pool.query(
        `SELECT * FROM leads ${where} ORDER BY created_at DESC`, params
      );
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/leads/nichos ──────────────────────────────────
  router.get('/nichos', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT nicho FROM leads WHERE nicho IS NOT NULL AND nicho <> '' ORDER BY nicho`
      );
      res.json(rows.map(r => r.nicho));
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/leads/accion-diaria ────────────────────────────
  router.get('/accion-diaria', async (_req, res) => {
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      const [contactarQ, followupQ, calientesQ] = await Promise.all([
        // Nuevos + contactados hace más de 2 días sin respuesta
        pool.query(`
          SELECT * FROM leads
          WHERE status = 'Nuevo'
             OR (status = 'Contactado' AND (last_contact IS NULL OR last_contact <= $1))
          ORDER BY created_at DESC`, [twoDaysAgo]),
        // Contactados recientemente (menos de 2 días), aún sin respuesta
        pool.query(`
          SELECT * FROM leads
          WHERE status = 'Contactado' AND last_contact > $1
          ORDER BY last_contact DESC`, [twoDaysAgo]),
        // Leads que respondieron
        pool.query(`
          SELECT * FROM leads
          WHERE status = 'Respondió'
          ORDER BY updated_at DESC`),
      ]);

      res.json({
        contactar_hoy: contactarQ.rows,
        follow_up:     followupQ.rows,
        calientes:     calientesQ.rows,
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/leads ─────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const d = req.body;
      const { rows } = await pool.query(`
        INSERT INTO leads
          (name,nicho,city,country,phone,email,service,status,deal_value,source,notes,apify_id,apollo_id,last_contact)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *`,
        [d.name, d.nicho||null, d.city||null, d.country||null,
         d.phone||null, d.email||null, d.service||null,
         d.status||'Nuevo', d.deal_value||0, d.source||'manual',
         d.notes||null, d.apify_id||null, d.apollo_id||null,
         d.last_contact||new Date().toISOString().split('T')[0]]
      );
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/leads/:id ────────────────────────────────────
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body;

      // Obtener status anterior para registrar actividad
      const prev = await pool.query('SELECT status FROM leads WHERE id=$1', [id]);
      const oldStatus = prev.rows[0]?.status;

      const allowed = Object.keys(body).filter(k => FIELDS.includes(k));
      if (!allowed.length) return res.status(400).json({ error: 'No valid fields' });

      const vals = allowed.map(k => body[k]);
      const set  = allowed.map((k, i) => `${k}=$${i+1}`).join(', ');
      vals.push(id);

      const { rows } = await pool.query(
        `UPDATE leads SET ${set}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals
      );

      // Registrar cambio de status o acción forzada (con nota)
      if ((body.status && body.status !== oldStatus) || body._note) {
        await pool.query(
          'INSERT INTO lead_activity (lead_id,from_status,to_status,note) VALUES ($1,$2,$3,$4)',
          [id, oldStatus, body.status || oldStatus, body._note || null]
        );
      }

      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/leads/:id/historial ────────────────────────────
  router.get('/:id/historial', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM lead_activity WHERE lead_id=$1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── DELETE /api/leads/:id ───────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/leads/import-apify ────────────────────────────
  router.post('/import-apify', async (req, res) => {
    try {
      const { datasetId, token, nicho, service } = req.body;
      if (!datasetId || !token) return res.status(400).json({ error: 'datasetId y token requeridos' });

      const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&clean=true&limit=1000`;
      const apifyRes = await fetch(url);
      if (!apifyRes.ok) throw new Error(`Apify error ${apifyRes.status}`);
      const items = await apifyRes.json();

      let added = 0, skipped = 0;

      for (const item of items) {
        const email = item.email || item.emails?.[0] || '';
        const phone = item.phone || item.phoneNumber || item.phones?.[0] || '';
        const name  = item.name  || item.fullName || item.title
                   || item.firstName && `${item.firstName} ${item.lastName||''}`.trim()
                   || 'Sin nombre';
        const city    = item.city    || item.location?.city    || item.address?.city    || '';
        const country = item.country || item.location?.country || item.address?.country || '';
        const apifyId = String(item.id || item._id || '').slice(0, 255);

        if (email) {
          const { rows } = await pool.query('SELECT id FROM leads WHERE email=$1', [email]);
          if (rows.length) { skipped++; continue; }
        }
        if (apifyId) {
          const { rows } = await pool.query('SELECT id FROM leads WHERE apify_id=$1', [apifyId]);
          if (rows.length) { skipped++; continue; }
        }

        await pool.query(`
          INSERT INTO leads
            (name,nicho,city,country,phone,email,service,status,source,apify_id,last_contact)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'Nuevo','apify',$8,NOW()::date)`,
          [name, nicho||item.industry||'', city, country, phone, email, service||'', apifyId]
        );
        added++;
      }

      await pool.query(
        `INSERT INTO notificaciones (type,icon,title,message) VALUES ('success','📥','Apify Importado',$1)`,
        [`${added} leads importados, ${skipped} duplicados omitidos`]
      );

      res.json({ added, skipped, total: items.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/leads/import-csv ──────────────────────────────
  router.post('/import-csv', async (req, res) => {
    try {
      const { leads: csvLeads } = req.body;
      if (!Array.isArray(csvLeads)) return res.status(400).json({ error: 'leads array required' });

      let added = 0, skipped = 0;

      for (const lead of csvLeads) {
        if (!lead.name) continue;

        // Deduplicar por teléfono
        if (lead.phone) {
          const { rows } = await pool.query('SELECT id FROM leads WHERE phone=$1', [lead.phone]);
          if (rows.length) { skipped++; continue; }
        }
        // Deduplicar por email
        if (lead.email) {
          const { rows } = await pool.query('SELECT id FROM leads WHERE email=$1', [lead.email]);
          if (rows.length) { skipped++; continue; }
        }

        await pool.query(`
          INSERT INTO leads
            (name,nicho,ciudad_pais,city,country,phone,email,service,deal_value,
             status,source,notes,tipo,problema,urgencia,probabilidad_cierre,
             canal,fuente_verificacion,mensaje,last_contact)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'csv',$11,$12,$13,$14,$15,$16,$17,$18,NOW()::date)`,
          [lead.name,       lead.nicho||'',              lead.ciudad_pais||'',
           lead.city||'',   lead.country||'',            lead.phone||'',
           lead.email||'',  lead.service||'',            lead.deal_value||0,
           lead.status||'Nuevo',                         lead.notes||'',
           lead.tipo||'',   lead.problema||'',           lead.urgencia||'',
           lead.probabilidad_cierre||null,               lead.canal||'',
           lead.fuente_verificacion||'',                 lead.mensaje||'']
        );
        added++;
      }

      await pool.query(
        `INSERT INTO notificaciones (type,icon,title,message) VALUES ('success','📂','CSV Importado',$1)`,
        [`${added} leads importados, ${skipped} duplicados omitidos`]
      );

      res.json({ added, skipped });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
