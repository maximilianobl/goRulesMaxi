// Global state
let state = {
  documents: [],
  releases: [],
  environments: [],
  selectedDocument: null,
  selectedRelease: null
};

// API Base URL
const API_BASE = '/api';

// Crear constante para evitar conflictos con variables del API
const DOM = window.document;

// Utility functions
function showNotification(message, type = 'info') {
  const notification = DOM.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  DOM.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => DOM.body.removeChild(notification), 300);
  }, 3000);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    showNotification(`API Error: ${error.message}`, 'error');
    throw error;
  }
}

// Tab management
function switchTab(tabName) {
  // Hide all tabs
  DOM.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  DOM.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });

  // Show selected tab
  DOM.getElementById(`tab-${tabName}`).classList.add('active');
  event.target.classList.add('active');

  // Load tab data
  loadTabData(tabName);
}

function loadTabData(tabName) {
  switch (tabName) {
    case 'documents':
      loadDocuments();
      break;
    case 'releases':
      loadReleases();
      break;
    case 'environments':
      loadEnvironments();
      break;
    case 'audit':
      loadAuditLog();
      break;
  }
}

// Modal management
function showModal(modalId) {
  DOM.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
  DOM.getElementById(modalId).classList.remove('active');
}

// Document management
async function loadDocuments() {
  try {
    const documents = await apiCall('/documents');
    state.documents = documents;
    renderDocumentsTable(documents);
  } catch (error) {
    console.error('Failed to load documents:', error);
  }
}

function renderDocumentsTable(documents) {
  const container = DOM.getElementById('documentsTable');

  if (documents.length === 0) {
    container.innerHTML = '<p>No documents found</p>';
    return;
  }

  const table = `
    <table class="table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Name</th>
          <th>Versions</th>
          <th>Published</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${documents.map(doc => `
          <tr>
            <td><code>${doc.key}</code></td>
            <td>${doc.name}</td>
            <td><span class="badge badge-info">${doc.version_count || 0}</span></td>
            <td>${doc.published_at ? `<span class="badge badge-success">✓</span>` : `<span class="badge badge-warning">✗</span>`}</td>
            <td>${formatDate(doc.updated_at)}</td>
            <td>
              <button class="btn btn-info" onclick="loadDocument('${doc.key}')">📥 Load</button>
              <button class="btn btn-secondary" onclick="viewDocumentVersions('${doc.key}')">📋 Versions</button>
              <button class="btn btn-danger" onclick="deleteDocument('${doc.key}')" title="Delete document">🗑️ Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = table;
}

async function loadDocument(key) {
  try {
    // Cambiar nombre de variable para evitar conflicto con DOM document
    const documentData = await apiCall(`/documents/${key}`);
    DOM.getElementById('documentKey').value = key;
    DOM.getElementById('documentContent').value = formatJSON(documentData);
    state.selectedDocument = key;
    showNotification(`Document ${key} loaded`, 'success');

    // Load document info
    await loadDocumentInfo(key);
  } catch (error) {
    console.error('Failed to load document:', error);
    showNotification(`Failed to load document: ${error.message}`, 'error');
  }
}

async function loadDocumentInfo(key) {
  try {
    const versions = await apiCall(`/documents/${key}/versions`);
    renderDocumentInfo(key, versions);
  } catch (error) {
    console.error('Failed to load document info:', error);
    showNotification(`Failed to load document info: ${error.message}`, 'error');
  }
}

function renderDocumentInfo(key, versions) {
  const container = DOM.getElementById('documentInfo');
  const info = `
        <h4>Document: ${key}</h4>
        <p><strong>Total Versions:</strong> ${versions.length}</p>
        <p><strong>Latest:</strong> ${versions[0] ? formatDate(versions[0].created_at) : 'None'}</p>
      `;
  container.innerHTML = info;

  renderVersionsTable(versions);
}

function renderVersionsTable(versions) {
  const container = DOM.getElementById('versionsTable');

  if (versions.length === 0) {
    container.innerHTML = '<p>No versions found</p>';
    return;
  }

  const table = `
        <h4>Versions</h4>
        <table class="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Comment</th>
              <th>Author</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${versions.map((version, index) => `
              <tr>
                <td><span class="badge badge-info">#${versions.length - index}</span></td>
                <td>${version.comment || 'No comment'}</td>
                <td>${version.first_name || 'Unknown'} ${version.last_name || ''}</td>
                <td>${formatDate(version.created_at)}</td>
                <td>
                  <button class="btn btn-success" onclick="publishVersion('${version.id}')">🚀 Publish</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

async function saveDocumentVersion() {
  const key = DOM.getElementById('documentKey').value;
  const content = DOM.getElementById('documentContent').value;
  const comment = DOM.getElementById('versionComment').value;

  if (!key || !content) {
    showNotification('Document key and content are required', 'error');
    return;
  }

  try {
    const parsedContent = JSON.parse(content);
    const result = await apiCall(`/documents/${key}/versions`, {
      method: 'POST',
      body: JSON.stringify({ content: parsedContent, comment })
    });

    showNotification('Document version saved successfully', 'success');
    DOM.getElementById('versionComment').value = '';
    await loadDocumentInfo(key);
    await loadDocuments();
  } catch (error) {
    console.error('Failed to save document version:', error);
    showNotification(`Failed to save version: ${error.message}`, 'error');
  }
}

async function publishVersion(versionId) {
  const key = state.selectedDocument;
  if (!key) {
    showNotification('No document selected', 'error');
    return;
  }

  try {
    await apiCall(`/documents/${key}/publish`, {
      method: 'POST',
      body: JSON.stringify({ versionId })
    });

    showNotification('Document published successfully', 'success');
    await loadDocumentInfo(key);
    await loadDocuments();
  } catch (error) {
    console.error('Failed to publish document:', error);
    showNotification(`Failed to publish: ${error.message}`, 'error');
  }
}

async function viewDocumentVersions(key) {
  state.selectedDocument = key;
  await loadDocumentInfo(key);
}

// Release management
async function loadReleases() {
  try {
    const releases = await apiCall('/releases');
    state.releases = releases;
    renderReleasesTable(releases);
    populateReleaseSelect(releases);
  } catch (error) {
    console.error('Failed to load releases:', error);
    showNotification(`Failed to load releases: ${error.message}`, 'error');
  }
}

function renderReleasesTable(releases) {
  const container = DOM.getElementById('releasesTable');

  if (releases.length === 0) {
    container.innerHTML = '<p>No releases found</p>';
    return;
  }

  const table = `
        <table class="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Name</th>
              <th>Description</th>
              <th>Files</th>
              <th>Created By</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${releases.map(release => `
              <tr>
                <td><span class="badge badge-success">v${release.version}</span></td>
                <td>${release.name || 'Unnamed'}</td>
                <td>${release.description || 'No description'}</td>
                <td><span class="badge badge-info">${release.file_count || 0}</span></td>
                <td>${release.first_name || 'Unknown'} ${release.last_name || ''}</td>
                <td>${formatDate(release.created_at)}</td>
                <td>
                  <button class="btn btn-info" onclick="viewReleaseFiles('${release.id}')">📁 Files</button>
                  <button class="btn btn-warning" onclick="selectReleaseForDeploy('${release.id}', '${release.name}', ${release.version})">🚀 Deploy</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

async function createRelease() {
  const name = DOM.getElementById('releaseName').value;
  const description = DOM.getElementById('releaseDescription').value;

  if (!name) {
    showNotification('Release name is required', 'error');
    return;
  }

  try {
    const result = await apiCall('/releases', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });

    showNotification(`Release v${result.version} created successfully`, 'success');
    DOM.getElementById('releaseName').value = '';
    DOM.getElementById('releaseDescription').value = '';
    await loadReleases();
  } catch (error) {
    console.error('Failed to create release:', error);
    showNotification(`Failed to create release: ${error.message}`, 'error');
  }
}

async function viewReleaseFiles(releaseId) {
  try {
    const files = await apiCall(`/releases/${releaseId}/files`);
    renderReleaseFiles(files);
    state.selectedRelease = releaseId;
  } catch (error) {
    console.error('Failed to load release files:', error);
    showNotification(`Failed to load release files: ${error.message}`, 'error');
  }
}

function renderReleaseFiles(files) {
  const container = DOM.getElementById('releaseFiles');

  if (files.length === 0) {
    container.innerHTML = '<p>No files in this release</p>';
    return;
  }

  const table = `
        <h4>Release Files</h4>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Path</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(file => `
              <tr>
                <td>${file.name}</td>
                <td><code>${file.path}</code></td>
                <td><span class="badge badge-info">${file.content_type}</span></td>
                <td>
                  <button class="btn btn-info" onclick="viewFileContent('${file.id}')">👁️ View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

function populateReleaseSelect(releases) {
  const select = DOM.getElementById('deployRelease');
  select.innerHTML = '<option value="">Select release...</option>';

  releases.forEach(release => {
    const option = DOM.createElement('option');
    option.value = release.id;
    option.textContent = `v${release.version} - ${release.name || 'Unnamed'}`;
    select.appendChild(option);
  });
}

function selectReleaseForDeploy(releaseId, releaseName, version) {
  DOM.getElementById('deployRelease').value = releaseId;
  switchTab('environments');
  showNotification(`Selected release v${version} for deployment`, 'info');
}

// Environment management
async function loadEnvironments() {
  try {
    const environments = await apiCall('/environments');
    state.environments = environments;
    renderEnvironmentsTable(environments);
    populateEnvironmentSelect(environments);
  } catch (error) {
    console.error('Failed to load environments:', error);
    showNotification(`Failed to load environments: ${error.message}`, 'error');
  }
}

function renderEnvironmentsTable(environments) {
  const container = DOM.getElementById('environmentsTable');

  if (environments.length === 0) {
    container.innerHTML = '<p>No environments found</p>';
    return;
  }

  const table = `
        <table class="table">
          <thead>
            <tr>
              <th>Environment</th>
              <th>Key</th>
              <th>Type</th>
              <th>Current Release</th>
              <th>Order</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${environments.map(env => `
              <tr>
                <td><strong>${env.name}</strong></td>
                <td><code>${env.key || 'N/A'}</code></td>
                <td><span class="badge badge-info">${env.type}</span></td>
                <td>${env.release_name ? `<span class="badge badge-success">v${env.release_version} - ${env.release_name}</span>` : '<span class="badge badge-warning">None</span>'}</td>
                <td>${env.workflow_order}</td>
                <td>
                  <button class="btn btn-warning" onclick="selectEnvironmentForDeploy('${env.id}', '${env.name}')">🚀 Deploy</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

function populateEnvironmentSelect(environments) {
  const select = DOM.getElementById('deployEnvironment');
  select.innerHTML = '<option value="">Select environment...</option>';

  environments.forEach(env => {
    const option = DOM.createElement('option');
    option.value = env.id;
    option.textContent = env.name;
    select.appendChild(option);
  });
}

function selectEnvironmentForDeploy(envId, envName) {
  DOM.getElementById('deployEnvironment').value = envId;
  showNotification(`Selected environment: ${envName}`, 'info');
}

async function deployRelease() {
  const environmentId = DOM.getElementById('deployEnvironment').value;
  const releaseId = DOM.getElementById('deployRelease').value;

  if (!environmentId || !releaseId) {
    showNotification('Please select both environment and release', 'error');
    return;
  }

  try {
    const result = await apiCall(`/environments/${environmentId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ releaseId })
    });

    showNotification('Deployment initiated successfully', 'success');
    await loadEnvironments();
    await loadWorkflows();
  } catch (error) {
    console.error('Failed to deploy release:', error);
    showNotification(`Failed to deploy: ${error.message}`, 'error');
  }
}

async function loadWorkflows() {
  try {
    const workflows = await apiCall('/workflows');
    renderWorkflowsTable(workflows);
  } catch (error) {
    console.error('Failed to load workflows:', error);
    showNotification(`Failed to load workflows: ${error.message}`, 'error');
  }
}

function renderWorkflowsTable(workflows) {
  const container = DOM.getElementById('workflowsTable');

  if (workflows.length === 0) {
    container.innerHTML = '<p>No deployment history</p>';
    return;
  }

  const table = `
        <h4>Recent Deployments</h4>
        <table class="table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th>Release</th>
              <th>Status</th>
              <th>Jobs</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${workflows.slice(0, 10).map(workflow => `
              <tr>
                <td>${workflow.name || 'Unnamed'}</td>
                <td>${workflow.release_name ? `v${workflow.release_version} - ${workflow.release_name}` : 'N/A'}</td>
                <td><span class="badge badge-${workflow.status === 'completed' ? 'success' : workflow.status === 'in_progress' ? 'warning' : 'danger'}">${workflow.status}</span></td>
                <td><span class="badge badge-info">${workflow.job_count || 0}</span></td>
                <td>${formatDate(workflow.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

// Simulation
async function runSimulation() {
  const documentKey = DOM.getElementById('simDocumentKey').value;
  const environment = DOM.getElementById('simEnvironment').value;
  const version = DOM.getElementById('simVersion').value;
  const payloadText = DOM.getElementById('simulationPayload').value;

  if (!documentKey) {
    showNotification('Document key is required', 'error');
    return;
  }

  try {
    let payload = {};
    if (payloadText.trim()) {
      payload = JSON.parse(payloadText);
    }

    let url = `/simulate/${documentKey}`;
    const params = new URLSearchParams();

    if (version) {
      params.append('version', version);
    } else if (environment) {
      params.append('env', environment);
    }

    if (params.toString()) {
      url += '?' + params.toString();
    }

    const result = await apiCall(url, {
      method: 'POST',
      body: JSON.stringify({ payload })
    });

    DOM.getElementById('simulationOutput').textContent = formatJSON(result);
    showNotification('Simulation completed successfully', 'success');
  } catch (error) {
    DOM.getElementById('simulationOutput').textContent = `Error: ${error.message}`;
    console.error('Failed to run simulation:', error);
    showNotification(`Simulation failed: ${error.message}`, 'error');
  }
}

// Audit log
async function loadAuditLog() {
  const type = DOM.getElementById('auditType').value;
  const action = DOM.getElementById('auditAction').value;
  const limit = DOM.getElementById('auditLimit').value;

  try {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (action) params.append('action', action);
    if (limit) params.append('limit', limit);

    const url = '/audit' + (params.toString() ? '?' + params.toString() : '');
    const auditLogs = await apiCall(url);
    state.auditLogs = auditLogs; // Guardar en state para viewAuditData
    renderAuditTable(auditLogs);
  } catch (error) {
    console.error('Failed to load audit log:', error);
    showNotification(`Failed to load audit log: ${error.message}`, 'error');
  }
}

function renderAuditTable(auditLogs) {
  const container = DOM.getElementById('auditTable');

  if (auditLogs.length === 0) {
    container.innerHTML = '<p>No audit logs found</p>';
    return;
  }

  const table = `
        <table class="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Action</th>
              <th>Reference</th>
              <th>User</th>
              <th>IP Address</th>
              <th>Timestamp</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            ${auditLogs.map(log => `
              <tr>
                <td><span class="badge badge-info">${log.type}</span></td>
                <td><span class="badge badge-warning">${log.action}</span></td>
                <td><code>${log.ref_id || 'N/A'}</code></td>
                <td>${log.first_name || 'System'} ${log.last_name || ''}</td>
                <td>${log.ip_address || 'N/A'}</td>
                <td>${formatDate(log.created_at)}</td>
                <td><button class="btn btn-info" onclick="viewAuditData('${log.id}')">👁️ View</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

  container.innerHTML = table;
}

function viewAuditData(logId) {
  const log = state.auditLogs?.find(l => l.id === logId);
  if (log && log.data) {
    alert(formatJSON(log.data));
  } else {
    showNotification('No data available for this log entry', 'warning');
  }
}

// File upload
async function processUpload() {
  const fileInput = DOM.getElementById('uploadFile');
  const key = DOM.getElementById('uploadKey').value;

  if (!fileInput.files[0]) {
    showNotification('Please select a file', 'error');
    return;
  }

  if (!key) {
    showNotification('Document key is required', 'error');
    return;
  }

  try {
    const file = fileInput.files[0];
    const content = await file.text();
    const parsedContent = JSON.parse(content);

    await apiCall(`/documents/${key}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        content: parsedContent,
        comment: `Uploaded from file: ${file.name}`
      })
    });

    showNotification('File uploaded successfully', 'success');
    hideModal('modalUpload');
    fileInput.value = '';
    DOM.getElementById('uploadKey').value = '';
    await loadDocuments();
  } catch (error) {
    console.error('Failed to upload file:', error);
    showNotification(`Upload failed: ${error.message}`, 'error');
  }
}

async function checkConnectionStatus() {
  try {
    await apiCall('/health');
    DOM.getElementById('connectionStatus').textContent = '● Connected';
    DOM.getElementById('connectionStatus').className = 'status-indicator status-online';
  } catch (error) {
    DOM.getElementById('connectionStatus').textContent = '● Disconnected';
    DOM.getElementById('connectionStatus').className = 'status-indicator badge-danger';
  }
}


async function deleteDocument(key) {
  if (!confirm(`Are you sure you want to delete document "${key}"? This action cannot be undone.`)) {
    return;
  }
  
  try {
    await apiCall(`/documents/${key}`, {
      method: 'DELETE'
    });
    
    showNotification(`Document ${key} deleted successfully`, 'success');
    
    // Limpiar el editor si el documento eliminado estaba cargado
    if (state.selectedDocument === key) {
      DOM.getElementById('documentKey').value = '';
      DOM.getElementById('documentContent').value = '';
      DOM.getElementById('documentInfo').innerHTML = '<p>Select a document to view information</p>';
      DOM.getElementById('versionsTable').innerHTML = '';
      state.selectedDocument = null;
    }
    
    // Recargar la lista
    await loadDocuments();
  } catch (error) {
    console.error('Failed to delete document:', error);
    showNotification(`Failed to delete document: ${error.message}`, 'error');
  }
}

// Event listeners
DOM.addEventListener('DOMContentLoaded', function () {
  // Button event listeners
  DOM.getElementById('btnListDocuments').onclick = loadDocuments;
  DOM.getElementById('btnLoadDocument').onclick = () => {
    const key = DOM.getElementById('documentKey').value;
    if (key) loadDocument(key);
  };
  DOM.getElementById('btnSaveVersion').onclick = saveDocumentVersion;
  DOM.getElementById('btnPublishDocument').onclick = () => {
    const key = DOM.getElementById('documentKey').value;
    if (key) {
      showNotification('Please use the version table to publish specific versions', 'info');
    }
  };

  DOM.getElementById('btnListReleases').onclick = loadReleases;
  DOM.getElementById('btnCreateRelease').onclick = createRelease;
  DOM.getElementById('btnSubmitRelease').onclick = createRelease;

  DOM.getElementById('btnListEnvironments').onclick = loadEnvironments;
  DOM.getElementById('btnListWorkflows').onclick = loadWorkflows;
  DOM.getElementById('btnDeployRelease').onclick = deployRelease;

  DOM.getElementById('btnRunSimulation').onclick = runSimulation;

  DOM.getElementById('btnLoadAudit').onclick = loadAuditLog;
  DOM.getElementById('btnExportAudit').onclick = () => {
    showNotification('Export functionality coming soon', 'info');
  };

  DOM.getElementById('btnProcessUpload').onclick = processUpload;

  // Format JSON on blur
  ['documentContent', 'simulationPayload'].forEach(id => {
    DOM.getElementById(id).addEventListener('blur', function () {
      try {
        const parsed = JSON.parse(this.value);
        this.value = formatJSON(parsed);
      } catch (e) {
        // Invalid JSON, leave as is
      }
    });
  });

  // Load initial data
  loadDocuments();

  // Check connection status
  checkConnectionStatus();
});

// Auto-refresh connection status every 30 seconds
setInterval(checkConnectionStatus, 30000);