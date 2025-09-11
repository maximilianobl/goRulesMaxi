// server.js — BRMS-lite extendido para simular funcionalidad completa
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { ZenEngine } = require('@gorules/zen-engine');
const crypto = require('crypto');

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

// Middleware simple de autenticación (opcional)
const authenticate = async (req, res, next) => {
  // En un sistema real, verificarías el token JWT o similar
  req.user = {
    id: '00000000-0000-0000-0000-000000000001',
    organisationId: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000001'
  };
  next();
};

// ---------- Helpers ----------
const getEnv = (req) => (req.query.env || req.header('x-env') || 'dev');
const getProject = (req) => (req.query.project || req.user?.projectId || '00000000-0000-0000-0000-000000000001');

const auditLog = async (type, action, refId, data, userId, projectId, ipAddress, userAgent) => {
  try {
    await pool.query(
      `INSERT INTO audit_log (type, action, ref_id, data, user_id, project_id, 
       organisation_id, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [type, action, refId, JSON.stringify(data), userId, projectId,
        '00000000-0000-0000-0000-000000000001', ipAddress, userAgent]
    );
  } catch (e) {
    console.error('Audit log error:', e);
  }
};

// ---------- Document Management ----------
class DocumentService {
  static async listDocuments(projectId) {
    const { rows } = await pool.query(`
      SELECT d.id, d.key, d.path, d.name, d.content_type, d.meta,
             d.published_at, d.updated_at,
             (SELECT COUNT(*) FROM document_version dv WHERE dv.document_id = d.id) as version_count,
             (SELECT MAX(created_at) FROM document_version dv WHERE dv.document_id = d.id) as last_version_at
      FROM "document" d
      WHERE d.project_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC
    `, [projectId]);
    return rows;
  }

  static async getDocument(projectId, documentKey) {
    // Primero intentar obtener la versión publicada
    let { rows } = await pool.query(`
      SELECT d.*, dv.content, dv.id as version_id, 'published' as source
      FROM "document" d
      JOIN document_version dv ON d.published_id = dv.id
      WHERE d.project_id = $1 AND d.key = $2 AND d.deleted_at IS NULL
    `, [projectId, documentKey]);

    // Si no hay versión publicada, obtener la última versión
    if (rows.length === 0) {
      ({ rows } = await pool.query(`
        SELECT d.*, dv.content, dv.id as version_id, 'latest' as source
        FROM "document" d
        JOIN document_version dv ON dv.document_id = d.id
        WHERE d.project_id = $1 AND d.key = $2 AND d.deleted_at IS NULL
        ORDER BY dv.created_at DESC
        LIMIT 1
      `, [projectId, documentKey]));
    }

    return rows[0] || null;
  }

  static async getDocumentVersion(projectId, documentKey, versionId) {
    const { rows } = await pool.query(`
      SELECT d.*, dv.content, dv.id as version_id, 'version' as source
      FROM "document" d
      JOIN document_version dv ON dv.document_id = d.id
      WHERE d.project_id = $1 AND d.key = $2 AND dv.id = $3 AND d.deleted_at IS NULL
    `, [projectId, documentKey, versionId]);

    return rows[0] || null;
  }

  // Función mejorada para obtener por número de versión
  static async getDocumentByVersionNumber(projectId, documentKey, versionNumber) {
    const { rows } = await pool.query(`
      SELECT d.*, dv.content, dv.id as version_id, 'version_number' as source
      FROM "document" d
      JOIN document_version dv ON dv.document_id = d.id
      WHERE d.project_id = $1 AND d.key = $2 AND d.deleted_at IS NULL
      ORDER BY dv.created_at ASC
      LIMIT 1 OFFSET $3
    `, [projectId, documentKey, versionNumber - 1]);

    return rows[0] || null;
  }

  static async createDocumentVersion(documentId, content, userId, comment) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: versions } = await client.query(
        'INSERT INTO document_version (document_id, content, created_by_id, comment) VALUES ($1, $2::jsonb, $3, $4) RETURNING id',
        [documentId, JSON.stringify(content), userId, comment]
      );

      await client.query(
        'UPDATE "document" SET updated_at = now() WHERE id = $1',
        [documentId]
      );

      await client.query('COMMIT');
      return versions[0].id;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async publishVersion(documentId, versionId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE "document" 
        SET published_id = $1, published_at = now(), published_by_id = $2
        WHERE id = $3
      `, [versionId, userId, documentId]);

      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async getVersions(documentId) {
    const { rows } = await pool.query(`
      SELECT dv.id, dv.comment, dv.created_at, dv.status,
             u.first_name, u.last_name, u.email
      FROM document_version dv
      LEFT JOIN "user" u ON dv.created_by_id = u.id
      WHERE dv.document_id = $1
      ORDER BY dv.created_at DESC
    `, [documentId]);
    return rows;
  }

  static async getVersionContent(versionId) {
    const { rows } = await pool.query(
      'SELECT content FROM document_version WHERE id = $1',
      [versionId]
    );
    return rows[0]?.content || null;
  }
}

// ---------- Environment Management ----------
class EnvironmentService {
  static async getEnvironments(projectId) {
    const { rows } = await pool.query(`
      SELECT e.*, r.name as release_name, r.version as release_version
      FROM environment e
      LEFT JOIN "release" r ON e.release_id = r.id
      WHERE e.project_id = $1 AND e.deleted_at IS NULL
      ORDER BY e.workflow_order ASC, e.name ASC
    `, [projectId]);
    return rows;
  }

  static async deployToEnvironment(environmentId, releaseId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Crear workflow run
      const { rows: runs } = await client.query(`
        INSERT INTO deployment_workflow_run (name, release_id, project_id, created_by_id)
        SELECT CONCAT('Deploy to ', e.name), $2, e.project_id, $3
        FROM environment e WHERE e.id = $1
        RETURNING id, project_id
      `, [environmentId, releaseId, userId]);

      const workflowRunId = runs[0].id;
      const projectId = runs[0].project_id;

      // Crear job
      await client.query(`
        INSERT INTO deployment_workflow_job 
        (deployment_workflow_run_id, environment_id, project_id, status)
        VALUES ($1, $2, $3, 'completed')
      `, [workflowRunId, environmentId, projectId]);

      // Actualizar environment
      await client.query(`
        UPDATE environment 
        SET release_id = $1 
        WHERE id = $2
      `, [releaseId, environmentId]);

      // Completar workflow
      await client.query(`
        UPDATE deployment_workflow_run 
        SET status = 'completed', completed_at = now()
        WHERE id = $1
      `, [workflowRunId]);

      await client.query('COMMIT');
      return workflowRunId;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

// ---------- Release Management ----------
class ReleaseService {
  static async createRelease(projectId, name, description, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Obtener próximo número de versión
      const { rows: versions } = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM "release" WHERE project_id = $1 AND deleted_at IS NULL',
        [projectId]
      );

      const version = versions[0].next_version;

      // Crear release
      const { rows: releases } = await client.query(`
        INSERT INTO "release" (name, description, version, project_id, created_by_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [name, description, version, projectId, userId]);

      const releaseId = releases[0].id;

      // Agregar todos los documentos publicados al release
      await client.query(`
        INSERT INTO release_file (release_id, name, path, content_type, content, version_id)
        SELECT $1, d.name, d.path, d.content_type, dv.content, dv.id
        FROM "document" d
        JOIN document_version dv ON d.published_id = dv.id
        WHERE d.project_id = $2 AND d.deleted_at IS NULL AND d.published_id IS NOT NULL
      `, [releaseId, projectId]);

      await client.query('COMMIT');
      return { id: releaseId, version };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async getReleases(projectId) {
    const { rows } = await pool.query(`
      SELECT r.*, u.first_name, u.last_name,
             (SELECT COUNT(*) FROM release_file rf WHERE rf.release_id = r.id) as file_count
      FROM "release" r
      LEFT JOIN "user" u ON r.created_by_id = u.id
      WHERE r.project_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.version DESC
    `, [projectId]);
    return rows;
  }

  static async getReleaseFiles(releaseId) {
    const { rows } = await pool.query(`
      SELECT rf.* FROM release_file rf
      WHERE rf.release_id = $1
      ORDER BY rf.path ASC
    `, [releaseId]);
    return rows;
  }
}

// ---------- API Endpoints ----------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ========== PROJECTS ==========
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.key, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM "document" d WHERE d.project_id = p.id AND d.deleted_at IS NULL) as document_count
      FROM project p
      WHERE p.organisation_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
    `, [req.user.organisationId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== DOCUMENTS ==========
app.get('/api/documents', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documents = await DocumentService.listDocuments(projectId);
    res.json(documents);

    await auditLog('document', 'list', projectId, {}, req.user.id, projectId,
      req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/documents/:key', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    const versionId = req.query.version;
    const versionNumber = req.query.versionNumber;

    let document;

    if (versionId) {
      // Buscar por ID de versión específica
      document = await DocumentService.getDocumentVersion(projectId, documentKey, versionId);
    } else if (versionNumber) {
      // Buscar por número de versión (1, 2, 3, etc.)
      document = await DocumentService.getDocumentByVersionNumber(projectId, documentKey, parseInt(versionNumber));
    } else {
      // Buscar versión publicada o última
      document = await DocumentService.getDocument(projectId, documentKey);
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        documentKey,
        projectId,
        available: await DocumentService.listDocuments(projectId).then(docs => docs.map(d => d.key))
      });
    }

    // Retornar solo el contenido del documento
    res.json(document.content || {});

    await auditLog('document', 'view', documentKey, {
      versionId: document.version_id,
      source: document.source
    }, req.user.id, projectId, req.ip, req.get('User-Agent'));
  } catch (e) {
    console.error('Error fetching document:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/documents/:key/versions', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    const { content, comment } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Obtener o crear documento
    let doc = await DocumentService.getDocument(projectId, documentKey);
    if (!doc) {
      // Crear documento
      const { rows } = await pool.query(`
        INSERT INTO "document" (key, path, name, content_type, project_id)
        VALUES ($1, $2, $3, 'application/vnd.gorules.decision', $4)
        RETURNING id
      `, [documentKey, '/' + documentKey, documentKey, projectId]);
      doc = { id: rows[0].id };
    }

    const versionId = await DocumentService.createDocumentVersion(
      doc.id, content, req.user.id, comment
    );

    res.json({ ok: true, documentId: doc.id, versionId });

    await auditLog('document', 'version_create', documentKey, { versionId, comment },
      req.user.id, projectId, req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/documents/:key/publish', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    const { versionId } = req.body;

    const doc = await DocumentService.getDocument(projectId, documentKey);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await DocumentService.publishVersion(doc.id, versionId, req.user.id);

    res.json({ ok: true, documentId: doc.id, versionId });

    await auditLog('document', 'publish', documentKey, { versionId },
      req.user.id, projectId, req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/documents/:key/versions', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;

    const doc = await DocumentService.getDocument(projectId, documentKey);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const versions = await DocumentService.getVersions(doc.id);
    res.json(versions);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== RELEASES ==========
app.get('/api/releases', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const releases = await ReleaseService.getReleases(projectId);
    res.json(releases);

    await auditLog('release', 'list', projectId, {}, req.user.id, projectId,
      req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/releases', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const { name, description } = req.body;

    const release = await ReleaseService.createRelease(projectId, name, description, req.user.id);

    res.json({ ok: true, ...release });

    await auditLog('release', 'create', release.id, { name, description, version: release.version },
      req.user.id, projectId, req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/releases/:releaseId/files', authenticate, async (req, res) => {
  try {
    const releaseId = req.params.releaseId;
    const files = await ReleaseService.getReleaseFiles(releaseId);
    res.json(files);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== ENVIRONMENTS ==========
app.get('/api/environments', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const environments = await EnvironmentService.getEnvironments(projectId);
    res.json(environments);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/environments/:envId/deploy', authenticate, async (req, res) => {
  try {
    const environmentId = req.params.envId;
    const { releaseId } = req.body;

    if (!releaseId) {
      return res.status(400).json({ error: 'releaseId is required' });
    }

    const workflowRunId = await EnvironmentService.deployToEnvironment(
      environmentId, releaseId, req.user.id
    );

    res.json({ ok: true, workflowRunId });

    await auditLog('environment', 'deploy', environmentId, { releaseId },
      req.user.id, getProject(req), req.ip, req.get('User-Agent'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== SIMULATION (Compatible con tu API actual) ==========
app.post('/api/simulate/:key?', authenticate, async (req, res) => {
  const started = process.hrtime.bigint();
  try {
    const documentKey = req.params.key || 'default';
    const projectId = getProject(req);
    const env = getEnv(req);
    const payload = req.body?.payload ?? {};

    let model = req.body?.graph; // graph inline
    let source = 'inline';
    let usedVersion = null;

    if (!model) {
      // Determinar qué versión usar
      const versionQuery = req.query.version ? parseInt(String(req.query.version), 10) : null;

      if (versionQuery) {
        // Versión específica
        model = await DocumentService.getVersionContent(versionQuery);
        usedVersion = versionQuery;
        source = 'version';
      } else if (req.query.env || env !== 'dev') {
        // Buscar en ambiente específico (versión deployada)
        const { rows } = await pool.query(`
          SELECT rf.content, r.version
          FROM environment e
          JOIN "release" r ON e.release_id = r.id
          JOIN release_file rf ON rf.release_id = r.id
          JOIN "document" d ON d.path = rf.path
          WHERE e.key = $1 AND d.key = $2 AND e.project_id = $3 AND e.deleted_at IS NULL
          LIMIT 1
        `, [env, documentKey, projectId]);

        if (rows.length > 0) {
          model = rows[0].content;
          usedVersion = rows[0].version;
          source = 'deployed';
        }
      }

      // Fallback a versión publicada
      if (!model) {
        const doc = await DocumentService.getDocument(projectId, documentKey);
        if (doc && doc.content) {
          model = doc.content;
          source = 'published';
        }
      }

      // Último fallback: última versión
      if (!model) {
        const { rows } = await pool.query(`
          SELECT dv.content
          FROM "document" d
          JOIN document_version dv ON dv.document_id = d.id
          WHERE d.key = $1 AND d.project_id = $2 AND d.deleted_at IS NULL
          ORDER BY dv.created_at DESC
          LIMIT 1
        `, [documentKey, projectId]);

        if (rows.length > 0) {
          model = rows[0].content;
          source = 'latest';
        }
      }
    }

    // Normalizar modelo
    if (typeof model === 'string') {
      try { model = JSON.parse(model); } catch { }
    }
    if (model && model.graph) model = model.graph;

    if (!model || !model.nodes || !model.edges) {
      return res.status(400).json({
        error: 'Document not found or invalid graph structure',
        documentKey,
        projectId,
        env
      });
    }

    // Ejecutar simulación
    const engine = new ZenEngine();
    const decision = engine.createDecision(Buffer.from(JSON.stringify(model)));
    const result = await decision.evaluate(payload);

    const micros = Number(process.hrtime.bigint() - started) / 1000;

    const response = {
      ok: true,
      documentKey,
      projectId,
      env,
      usedVersion,
      source,
      performance: `${micros.toFixed(1)}µs`,
      result,
      timestamp: new Date().toISOString()
    };

    res.json(response);

    // Audit log para simulación
    await auditLog('simulation', 'execute', documentKey,
      { source, usedVersion, env, performance: response.performance },
      req.user.id, projectId, req.ip, req.get('User-Agent'));

  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== WORKFLOW RUNS ==========
app.get('/api/workflows', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const { rows } = await pool.query(`
      SELECT wr.*, r.name as release_name, r.version as release_version,
             u.first_name, u.last_name,
             (SELECT COUNT(*) FROM deployment_workflow_job wj WHERE wj.deployment_workflow_run_id = wr.id) as job_count
      FROM deployment_workflow_run wr
      LEFT JOIN "release" r ON wr.release_id = r.id
      LEFT JOIN "user" u ON wr.created_by_id = u.id
      WHERE wr.project_id = $1
      ORDER BY wr.created_at DESC
      LIMIT 50
    `, [projectId]);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/workflows/:runId/jobs', authenticate, async (req, res) => {
  try {
    const runId = req.params.runId;
    const { rows } = await pool.query(`
      SELECT wj.*, e.name as environment_name, e.key as environment_key,
             u.first_name, u.last_name
      FROM deployment_workflow_job wj
      LEFT JOIN environment e ON wj.environment_id = e.id
      LEFT JOIN "user" u ON wj.reviewed_by_id = u.id
      WHERE wj.deployment_workflow_run_id = $1
      ORDER BY wj.order_num ASC
    `, [runId]);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== AUDIT LOG ==========
app.get('/api/audit', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const type = req.query.type;
    const action = req.query.action;

    let query = `
      SELECT al.*, u.first_name, u.last_name, u.email
      FROM audit_log al
      LEFT JOIN "user" u ON al.user_id = u.id
      WHERE al.project_id = $1
    `;
    const params = [projectId];

    if (type) {
      params.push(type);
      query += ` AND al.type = ${params.length}`;
    }

    if (action) {
      params.push(action);
      query += ` AND al.action = ${params.length}`;
    }

    params.push(limit, offset);
    query += ` ORDER BY al.created_at DESC LIMIT ${params.length - 1} OFFSET ${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/documents/:key', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    
    // Soft delete - marcar como eliminado
    const { rows } = await pool.query(`
      UPDATE "document" 
      SET deleted_at = now() 
      WHERE project_id = $1 AND key = $2 AND deleted_at IS NULL
      RETURNING id, name
    `, [projectId, documentKey]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ 
      ok: true, 
      message: `Document ${documentKey} deleted successfully`,
      documentId: rows[0].id 
    });
    
    await auditLog('document', 'delete', documentKey, { 
      documentId: rows[0].id,
      name: rows[0].name 
    }, req.user.id, projectId, req.ip, req.get('User-Agent'));
  } catch (e) {
    console.error('Error deleting document:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== LEGACY COMPATIBILITY ==========
// Mantener compatibilidad con tu API actual
app.get('/api/graphs', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documents = await DocumentService.listDocuments(projectId);

    // Formatear como tu API original
    const graphs = documents.map(d => ({
      id: d.key,
      name: d.name,
      updated_at: d.updated_at,
      latest_version: d.version_count
    }));

    res.json(graphs);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/graphs/:key', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    const versionParam = req.query.version;

    let document;

    if (versionParam) {
      // Si version es un número, tratarlo como número de versión
      const versionNumber = parseInt(versionParam);
      if (!isNaN(versionNumber)) {
        document = await DocumentService.getDocumentByVersionNumber(projectId, documentKey, versionNumber);
      } else {
        // Si no es número, tratarlo como UUID de versión
        document = await DocumentService.getDocumentVersion(projectId, documentKey, versionParam);
      }
    } else {
      document = await DocumentService.getDocument(projectId, documentKey);
    }

    if (!document) {
      return res.status(404).json({
        error: 'Graph not found',
        graphId: documentKey,
        projectId
      });
    }

    res.json(document.content || {});
  } catch (e) {
    console.error('Error fetching graph:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/graphs/:key', authenticate, async (req, res) => {
  try {
    const projectId = getProject(req);
    const documentKey = req.params.key;
    const content = req.body.graph || req.body;
    const comment = req.body.comment;

    // Reutilizar la lógica de documents
    req.params.key = documentKey;
    req.body = { content, comment };

    // Llamar al endpoint de documents
    return app._router.handle({
      ...req,
      method: 'POST',
      url: `/api/documents/${documentKey}/versions`
    }, res);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname, 'public')));

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    ok: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ========== STARTUP ==========
const initializeDatabase = async () => {
  try {
    // Verificar si las tablas existen
    const { rows } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'organisation'
    `);

    if (rows.length === 0) {
      console.log('🔧 Database tables not found. Please run the DDL script first.');
      console.log('📖 Check the artifacts for the complete schema.');
    } else {
      console.log('✅ Database connection established');
    }
  } catch (e) {
    console.error('❌ Database connection failed:', e.message);
    process.exit(1);
  }
};

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 BRMS-lite server running on port ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/health`);
    console.log(`🎨 UI: http://localhost:${PORT}/`);
  });
}).catch(console.error);