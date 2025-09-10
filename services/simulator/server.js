// server.js — BRMS-lite con Postgres (versionado/publicación) + simulación
// CommonJS

const express = require('express');
const cors = require('cors');
const path = require('path'); // opcional si servís /public
const { Pool } = require('pg');
const { ZenEngine } = require('@gorules/zen-engine');

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 5174;
const ORIGINS = (process.env.ALLOW_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ORIGINS.includes('*') || ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json({ limit: '10mb' }));

// ---------- DB ----------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const sql = `
  CREATE TABLE IF NOT EXISTS graphs (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS graph_versions (
    id BIGSERIAL PRIMARY KEY,
    graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content JSONB NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(graph_id, version)
  );

  CREATE INDEX IF NOT EXISTS graph_versions_idx ON graph_versions (graph_id, version DESC);

  CREATE TABLE IF NOT EXISTS published (
    graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    env TEXT NOT NULL DEFAULT 'dev',
    version INT NOT NULL,
    published_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (graph_id, env)
  );`;
  await pool.query(sql);
}
migrate().catch(err => { console.error('DB migrate error:', err); process.exit(1); });

// ---------- Helpers ----------
const getEnv = (req) => (req.query.env || req.header('x-env') || 'dev');

// Para GUARDAR: aceptamos {graph:{...}} o grafo crudo {nodes,edges}
const extractGraphForSave = (body) => {
  if (!body) return null;
  if (body.graph) return body.graph;
  if (body.nodes && body.edges) return body;
  return null;
};

// Para SIMULAR: solo usamos graph inline si viene explícito
const extractGraphForSim = (body) => {
  if (!body) return null;
  return body.graph ? body.graph : null;
};

async function listGraphs() {
  const q = `
    SELECT g.id,
           COALESCE(g.name, g.id) AS name,
           g.updated_at,
           (SELECT MAX(version) FROM graph_versions v WHERE v.graph_id = g.id) AS latest_version
    FROM graphs g
    ORDER BY g.updated_at DESC, g.id ASC;
  `;
  const { rows } = await pool.query(q);
  return rows;
}

async function upsertGraphNewVersion(id, content, comment) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO graphs (id, name) VALUES ($1, $1) ON CONFLICT (id) DO UPDATE SET updated_at = now()',
      [id]
    );
    const { rows } = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM graph_versions WHERE graph_id = $1',
      [id]
    );
    const version = rows[0].v;
    await client.query(
      'INSERT INTO graph_versions (graph_id, version, content, comment) VALUES ($1, $2, $3::jsonb, $4)',
      [id, version, JSON.stringify(content), comment || null]
    );
    await client.query('COMMIT');
    return version;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getGraphVersion(id, version) {
  const { rows } = await pool.query(
    'SELECT content FROM graph_versions WHERE graph_id = $1 AND version = $2',
    [id, version]
  );
  return rows[0]?.content || null;
}

async function getLatestGraph(id) {
  const { rows } = await pool.query(
    'SELECT content, version FROM graph_versions WHERE graph_id = $1 ORDER BY version DESC LIMIT 1',
    [id]
  );
  return rows[0] ? { content: rows[0].content, version: rows[0].version } : null;
}

async function listVersions(id) {
  const { rows } = await pool.query(
    'SELECT version, comment, created_at FROM graph_versions WHERE graph_id = $1 ORDER BY version DESC',
    [id]
  );
  return rows;
}

async function deleteGraph(id) {
  await pool.query('DELETE FROM graphs WHERE id = $1', [id]);
}

async function setPublished(id, env, version) {
  await pool.query(
    'INSERT INTO published (graph_id, env, version) VALUES ($1, $2, $3) ' +
    'ON CONFLICT (graph_id, env) DO UPDATE SET version = EXCLUDED.version, published_at = now()',
    [id, env, version]
  );
}

async function getPublishedVersion(id, env) {
  const { rows } = await pool.query(
    'SELECT version FROM published WHERE graph_id = $1 AND env = $2',
    [id, env]
  );
  return rows[0]?.version || null;
}

// ---------- Endpoints ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Lista de grafos
app.get('/api/graphs', async (_req, res) => {
  try {
    const data = await listGraphs();
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Crear nueva versión (body: {graph:{...}} o grafo crudo)
app.post('/api/graphs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const model = extractGraphForSave(req.body);
    if (!model) return res.status(400).json({ error: 'graph is required' });
    const comment = req.body?.comment;
    const version = await upsertGraphNewVersion(id, model, comment);
    res.json({ ok: true, id, version });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener última o una versión específica (?version=N)
app.get('/api/graphs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const vq = req.query.version ? parseInt(String(req.query.version), 10) : null;
    if (vq) {
      const content = await getGraphVersion(id, vq);
      return res.json(content || {});
    }
    const latest = await getLatestGraph(id);
    res.json(latest?.content || {});
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Listar versiones
app.get('/api/graphs/:id/versions', async (req, res) => {
  try {
    const id = req.params.id;
    const versions = await listVersions(id);
    res.json(versions);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Publicar una versión (si no mandás version en body, publica la última)
app.post('/api/graphs/:id/publish', async (req, res) => {
  try {
    const id = req.params.id;
    const env = getEnv(req);
    let version = req.body?.version ? parseInt(String(req.body.version), 10) : null;
    if (!version) {
      const latest = await getLatestGraph(id);
      if (!latest) return res.status(404).json({ error: 'graph not found' });
      version = latest.version;
    }
    await setPublished(id, env, version);
    res.json({ ok: true, id, env, version });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Consultar versión publicada
app.get('/api/graphs/:id/published', async (req, res) => {
  try {
    const id = req.params.id;
    const env = getEnv(req);
    const version = await getPublishedVersion(id, env);
    res.json({ id, env, version });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Borrar grafo (todas sus versiones)
app.delete('/api/graphs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await deleteGraph(id);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Simulación ----------
const simulateHandler = async (req, res) => {
  const started = process.hrtime.bigint();
  try {
    const id = req.params.id;
    const env = getEnv(req);
    const payload = req.body?.payload ?? {};
    let model = extractGraphForSim(req.body); // SOLO graph inline si lo mandan
    let usedVersion = null;
    let source = 'inline';

    if (!model) {
      const qv = req.query.version ? parseInt(String(req.query.version), 10) : null;
      if (qv) {
        model = await getGraphVersion(id, qv);
        usedVersion = qv; source = 'version';
      } else {
        const pubV = await getPublishedVersion(id, env);
        if (pubV) {
          model = await getGraphVersion(id, pubV);
          usedVersion = pubV; source = 'published';
        } else {
          const latest = await getLatestGraph(id);
          model = latest?.content || null;
          usedVersion = latest?.version || null;
          source = 'latest';
        }
      }
    }

    // Defensas por si vino desde DB como string o quedó envuelto en {graph:{...}}
    if (typeof model === 'string') {
      try { model = JSON.parse(model); } catch {}
    }
    if (model && model.graph) model = model.graph;

    if (!model || !model.nodes || !model.edges) {
      return res.status(400).json({ error: 'graph is required (inline or stored) and must contain nodes/edges' });
    }

    const engine = new ZenEngine();
    const decision = engine.createDecision(Buffer.from(JSON.stringify(model)));
    const result = await decision.evaluate(payload);

    const micros = Number(process.hrtime.bigint() - started) / 1000;
    res.json({
      ok: true,
      id,
      env,
      usedVersion,
      source,
      performance: `${micros.toFixed(1)}µs`,
      result
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

app.post('/api/simulate/:id', simulateHandler);
// Compat: permitir /api/simulate (usa id "default")
app.post('/api/simulate', (req, res) => {
  req.params = { id: 'default' };
  return simulateHandler(req, res);
});

// (Opcional) servir una mini UI en / si agregás carpeta public/
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`zen-sim (pg) listening on :${PORT}`);
});
