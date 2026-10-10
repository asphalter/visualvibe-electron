#!/usr/bin/env python3
"""
test_cdp_sidebar.py — Automated verification using headless Chromium and CDP.
Connects directly to the live code-server instance and inspects the real DOM.
"""
import subprocess
import time
import json
import urllib.request
import websocket
import sys

def test_no_copilot_or_chat():
    cmd = [
        "chromium",
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=9222",
        "--remote-allow-origins=*",
        "http://127.0.0.1:8080/?folder=/home/vvelectron/VisualVibe%20Workdirs/VisualVibe%20Electron"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("[CDP Verification] Starting Chromium headless...")

    try:
        ws_url = None
        for _ in range(30):
            try:
                resp = urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=2)
                tabs = json.loads(resp.read().decode())
                for t in tabs:
                    if t.get("type") == "page":
                        ws_url = t.get("webSocketDebuggerUrl")
                        break
                if ws_url:
                    break
            except Exception:
                pass
            time.sleep(0.5)

        if not ws_url:
            print("[CDP Verification] FAILED: Could not get CDP WebSocket URL.")
            return False

        ws = websocket.create_connection(ws_url, timeout=10)

        def cdp_send(method, params=None):
            msg_id = int(time.time() * 1000) % 1000000
            payload = {"id": msg_id, "method": method, "params": params or {}}
            ws.send(json.dumps(payload))
            while True:
                res = json.loads(ws.recv())
                if res.get("id") == msg_id:
                    return res.get("result", {})

        # Wait for VS Code to finish initialization
        time.sleep(8)

        js_check = """
        (() => {
            const aux = document.querySelector('.part.auxiliarybar');
            const chatEl = document.getElementById('workbench.panel.chat');
            const copilotStatusBar = document.getElementById('chat.statusBarEntry');

            // Find any Copilot mentions in the entire workbench UI
            const copilotMentions = [];
            document.querySelectorAll('[aria-label*="copilot" i], [title*="copilot" i], [id*="copilot" i]').forEach(el => {
                copilotMentions.push({
                    tag: el.tagName,
                    id: el.id,
                    ariaLabel: el.getAttribute('aria-label')
                });
            });

            // Find any Chat view or panel inside Secondary Side Bar
            const auxChatMentions = [];
            if (aux) {
                aux.querySelectorAll('[aria-label*="chat" i], [title*="chat" i], [id*="chat" i]').forEach(el => {
                    auxChatMentions.push({
                        tag: el.tagName,
                        id: el.id,
                        ariaLabel: el.getAttribute('aria-label')
                    });
                });
            }

            return {
                chatPanelInDOM: !!chatEl,
                copilotInStatusBar: !!copilotStatusBar,
                copilotMentionsTotal: copilotMentions.length,
                copilotMentions: copilotMentions,
                auxChatMentionsTotal: auxChatMentions.length,
                auxChatMentions: auxChatMentions,
                activeAuxiliaryTitle: document.querySelector('.part.auxiliarybar .title-label h2')?.innerText || ''
            };
        })()
        """

        eval_res = cdp_send("Runtime.evaluate", {"expression": js_check, "returnByValue": True})
        val = eval_res.get("result", {}).get("value", {})

        print("\n================== VERIFICA CDP LIVE ==================")
        print(f"Chat panel (#workbench.panel.chat) in DOM:    {val.get('chatPanelInDOM')} (Atteso: False)")
        print(f"Copilot status bar entry in DOM:               {val.get('copilotInStatusBar')} (Atteso: False)")
        print(f"Totale riferimenti a Copilot nel workbench:    {val.get('copilotMentionsTotal')} (Atteso: 0)")
        print(f"Totale elementi Chat nella Secondary Side Bar: {val.get('auxChatMentionsTotal')} (Atteso: 0)")
        print(f"Titolo pannello attivo Secondary Side Bar:     '{val.get('activeAuxiliaryTitle')}'")
        print("=======================================================")

        passed = (
            not val.get("chatPanelInDOM")
            and not val.get("copilotInStatusBar")
            and val.get("copilotMentionsTotal") == 0
            and val.get("auxChatMentionsTotal") == 0
        )

        ws.close()
        return passed

    finally:
        proc.kill()
        proc.wait()

if __name__ == "__main__":
    ok = test_no_copilot_or_chat()
    print("ESITO TEST:", "SUPERATO (Chat/Copilot NON presente)" if ok else "FALLITO")
    sys.exit(0 if ok else 1)
