// CKC Command Center — Express Server
'use strict';

const express = require('express');
const path    = require('path');
const { Pool } = require('pg');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── PostgreSQL ──────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set — check Railway environment variables');
}
console.log('🔌 DATABASE_URL present:', !!process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }  // Railway / Supabase
    : false,
});

// ── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── API Routes ──────────────────────────────────────────────
app.use('/api/leads',         require('./api/leads')(pool));
app.use('/api/clientes',      require('./api/clientes')(pool));
app.use('/api/tareas',        require('./api/tareas')(pool));
app.use('/api/eventos',       require('./api/eventos')(pool));
app.use('/api/notifications', require('./api/notifications')(pool));
app.use('/api/analytics',     require('./api/analytics')(pool));

// ── Frontend ────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Health check ─────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ status: 'error', db: e.message });
  }
});

// ── Init DB ─────────────────────────────────────────────────
async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema OK');
  } catch(e) {
    console.error('❌ DB init error:', e.message);
  }
}

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 CKC running → http://localhost:${PORT}`);
  await initDB();
});
