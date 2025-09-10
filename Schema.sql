-- Schema extendido para simular funcionalidad BRMS completa
-- Basado en tu estructura actual + conceptos del DDL de BRMS

-- ========== ORGANIZACIÓN Y USUARIOS ==========

CREATE TABLE IF NOT EXISTS organisation (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    display_name VARCHAR,
    license VARCHAR,
    preferences JSONB,
    theme_logo VARCHAR,
    theme_primary_color VARCHAR,
    onboarded BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS "user" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email VARCHAR NOT NULL,
    first_name VARCHAR,
    last_name VARCHAR,
    type VARCHAR(64) DEFAULT 'member' NOT NULL,
    status VARCHAR(64) DEFAULT 'active' NOT NULL,
    organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
    owner BOOLEAN DEFAULT false NOT NULL,
    is_service BOOLEAN DEFAULT false NOT NULL,
    last_project_id UUID NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_email_organisation 
ON "user" (email, organisation_id) WHERE deleted_at IS NULL;

-- ========== PROYECTOS Y DOCUMENTOS ==========

CREATE TABLE IF NOT EXISTS project (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    key VARCHAR, -- identificador único dentro de la org
    protected BOOLEAN DEFAULT false NOT NULL,
    organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
    decisions_approval_mode VARCHAR(64),
    releases_approval_mode VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_project_key 
ON project (key, organisation_id) WHERE key IS NOT NULL AND deleted_at IS NULL;

-- Tabla principal para documentos/grafos (equivalente a tus graphs)
CREATE TABLE IF NOT EXISTS "document" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key VARCHAR NOT NULL, -- equivalente a tu graph_id
    path VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    type CHAR(1) DEFAULT 'f' NOT NULL, -- 'f' = file, 'd' = directory
    content_type VARCHAR, -- 'application/vnd.gorules.decision'
    size INT,
    meta JSONB,
    view JSONB, -- configuración de vista del editor
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    parent_id UUID NULL REFERENCES "document"(id) ON DELETE CASCADE,
    published_id UUID NULL, -- referencia a la versión publicada
    published_at TIMESTAMPTZ NULL,
    published_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_key_project 
ON "document" (key, project_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_path_project 
ON "document" (path, project_id) WHERE deleted_at IS NULL;

-- Versiones de documentos (equivalente a tus graph_versions)
CREATE TABLE IF NOT EXISTS document_version (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES "document"(id) ON DELETE CASCADE,
    content JSONB NULL, -- el grafo real con nodes/edges
    name VARCHAR,
    comment TEXT,
    status VARCHAR DEFAULT 'completed' NOT NULL,
    parent_id UUID NULL REFERENCES document_version(id) ON DELETE CASCADE,
    created_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========== RELEASES Y DEPLOYMENTS ==========

CREATE TABLE IF NOT EXISTS "release" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR,
    description VARCHAR,
    version INT NOT NULL,
    status VARCHAR DEFAULT 'completed' NOT NULL,
    meta JSONB,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    created_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_version 
ON "release" (project_id, version) WHERE deleted_at IS NULL;

-- Archivos en un release
CREATE TABLE IF NOT EXISTS release_file (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES "release"(id) ON DELETE CASCADE,
    name VARCHAR,
    path VARCHAR NOT NULL,
    content_type VARCHAR,
    content JSONB, -- el contenido del archivo (grafo)
    version_id VARCHAR, -- referencia a document_version
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Deployments (configuración de destinos)
CREATE TABLE IF NOT EXISTS deployment (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    description VARCHAR,
    provider VARCHAR(64) NOT NULL, -- 'api', 'webhook', 'database', etc.
    configuration JSONB NOT NULL, -- URLs, endpoints, etc.
    secrets JSONB, -- credenciales encriptadas
    organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

-- Ambientes/entornos
CREATE TABLE IF NOT EXISTS environment (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL, -- 'dev', 'staging', 'prod'
    key VARCHAR,
    type VARCHAR(64) DEFAULT 'deployment' NOT NULL,
    access_token VARCHAR, -- para acceso API
    approval_mode VARCHAR(64) DEFAULT 'none',
    add_to_workflow BOOLEAN DEFAULT false NOT NULL,
    workflow_order INT DEFAULT 0,
    required_reviewers BOOLEAN DEFAULT false NOT NULL,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    deployment_id UUID NULL REFERENCES deployment(id) ON DELETE SET NULL,
    release_id UUID NULL REFERENCES "release"(id) ON DELETE SET NULL, -- release actualmente deployado
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_environment_key 
ON environment (project_id, key) WHERE deleted_at IS NULL AND key IS NOT NULL;

-- ========== ROLES Y PERMISOS ==========

CREATE TABLE IF NOT EXISTS "role" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    description VARCHAR,
    all_projects BOOLEAN DEFAULT false NOT NULL,
    project_permissions JSONB, -- permisos específicos por proyecto
    organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles_role (
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES "role"(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ========== MIEMBROS Y GRUPOS ==========

CREATE TABLE IF NOT EXISTS "member" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    owner BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS "group" (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    description VARCHAR,
    permissions JSON,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    role_id UUID NULL REFERENCES "role"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_groups_group (
    member_id UUID NOT NULL REFERENCES "member"(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES "group"(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, group_id)
);

-- ========== WORKFLOW Y APROBACIONES ==========

CREATE TABLE IF NOT EXISTS deployment_workflow_run (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR,
    status VARCHAR(64) DEFAULT 'in_progress' NOT NULL,
    run_version VARCHAR(64),
    release_id UUID NOT NULL REFERENCES "release"(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES "user"(id) ON DELETE SET NULL,
    cancelled_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    cancelled_comment VARCHAR,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS deployment_workflow_job (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    deployment_workflow_run_id UUID NOT NULL REFERENCES deployment_workflow_run(id) ON DELETE CASCADE,
    environment_id UUID NULL REFERENCES environment(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    order_num INT DEFAULT 1 NOT NULL,
    status VARCHAR(64) DEFAULT 'in_progress' NOT NULL,
    data JSONB,
    event VARCHAR,
    reviewed_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ NULL,
    reviewed_comment VARCHAR,
    reviewed_conclusion VARCHAR(64),
    previous_release_id UUID NULL REFERENCES "release"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ NULL
);

-- ========== CHANGE REQUESTS ==========

CREATE TABLE IF NOT EXISTS change_requests (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    type VARCHAR NOT NULL, -- 'publish_document', 'deploy_environment', etc.
    status VARCHAR DEFAULT 'pending' NOT NULL,
    description VARCHAR,
    snapshot JSONB, -- snapshot del estado al crear el request
    project_id UUID NULL REFERENCES project(id) ON DELETE CASCADE,
    document_id UUID NULL REFERENCES "document"(id) ON DELETE CASCADE,
    document_version_id UUID NULL REFERENCES document_version(id) ON DELETE CASCADE,
    previous_document_version_id UUID NULL REFERENCES document_version(id) ON DELETE CASCADE,
    environment_id UUID NULL REFERENCES environment(id) ON DELETE CASCADE,
    release_id UUID NULL REFERENCES "release"(id),
    previous_release_id UUID NULL REFERENCES "release"(id),
    created_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========== AUDITORÍA ==========

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- 'graph', 'release', 'deployment', etc.
    action VARCHAR(32) NOT NULL, -- 'create', 'update', 'delete', 'deploy', etc.
    ref_id VARCHAR(64), -- ID del objeto afectado
    data JSONB, -- detalles del cambio
    ip_address VARCHAR,
    user_agent VARCHAR,
    organisation_id UUID NULL REFERENCES organisation(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    project_id UUID NULL REFERENCES project(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_type_idx ON audit_log (type);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_ref_id_idx ON audit_log (ref_id);

-- ========== TOKENS DE ACCESO ==========

CREATE TABLE IF NOT EXISTS personal_access_token (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    note VARCHAR NOT NULL,
    token_hash VARCHAR NOT NULL UNIQUE,
    all_projects BOOLEAN NOT NULL,
    permissions JSONB NOT NULL,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS project_access_token (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    token VARCHAR NOT NULL,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    created_by_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========== MIGRAR TUS DATOS EXISTENTES ==========

-- Insertar organización por defecto
INSERT INTO organisation (id, name, display_name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'default-org', 'Organización por Defecto')
ON CONFLICT (name) DO NOTHING;

-- Insertar usuario por defecto
INSERT INTO "user" (id, email, first_name, last_name, organisation_id, owner) 
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@example.com', 'Admin', 'User', 
        '00000000-0000-0000-0000-000000000001', true)
ON CONFLICT DO NOTHING;

-- Insertar proyecto por defecto
INSERT INTO project (id, name, key, organisation_id) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Project', 'default', 
        '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;



-- Migrar tus graphs existentes como documents
CREATE EXTENSION IF NOT EXISTS dblink;


INSERT INTO "document" (id, key, path, name, content_type, project_id)
SELECT 
    gen_random_uuid(),
    id,
    '/' || id,
    COALESCE(name, id::text),
    'application/vnd.gorules.decision',
    '00000000-0000-0000-0000-000000000001'
FROM dblink(
  'host=host.docker.internal dbname=jdm user=postgres password=postgres',
  'SELECT id, name FROM public.graphs'
) AS t(id text, name text)
ON CONFLICT DO NOTHING;

-- Migrar tus graph_versions como document_versions
WITH gv AS (
  SELECT *
  FROM dblink(
    'host=host.docker.internal dbname=jdm user=postgres password=postgres',
    $$SELECT 
        graph_id::text,          -- lo traemos como texto para matchear con d.key (text)
        content::jsonb,          -- casteá acá si en remoto es json/text
        created_at               -- timestamptz o timestamp, ver abajo
      FROM public.graph_versions$$
  ) AS t(
    graph_id   text,
    content    jsonb,            -- si tu document_version.content es jsonb
    created_at timestamptz       -- si tu document_version.created_at es timestamptz
  )
)
INSERT INTO document_version (document_id, content, created_at)
SELECT 
  d.id,
  gv.content,
  gv.created_at
FROM gv
JOIN "document" d
  ON d.key = gv.graph_id
ON CONFLICT DO NOTHING;      

-- Crear ambientes por defecto
INSERT INTO environment (name, key, project_id)
VALUES 
    ('Development', 'dev', '00000000-0000-0000-0000-000000000001'),
    ('Staging', 'staging', '00000000-0000-0000-0000-000000000001'),
    ('Production', 'prod', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;