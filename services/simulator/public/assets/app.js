const $ = (id) => document.getElementById(id);
const out = (x) => {
  const output = $('out');
  output.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
  output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
const metaOut = (x) => {
  const el = $('metaOut');
  if (!el) return;
  el.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
};
const gid = () => $('graphId').value.trim() || 'default';
const env = () => $('env').value.trim() || 'dev';
const vers = () => $('version').value.trim();

const setLoading = (el, loading = true) => {
  if (!el) return;
  if (loading) el.classList.add('loading');
  else el.classList.remove('loading');
};

function normalizeGraph(any) {
  if (!any) return null;
  if (any.nodes && any.edges) return any;
  if (any.graph && any.graph.nodes && any.graph.edges) return any.graph;
  if (any.content && any.content.nodes && any.content.edges) return any.content;
  if (any.contentType && (any.nodes || any.edges)) return any;
  return null;
}

function lockSimSourceByVersion() {
  const v = vers();
  const sel = $('simSource');
  if (v) { sel.value = 'version'; sel.disabled = true; }
  else { sel.disabled = false; }
}
lockSimSourceByVersion();
$('version').addEventListener('input', lockSimSourceByVersion);

$('btnList').onclick = async () => {
  const btn = $('btnList'); setLoading(btn);
  try {
    const r = await fetch('/api/graphs');
    out(await r.json());
  } catch (e) { out(`Error: ${e.message}`); }
  finally { setLoading(btn, false); }
};

$('btnGet').onclick = async () => {
  const btn = $('btnGet'); setLoading(btn);
  try {
    const id = gid();
    const v = vers();
    const sourceSel = $('simSource').value; // usamos la fuente elegida
    let source = sourceSel;
    let url, originNote = '';

    // Si hay versión escrita, priorizamos esa y bloqueamos la fuente
    if (v) {
      source = 'version';
    }

    if (source === 'version') {
      if (!v) { out('⚠️ Indicá la versión para cargar'); return; }
      url = `/api/graphs/${id}?version=${encodeURIComponent(v)}`;
      originNote = `version=${v}`;
    } else if (source === 'published') {
      const e = env();
      const pub = await fetch(`/api/graphs/${id}/published?env=${encodeURIComponent(e)}`).then(r => r.json());
      if (pub.version) {
        url = `/api/graphs/${id}?version=${pub.version}`;
        originNote = `published env=${e} -> version=${pub.version}`;
      } else {
        // si no hay publicada en ese env, caemos a última
        url = `/api/graphs/${id}`;
        originNote = `no published in env=${e}, fallback latest`;
      }
    } else if (source === 'latest') {
      url = `/api/graphs/${id}`;
      originNote = 'latest';
    } else if (source === 'inline') {
      // Inline: no hacemos fetch. Solo formateamos lo que haya en el editor.
      const txt = $('graph').value.trim();
      if (!txt) { out('⚠️ Fuente inline: pega un grafo en el editor'); return; }
      try {
        const raw = JSON.parse(txt);
        const graph = normalizeGraph(raw) || raw;
        $('graph').value = JSON.stringify(graph, null, 2);
        out({ status: '✅ Grafo listo desde editor (inline)', timestamp: new Date().toLocaleString() });
      } catch {
        out('❌ Inline: JSON inválido en el editor');
      }
      return; // no buscamos al backend
    } else {
      // fallback a última
      url = `/api/graphs/${id}`;
      originNote = 'latest (fallback)';
    }

    const j = await fetch(url).then(r => r.json());
    $('graph').value = JSON.stringify(j, null, 2);
    out({
      status: '✅ Grafo cargado',
      loaded_from: url,
      origin: originNote,
      contentType: j?.contentType || 'graph',
      timestamp: new Date().toLocaleString()
    });
  } catch (e) {
    out(`❌ Error cargando grafo: ${e.message}`);
  } finally {
    setLoading(btn, false);
  }
};


$('btnPublish').onclick = async () => {
  const btn = $('btnPublish'); setLoading(btn);
  try {
    const body = vers() ? { version: Number(vers()) } : {};
    const r = await fetch(`/api/graphs/${gid()}/publish?env=${encodeURIComponent(env())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await r.json();
    out({ status: r.ok ? '🚀 Publicado' : '❌ Error', ...result, timestamp: new Date().toLocaleString() });
  } catch (e) { out(`❌ Error publicando: ${e.message}`); }
  finally { setLoading(btn, false); }
};

$('btnSave').onclick = async () => {
  const btn = $('btnSave'); setLoading(btn);
  try {
    const txt = $('graph').value.trim();
    if (!txt) return out('⚠️ Pega el JSON del grafo a la izquierda');
    let raw; try { raw = JSON.parse(txt); } catch { return out('❌ Graph JSON inválido'); }
    const graph = normalizeGraph(raw);
    if (!graph) return out('❌ Grafo inválido (faltan nodes/edges)');
    const r = await fetch(`/api/graphs/${gid()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graph)
    });
    out(await r.json());
  } catch (e) { out(`❌ Error guardando: ${e.message}`); }
  finally { setLoading(btn, false); }
};

$('btnSim').onclick = async () => {
  const btn = $('btnSim'); setLoading(btn);
  try {
    let source = $('simSource').value;
    const v = vers();
    let url = `/api/simulate/${gid()}`;
    const payloadTxt = $('payload').value.trim();
    let payload = {};
    if (payloadTxt) { try { payload = JSON.parse(payloadTxt); } catch { return out('❌ Payload JSON inválido'); } }

    if (v) source = 'version'; // prioridad a versión escrita

    const body = { payload };
    if (source === 'version') {
      if (!v) return out('⚠️ Indicá la versión para simular');
      url += `?version=${encodeURIComponent(v)}`;
    } else if (source === 'published') {
      url += `?env=${encodeURIComponent(env())}`;
    } else if (source === 'inline') {
      const gtxt = $('graph').value.trim();
      if (!gtxt) return out('⚠️ Pegá un grafo para simular inline');
      let raw; try { raw = JSON.parse(gtxt); } catch { return out('❌ Graph JSON inválido'); }
      const graph = normalizeGraph(raw);
      if (!graph) return out('❌ Grafo inválido (faltan nodes/edges)');
      body.graph = graph;
    } // latest => sin query

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    out({ status: r.ok ? '▶️ Simulación OK' : '❌ Error', source, ...(await r.json()), timestamp: new Date().toLocaleString() });
  } catch (e) { out(`❌ Error simulación: ${e.message}`); }
  finally { setLoading(btn, false); }
};

$('btnVersions').onclick = async () => {
  const btn = $('btnVersions'); setLoading(btn);
  try {
    const r = await fetch(`/api/graphs/${gid()}/versions`);
    metaOut({ versions: await r.json() });
    out('✅ Listado de versiones (ver Metadatos)');
  } catch (e) { out(`❌ Error listando versiones: ${e.message}`); }
  finally { setLoading(btn, false); }
};

$('btnPublished').onclick = async () => {
  const btn = $('btnPublished'); setLoading(btn);
  try {
    const envs = Array.from(new Set([env(), 'dev', 'staging', 'prod'])).filter(Boolean);
    const results = {};
    for (const e of envs) {
      results[e] = await fetch(`/api/graphs/${gid()}/published?env=${encodeURIComponent(e)}`).then(r => r.json());
    }
    metaOut({ published: results });
    out('✅ Publicadas por ambiente (ver Metadatos)');
  } catch (e) { out(`❌ Error consultando publicadas: ${e.message}`); }
  finally { setLoading(btn, false); }
};

// auto-formatter al salir del textarea
['graph', 'payload'].forEach(id => {
  $(id).addEventListener('blur', function () {
    try { this.value = JSON.stringify(JSON.parse(this.value), null, 2); } catch { }
  });
});

$('fileGraph').onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const graph = normalizeGraph(raw);
    if (!graph) return out('⚠️ JSON leído, pero no reconozco nodes/edges');
    $('graph').value = JSON.stringify(graph, null, 2);
    out({ status: '📁 Archivo cargado', filename: file.name, normalized: true, timestamp: new Date().toLocaleString() });
  } catch { out('❌ No pude leer/parsear el archivo .json'); }
  e.target.value = '';
};

$('btnExport').onclick = () => {
  const txt = $('graph').value.trim() || '{}';
  const blob = new Blob([txt], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${gid()}-graph.json`; a.click();
  URL.revokeObjectURL(url);
  out({ status: '📤 Exportado', filename: `${gid()}-graph.json`, timestamp: new Date().toLocaleString() });
};
