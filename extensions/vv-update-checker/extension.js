// VisualVibe Update Checker — Background update checker for VisualVibe Electron
'use strict';

const vscode = require('vscode');

const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/asphalter/visualvibe-electron/refs/heads/main/VERSION';
const STARTUP_DELAY_MS = 30 * 1000;              // 30 seconds delay on startup
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;   // Check every 12 hours
const FETCH_TIMEOUT_MS = 10 * 1000;              // 10 seconds timeout

let startupTimer = null;
let checkInterval = null;
let statusBarItem = null;

/**
 * Compares two version strings formatted as YYYYMMDD.NNN (e.g. 20261012.001).
 * Returns true if remote is strictly greater than local.
 */
function isNewerVersion(remote, local) {
    if (!remote || !local || typeof remote !== 'string' || typeof local !== 'string') {
        return false;
    }

    const rTrim = remote.trim();
    const lTrim = local.trim();
    const rParts = rTrim.split('.');
    const lParts = lTrim.split('.');

    if (rParts.length !== 2 || lParts.length !== 2) {
        return false;
    }

    const rDate = parseInt(rParts[0], 10);
    const lDate = parseInt(lParts[0], 10);
    if (isNaN(rDate) || isNaN(lDate)) {
        return false;
    }

    if (rDate > lDate) {
        return true;
    }
    if (rDate < lDate) {
        return false;
    }

    const rSeq = parseInt(rParts[1], 10);
    const lSeq = parseInt(lParts[1], 10);
    if (isNaN(rSeq) || isNaN(lSeq)) {
        return false;
    }

    return rSeq > lSeq;
}

/**
 * Fetches the remote version string using native fetch with a 10s timeout.
 * Fails silently returning null on network error, non-200 status, or timeout.
 */
async function fetchRemoteVersion() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(REMOTE_VERSION_URL, {
            signal: controller.signal
        });

        if (!response.ok || response.status !== 200) {
            return null;
        }

        const text = await response.text();
        return text ? text.trim() : null;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Performs update check against remote repository.
 * Fails silently if local version is absent, network is unavailable, or versions match.
 */
function updateStatusBar(localVersion, remoteVersion) {
    if (!statusBarItem) {
        return;
    }

    if (!localVersion || typeof localVersion !== 'string') {
        statusBarItem.hide();
        return;
    }

    const trimmedLocal = localVersion.trim();
    if (remoteVersion && isNewerVersion(remoteVersion, trimmedLocal)) {
        statusBarItem.text = `$(cloud-download) VisualVibe v.${trimmedLocal}`;
        statusBarItem.tooltip = `VisualVibe Electron v.${trimmedLocal}\n⚠️ Update available: v.${remoteVersion.trim()}\nRebuild or update the container image to get the latest features.`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
        statusBarItem.text = `$(symbol-event) VisualVibe v.${trimmedLocal}`;
        statusBarItem.tooltip = `VisualVibe Electron v.${trimmedLocal}\nEnvironment is up to date`;
        statusBarItem.backgroundColor = undefined;
    }

    statusBarItem.show();
}

async function checkForUpdates() {
    try {
        const config = vscode.workspace.getConfiguration('visualvibe');
        const localVersion = config.get('version');
        if (!localVersion || typeof localVersion !== 'string') {
            return;
        }

        const remoteVersion = await fetchRemoteVersion();
        if (!remoteVersion) {
            return;
        }

        if (isNewerVersion(remoteVersion, localVersion)) {
            updateStatusBar(localVersion, remoteVersion);
            vscode.window.showWarningMessage(
                `⚠️ VisualVibe Electron v.${remoteVersion} is available (currently using: v.${localVersion}). Update the container to receive the latest updates.`,
                'Ignore'
            );
        }
    } catch (_) {
        // Silently ignore unexpected errors
    }
}

function activate(context) {
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        10000
    );
    statusBarItem.name = 'VisualVibe Version';

    const config = vscode.workspace.getConfiguration('visualvibe');
    const localVer = config.get('version');
    if (localVer && typeof localVer === 'string') {
        updateStatusBar(localVer, null);
    }

    // Monitor changes in settings (e.g. if version is injected dynamically)
    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('visualvibe.version')) {
            const updatedVer = vscode.workspace.getConfiguration('visualvibe').get('version');
            updateStatusBar(updatedVer, null);
        }
    });

    startupTimer = setTimeout(() => {
        checkForUpdates();
    }, STARTUP_DELAY_MS);

    checkInterval = setInterval(() => {
        checkForUpdates();
    }, CHECK_INTERVAL_MS);

    if (context && context.subscriptions) {
        context.subscriptions.push(statusBarItem);
        context.subscriptions.push(configListener);
        context.subscriptions.push({
            dispose: deactivate
        });
    }
}

function deactivate() {
    if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
    }
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = null;
    }
}

module.exports = {
    activate,
    deactivate,
    isNewerVersion
};
