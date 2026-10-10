// VisualVibe Projects — Quick project picker for code-server
// Lists all project directories in "VisualVibe Workdirs" and opens each as an
// isolated workspace root (?folder=...) so Zoo Code sessions remain separate per project.
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function getWorkdirsRoot() {
    const home = process.env.HOME || '/home/vvelectron';
    const candidate = path.join(home, 'VisualVibe Workdirs');
    if (fs.existsSync(candidate)) {
        return candidate;
    }
    const current = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (current) {
        if (path.basename(current) === 'VisualVibe Workdirs') {
            return current;
        }
        const parent = path.dirname(current);
        if (path.basename(parent) === 'VisualVibe Workdirs') {
            return parent;
        }
    }
    return candidate;
}

function scanProjects(workdirsRoot) {
    if (!fs.existsSync(workdirsRoot)) {
        return [];
    }
    try {
        const entries = fs.readdirSync(workdirsRoot, { withFileTypes: true });
        let ignoredList = ['tmp', '.git', '.vscode', 'node_modules', '__pycache__', 'VisualVibe Workdirs'];
        const configCandidates = [
            '/opt/visualvibe/config/ignored-dirs.json',
            path.join(__dirname, '..', '..', 'config', 'ignored-dirs.json')
        ];
        for (const cfg of configCandidates) {
            if (fs.existsSync(cfg)) {
                try {
                    ignoredList = JSON.parse(fs.readFileSync(cfg, 'utf8'));
                    break;
                } catch (e) {}
            }
        }
        const ignored = new Set(ignoredList);
        const projects = [];
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            if (ent.name.startsWith('.')) continue;
            if (ignored.has(ent.name)) continue;
            const fullPath = path.join(workdirsRoot, ent.name);
            projects.push({
                name: ent.name,
                path: fullPath
            });
        }
        projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        return projects;
    } catch (e) {
        console.error('[VisualVibe Projects] Scan error:', e);
        return [];
    }
}

function getCurrentFolderPath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCss() {
    return `
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background-color: var(--vscode-sideBar-background, #1e1e1e);
            padding: 12px;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        h3 {
            margin: 0;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarTitle-foreground, #bbbbbb);
        }
        .header-row { display: flex; align-items: center; justify-content: space-between; }
        .refresh-btn {
            background: transparent; border: none;
            color: var(--vscode-descriptionForeground, #888888);
            cursor: pointer; padding: 4px; border-radius: 3px; display: flex; align-items: center;
        }
        .refresh-btn:hover {
            color: var(--vscode-foreground, #cccccc);
            background: var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.31));
        }
        .info {
            background: var(--vscode-editor-background, #252526);
            border: 1px solid var(--vscode-widget-border, #333333);
            border-radius: 4px; padding: 8px 10px; font-size: 11px; line-height: 1.4;
            color: var(--vscode-descriptionForeground, #888888);
        }
        .info strong { color: var(--vscode-foreground, #cccccc); }
        .project-list { display: flex; flex-direction: column; gap: 8px; }
        .project-card {
            background: var(--vscode-editor-background, #252526);
            border: 1px solid var(--vscode-widget-border, #333333);
            border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
            transition: border-color 0.15s ease;
        }
        .project-card:hover { border-color: var(--vscode-focusBorder, #007acc); }
        .project-card.is-current {
            border-color: var(--vscode-charts-green, #4ec9b0);
            background: var(--vscode-list-activeSelectionBackground, rgba(9, 71, 113, 0.3));
        }
        .project-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .project-name {
            font-weight: 600; font-size: 12px; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; color: var(--vscode-foreground, #ffffff);
        }
        .badge {
            font-size: 10px; padding: 2px 6px; border-radius: 3px;
            text-transform: uppercase; font-weight: 600; letter-spacing: 0.3px;
        }
        .badge.active {
            background: rgba(78, 201, 176, 0.2); color: var(--vscode-charts-green, #4ec9b0);
            border: 1px solid rgba(78, 201, 176, 0.4);
        }
        .project-actions { display: flex; gap: 6px; }
        .btn {
            display: inline-flex; align-items: center; justify-content: center;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #ffffff);
            border: none; padding: 5px 12px; border-radius: 2px;
            cursor: pointer; text-decoration: none; font-size: 12px; font-weight: 500;
            width: 100%; box-sizing: border-box; transition: background 0.15s ease;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
        .btn-current {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #ffffff);
            opacity: 0.6; cursor: default;
        }
        .empty-state {
            color: var(--vscode-descriptionForeground, #888888);
            font-size: 12px;
            font-style: italic;
            padding: 8px 0;
        }
    `;
}

function buildHtml(workdirsRoot) {
    const projects = scanProjects(workdirsRoot);
    const currentPath = getCurrentFolderPath();

    const projectCards = projects.map(p => {
        const isCurrent = p.path === currentPath;
        const targetUrl = `/?folder=${encodeURIComponent(p.path)}`;
        const badge = isCurrent
            ? `<span class="badge active">Attivo</span>`
            : '';
        const btnHtml = isCurrent
            ? `<button class="btn btn-current" disabled>In uso</button>`
            : `<a class="btn" href="${targetUrl}" target="_top">Apri</a>`;

        return `
        <div class="project-card ${isCurrent ? 'is-current' : ''}">
            <div class="project-header">
                <span class="project-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                ${badge}
            </div>
            <div class="project-actions">
                ${btnHtml}
            </div>
        </div>`;
    }).join('\n');

    const contentHtml = projectCards.length > 0
        ? projectCards
        : '<div class="empty-state">Nessun progetto trovato in VisualVibe Workdirs. Crea una cartella per iniziare.</div>';

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
    <style>${getCss()}</style>
</head>
<body>
    <div class="header-row">
        <h3>Progetti VisualVibe</h3>
        <button class="refresh-btn" id="refreshBtn" title="Aggiorna lista">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12.75 8a4.5 4.5 0 0 1-8.61 1.89l-1.39.48a6 6 0 1 0 1.25-6.52V2h1.5v4h-4V4.5h1.82A4.5 4.5 0 0 1 12.75 8z"/>
            </svg>
        </button>
    </div>
    <div class="info">
        Aprire un singolo progetto isola la <strong>task history di Zoo Code</strong> e applica le sue regole e la <code>memory-bank/</code>.
    </div>
    <div class="project-list">
        ${contentHtml}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });
    </script>
</body>
</html>`;
}

function activate(context) {
    console.log('[VisualVibe Projects] Activating extension...');

    const workdirsRoot = getWorkdirsRoot();
    let currentWebviewView = null;

    function updateWebview() {
        if (currentWebviewView) {
            currentWebviewView.webview.html = buildHtml(workdirsRoot);
        }
    }

    const provider = {
        resolveWebviewView(webviewView) {
            currentWebviewView = webviewView;
            webviewView.webview.options = {
                enableScripts: true,
            };
            webviewView.webview.html = buildHtml(workdirsRoot);

            webviewView.webview.onDidReceiveMessage(message => {
                if (message?.command === 'refresh') {
                    updateWebview();
                }
            });

            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    updateWebview();
                }
            });
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('visualvibe.projects', provider)
    );

    const refreshCmd = vscode.commands.registerCommand('vv-project-picker.refresh', () => {
        updateWebview();
    });
    context.subscriptions.push(refreshCmd);

    // BUG FIX: On the empty window (no folder open) VS Code collapses the primary
    // Side Bar by default because there is no active viewlet to restore. Focus the
    // VisualVibe Projects view container so the Side Bar opens and the project
    // picker is immediately visible on first launch.
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        setTimeout(() => {
            vscode.commands.executeCommand('workbench.view.extension.visualvibe-projects')
                .then(undefined, () => {});
        }, 500);
    }

    console.log('[VisualVibe Projects] Activated successfully.');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
