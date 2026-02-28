import * as vscode from 'vscode';

/**
 * Returns the full HTML document for the Replay Panel WebView.
 * All logic runs inside the WebView — no access to Node APIs.
 */
export function buildWebviewHtml(
  nonce: string,
  cspSource: string,
  _extensionUri: vscode.Uri,
  _webview: vscode.Webview,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'nonce-${nonce}';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indus HTTP Replay</title>
  <style nonce="${nonce}">${STYLES}</style>
</head>
<body>
  <div id="app">
    <div class="toolbar">
      <span class="brand">⚡ Indus HTTP Replay</span>
      <span id="req-title" class="req-title"></span>
      <button id="btn-cancel" class="btn btn-danger hidden">Cancel</button>
    </div>
    <div id="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Waiting for request…</p>
    </div>
    <div id="main" class="main hidden">
      <div class="tab-bar">
        <button class="tab active" data-tab="body">Body</button>
        <button class="tab" data-tab="headers">Headers</button>
        <button class="tab" data-tab="raw">Raw</button>
        <button class="tab" data-tab="diff">Diff</button>
      </div>
      <div id="results-grid" class="results-grid"></div>
    </div>
  </div>

  <script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  #app { display: flex; flex-direction: column; height: 100vh; }

  /* Toolbar */
  .toolbar {
    display: flex; align-items: center; gap: 12px;
    padding: 6px 12px;
    background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .brand { font-weight: 700; font-size: 0.95em; color: var(--vscode-textLink-foreground); }
  .req-title { font-family: monospace; font-size: 0.9em; color: var(--vscode-descriptionForeground); flex: 1; }

  /* Buttons */
  .btn { padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em; }
  .btn-danger { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-inputValidation-errorForeground, #f48771); }
  .btn-danger:hover { opacity: 0.85; }
  .hidden { display: none !important; }

  /* Loading */
  .loading-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--vscode-descriptionForeground); }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-panel-border); border-top-color: var(--vscode-textLink-foreground); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Main layout */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  /* Tab bar */
  .tab-bar {
    display: flex; gap: 0; flex-shrink: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
  }
  .tab {
    padding: 6px 16px; border: none; cursor: pointer;
    background: transparent; color: var(--vscode-foreground);
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    border-bottom: 2px solid transparent;
    opacity: 0.7;
  }
  .tab.active { border-bottom-color: var(--vscode-textLink-foreground); opacity: 1; font-weight: 600; }
  .tab:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,.06)); }

  /* Results grid: one column per target */
  .results-grid {
    display: flex; flex: 1; overflow: hidden;
  }
  .result-col {
    flex: 1; display: flex; flex-direction: column;
    border-right: 1px solid var(--vscode-panel-border);
    overflow: hidden;
    min-width: 0;
  }
  .result-col:last-child { border-right: none; }

  /* Result column header */
  .col-header {
    padding: 6px 12px; flex-shrink: 0;
    display: flex; align-items: center; gap: 10px;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 0.85em;
  }
  .col-target { font-family: monospace; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-badge {
    font-family: monospace; font-weight: bold; font-size: 0.9em;
    padding: 1px 7px; border-radius: 10px;
  }
  .status-2xx { background: #1a3a1a; color: #4caf50; }
  .status-3xx { background: #1a2a3a; color: #64b5f6; }
  .status-4xx { background: #3a2a1a; color: #ff9800; }
  .status-5xx { background: #3a1a1a; color: #f44336; }
  .status-err { background: #2a1a2a; color: #ce93d8; }
  .duration { color: var(--vscode-descriptionForeground); font-size: 0.8em; }

  /* Progress bar inside col */
  .progress-bar { height: 2px; background: var(--vscode-textLink-foreground); transition: width 0.3s; }

  /* Content area */
  .col-content {
    flex: 1; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.5;
  }

  /* Body / Raw */
  .body-content {
    padding: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .json-tree { padding: 12px; }

  /* Headers table */
  .headers-table { width: 100%; border-collapse: collapse; font-size: 0.88em; }
  .headers-table th { padding: 6px 12px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; background: var(--vscode-editor-background); }
  .headers-table td { padding: 4px 12px; border-bottom: 1px solid var(--vscode-panel-border); font-family: monospace; vertical-align: top; }
  .header-name { color: var(--vscode-textLink-foreground); }
  .header-masked { color: var(--vscode-descriptionForeground); font-style: italic; }

  /* Error state */
  .error-box { padding: 16px; }
  .error-kind { font-weight: 700; color: #f44336; margin-bottom: 4px; }
  .error-msg { font-family: monospace; font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: pre-wrap; }

  /* Diff tab */
  .diff-container { padding: 12px; }
  .diff-entry { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; font-family: monospace; font-size: 0.88em; }
  .diff-path { color: var(--vscode-descriptionForeground); flex-shrink: 0; }
  .diff-added .diff-path { color: #4caf50; }
  .diff-removed .diff-path { color: #f44336; }
  .diff-changed .diff-path { color: #ff9800; }
  .diff-val { padding: 1px 6px; border-radius: 3px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diff-left { background: rgba(244,67,54,.15); color: #ef9a9a; }
  .diff-right { background: rgba(76,175,80,.15); color: #a5d6a7; }
  .diff-arrow { color: var(--vscode-descriptionForeground); }
  .diff-section-title { font-weight: 600; margin: 12px 0 6px; color: var(--vscode-foreground); }
  .no-diff { color: var(--vscode-descriptionForeground); padding: 16px; text-align: center; }
  .diff-status { display: flex; gap: 20px; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
  .diff-status-item { font-size: 0.85em; }
  .changed-yes { color: #ff9800; font-weight: 600; }
  .changed-no { color: #4caf50; }

  /* JSON tree expand */
  .json-key { color: var(--vscode-textLink-foreground); }
  .json-string { color: #ce9178; }
  .json-number { color: #b5cea8; }
  .json-bool { color: #569cd6; }
  .json-null { color: #569cd6; }
  .json-indent { padding-left: 16px; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE JAVASCRIPT
// ─────────────────────────────────────────────────────────────────────────────
const SCRIPT = `
(function() {
  'use strict';

  const vscode = acquireVsCodeApi();

  // State
  let currentTab = 'body';
  let state = null;

  // Elements
  const elLoading   = document.getElementById('loading');
  const elMain      = document.getElementById('main');
  const elReqTitle  = document.getElementById('req-title');
  const elBtnCancel = document.getElementById('btn-cancel');
  const elGrid      = document.getElementById('results-grid');

  // Tab buttons
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      renderAll();
    });
  });

  elBtnCancel.addEventListener('click', () => {
    if (state) vscode.postMessage({ command: 'cancel', sessionId: state.sessionId });
  });

  // Message from extension host
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.command) {
      case 'state':
        state = msg;
        elLoading.classList.add('hidden');
        elMain.classList.remove('hidden');
        elBtnCancel.classList.remove('hidden');
        elReqTitle.textContent = state.request.method + ' ' + state.request.path;
        renderAll();
        break;
      case 'progress':
        updateProgress(msg.target, msg.phase);
        break;
      case 'complete':
        elBtnCancel.classList.add('hidden');
        break;
    }
  });

  function renderAll() {
    if (!state) return;
    elGrid.innerHTML = '';
    state.targets.forEach((target, i) => {
      const result = state.results[i];
      elGrid.appendChild(buildColumn(target, result, i));
    });
    if (currentTab === 'diff') {
      renderDiffOverlay();
    }
  }

  function buildColumn(target, result, idx) {
    const col = document.createElement('div');
    col.className = 'result-col';
    col.dataset.target = target.baseUrl;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'col-header';
    hdr.innerHTML = '<span class="col-target">' + esc(target.name || target.baseUrl) + '</span>';

    if (result) {
      if (result.error) {
        hdr.innerHTML += '<span class="status-badge status-err">' + esc(result.error.kind) + '</span>';
      } else {
        const sc = statusClass(result.status);
        hdr.innerHTML += '<span class="status-badge ' + sc + '">' + result.status + '</span>';
        hdr.innerHTML += '<span class="duration">' + result.durationMs + 'ms</span>';
      }
    } else {
      hdr.innerHTML += '<span class="duration">pending…</span>';
    }

    col.appendChild(hdr);

    // Progress bar placeholder
    const pb = document.createElement('div');
    pb.className = 'progress-bar';
    pb.id = 'pb-' + sanitizeId(target.baseUrl);
    pb.style.width = result ? '0' : '40%';
    col.appendChild(pb);

    // Content
    const content = document.createElement('div');
    content.className = 'col-content';

    if (!result) {
      content.innerHTML = '<div class="body-content" style="color:var(--vscode-descriptionForeground)">Waiting…</div>';
    } else if (result.error) {
      content.innerHTML = buildErrorHtml(result.error);
    } else {
      switch (currentTab) {
        case 'body':    content.innerHTML = buildBodyHtml(result.body, result.headers); break;
        case 'headers': content.innerHTML = buildHeadersHtml(result.headers); break;
        case 'raw':     content.innerHTML = buildRawHtml(result); break;
        case 'diff':    content.innerHTML = ''; break; // handled by overlay
      }
    }

    col.appendChild(content);
    return col;
  }

  function buildBodyHtml(body, headers) {
    const ct = (headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json') || isJsonLike(body)) {
      try {
        const parsed = JSON.parse(body);
        return '<div class="json-tree">' + renderJsonTree(parsed, 0) + '</div>';
      } catch {}
    }
    return '<pre class="body-content">' + esc(body) + '</pre>';
  }

  function buildHeadersHtml(headers) {
    const MASKED = new Set(['authorization','cookie','x-api-key','x-auth-token','set-cookie']);
    const rows = Object.entries(headers).map(([k, v]) => {
      const masked = MASKED.has(k.toLowerCase());
      return '<tr><td class="header-name">' + esc(k) + '</td>'
           + '<td class="' + (masked ? 'header-masked' : '') + '">'
           + esc(masked ? '••••••' : v) + '</td></tr>';
    }).join('');
    return '<table class="headers-table"><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function buildRawHtml(result) {
    const statusLine = 'HTTP/1.1 ' + result.status;
    const headerLines = Object.entries(result.headers).map(([k,v]) => k + ': ' + v).join('\\n');
    const raw = statusLine + '\\n' + headerLines + '\\n\\n' + result.body;
    return '<pre class="body-content">' + esc(raw) + '</pre>';
  }

  function buildErrorHtml(error) {
    return '<div class="error-box"><div class="error-kind">' + esc(error.kind.toUpperCase()) + '</div>'
          + '<div class="error-msg">' + esc(error.message) + '</div></div>';
  }

  function renderDiffOverlay() {
    if (!state || !state.diff) {
      // Show "select 2 targets" hint
      elGrid.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--vscode-descriptionForeground);padding:24px;">Diff is available when exactly 2 targets have results.</div>';
      return;
    }
    const diff = state.diff;
    let html = '<div class="diff-container" style="flex:1;overflow:auto;">';

    // Status diff
    html += '<div class="diff-section-title">Status</div>';
    html += '<div class="diff-status">';
    html += '<div class="diff-status-item">Left: <strong>' + diff.statusDiff.left + '</strong></div>';
    html += '<div class="diff-status-item">Right: <strong>' + diff.statusDiff.right + '</strong></div>';
    html += '<div class="diff-status-item ' + (diff.statusDiff.changed ? 'changed-yes' : 'changed-no') + '">'
          + (diff.statusDiff.changed ? '⚠ Different' : '✓ Same') + '</div>';
    html += '</div>';

    // Header diff
    const hdiffs = diff.headerDiff.filter(n => n.kind !== 'unchanged');
    if (hdiffs.length > 0) {
      html += '<div class="diff-section-title">Headers (' + hdiffs.length + ' differences)</div>';
      html += renderDiffNodes(hdiffs);
    } else {
      html += '<div class="diff-section-title">Headers</div><div style="padding:4px 0;color:var(--vscode-descriptionForeground);font-size:.85em">No header differences</div>';
    }

    // Body diff
    const bdiffs = diff.bodyDiff.filter(n => n.kind !== 'unchanged');
    html += '<div class="diff-section-title">Body (' + bdiffs.length + ' differences)</div>';
    if (bdiffs.length === 0) {
      html += '<div class="no-diff">✓ Bodies are identical' + (diff.isJsonDiff ? ' (JSON-aware)' : '') + '</div>';
    } else {
      html += renderDiffNodes(bdiffs);
    }

    html += '</div>';
    elGrid.innerHTML = html;
  }

  function renderDiffNodes(nodes) {
    return nodes.map(n => {
      const cls = 'diff-entry diff-' + n.kind;
      let vals = '';
      if (n.kind === 'added') {
        vals = '<span class="diff-val diff-right">' + esc(stringify(n.rightValue)) + '</span>';
      } else if (n.kind === 'removed') {
        vals = '<span class="diff-val diff-left">' + esc(stringify(n.leftValue)) + '</span>';
      } else if (n.kind === 'changed') {
        vals = '<span class="diff-val diff-left">' + esc(stringify(n.leftValue)) + '</span>'
             + '<span class="diff-arrow"> → </span>'
             + '<span class="diff-val diff-right">' + esc(stringify(n.rightValue)) + '</span>';
      }
      return '<div class="' + cls + '"><span class="diff-path">' + esc(n.path) + '</span>' + vals + '</div>';
    }).join('');
  }

  function renderJsonTree(value, depth) {
    if (value === null) return '<span class="json-null">null</span>';
    if (typeof value === 'boolean') return '<span class="json-bool">' + value + '</span>';
    if (typeof value === 'number') return '<span class="json-number">' + value + '</span>';
    if (typeof value === 'string') return '<span class="json-string">"' + esc(value) + '"</span>';

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map((v, i) =>
        '<div class="json-indent">' + renderJsonTree(v, depth + 1) + (i < value.length - 1 ? ',' : '') + '</div>'
      ).join('');
      return '[' + items + ']';
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      const items = keys.map((k, i) =>
        '<div class="json-indent"><span class="json-key">"' + esc(k) + '"</span>: '
        + renderJsonTree(value[k], depth + 1) + (i < keys.length - 1 ? ',' : '') + '</div>'
      ).join('');
      return '{' + items + '}';
    }

    return esc(String(value));
  }

  function updateProgress(targetUrl, phase) {
    const pbId = 'pb-' + sanitizeId(targetUrl);
    const pb = document.getElementById(pbId);
    if (!pb) return;
    const widths = { connecting: '20%', sending: '50%', receiving: '80%', done: '0' };
    pb.style.width = widths[phase] || '0';
  }

  function statusClass(code) {
    if (code >= 500) return 'status-5xx';
    if (code >= 400) return 'status-4xx';
    if (code >= 300) return 'status-3xx';
    if (code >= 200) return 'status-2xx';
    return 'status-err';
  }

  function isJsonLike(str) {
    const t = (str || '').trim();
    return t.startsWith('{') || t.startsWith('[');
  }

  function stringify(val) {
    if (val === undefined) return '';
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }

  function sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
})();
`;
