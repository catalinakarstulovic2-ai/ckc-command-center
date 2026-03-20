-- CKC Command Center — Schema
-- Idempotente: se puede ejecutar múltiples veces

CREATE TABLE IF NOT EXISTS leads (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  nicho         VARCHAR(255),
  city          VARCHAR(255),
  country       VARCHAR(255),
  phone         VARCHAR(100),
  email         VARCHAR(255),
  service       VARCHAR(255),
  status        VARCHAR(50)  NOT NULL DEFAULT 'Nuevo',
  deal_value    DECIMAL(12,2)         DEFAULT 0,
  source        VARCHAR(50)           DEFAULT 'manual',
  apify_id      VARCHAR(255),
  apollo_id     VARCHAR(255),
  last_contact  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ           DEFAULT NOW(),
  updated_at    TIMESTAMPTZ           DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_activity (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status   VARCHAR(50),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  nicho       VARCHAR(255),
  email       VARCHAR(255),
  phone       VARCHAR(100),
  services    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tareas (
  id          SERIAL PRIMARY KEY,
  title       TEXT    NOT NULL,
  priority    VARCHAR(20) DEFAULT 'Media',
  due_date    DATE,
  done        BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eventos_calendario (
  id          SERIAL PRIMARY KEY,
  title       TEXT    NOT NULL,
  date        DATE    NOT NULL,
  time        TIME,
  type        VARCHAR(100),
  client_id   INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(50),
  icon        VARCHAR(10),
  title       VARCHAR(255),
  message     TEXT,
  read        BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email     ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source    ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created   ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_date    ON eventos_calendario(date);
CREATE INDEX IF NOT EXISTS idx_tareas_done     ON tareas(done);
