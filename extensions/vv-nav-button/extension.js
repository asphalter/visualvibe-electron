// VisualVibe Navigator — FileBrowser access from VS Code
// Provides:
// 1. Activity Bar icon (left sidebar) with an embedded FileBrowser view
// 2. Command palette integration
'use strict';

const vscode = require('vscode');

function activate(context) {
    console.log('[VisualVibe Nav] Activating extension...');

    try {
        // 1. Webview View Provider for the Activity Bar panel
        const provider = {
            resolveWebviewView(webviewView, _context, _token) {
                webviewView.webview.options = {
                    enableScripts: true,
                };
                webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background-color: var(--vscode-sideBar-background, #1e1e1e);
            padding: 16px;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        h3 {
            margin: 0;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarTitle-foreground, #bbbbbb);
        }
        p {
            margin: 0;
            line-height: 1.4;
            color: var(--vscode-descriptionForeground, #888888);
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #ffffff);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            width: 100%;
            box-sizing: border-box;
            transition: background 0.15s ease;
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        .info {
            background: var(--vscode-editor-background, #252526);
            border: 1px solid var(--vscode-widget-border, #333333);
            border-radius: 4px;
            padding: 12px;
            font-size: 12px;
        }
        .info code {
            font-family: var(--vscode-editor-font-family, monospace);
            color: var(--vscode-textLink-foreground, #3794ff);
        }
    </style>
</head>
<body>
    <h3>VISUALVIBE FILEBROWSER</h3>
    <p>Manage, upload, and download files in your VisualVibe workspace using FileBrowser Quantum.</p>
    <a class="btn" href="/filebrowser/" target="_top">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 2.5A.75.75 0 0 0 1 3.25v9.5c0 .414.336.75.75.75h12.5a.75.75 0 0 0 .75-.75V5.75a.75.75 0 0 0-.75-.75H7.414L5.707 3.293A1 1 0 0 0 5 3H1.75zm0-1H5a2 2 0 0 1 1.414.586L8.121 3.8H14.25A1.75 1.75 0 0 1 16 5.55v7.2a1.75 1.75 0 0 1-1.75 1.75H1.75A1.75 1.75 0 0 1 0 12.75V3.25C0 2.284.784 1.5 1.75 1.5z"/>
        </svg>
        Open FileBrowser
    </a>
    <div class="info">
        <strong>Root Directory:</strong><br>
        <code>VisualVibe Workdirs</code>
    </div>
</body>
</html>`;
            }
        };

        const viewReg = vscode.window.registerWebviewViewProvider(
            'visualvibe.filebrowser',
            provider
        );
        context.subscriptions.push(viewReg);

        console.log('[VisualVibe Nav] Extension activated successfully!');
    } catch (err) {
        console.error('[VisualVibe Nav] Activation failed:', err);
    }
}

function deactivate() {}

module.exports = { activate, deactivate };
