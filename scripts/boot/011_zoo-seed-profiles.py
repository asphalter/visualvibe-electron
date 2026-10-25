#!/usr/bin/env python3
"""
011_zoo-seed-profiles.py — boot — patch Zoo Code's bundled extension.js so that, on
activation, it seeds its "Configuration Profiles" from the environment
(AI_API_URL / AI_API_KEY) before the extension reads them.

Why this is needed: Zoo Code (Roo fork) stores its API config as "Configuration
Profiles" in VS Code SecretStorage (context.secrets), key "roo_cline_config_api_config".
In container environments SecretStorage is not reliably pre-seedable from state.vscdb:
without a system OS keyring service, the secret store is either in-memory or encrypted
with runtime keys. Writing the plaintext JSON under "secret://..." in state.vscdb is
therefore ignored by Zoo Code. The only robust way is to seed through Zoo Code's own
context.secrets at activation time.

IMPORTANT — the seed performs a non-destructive merge: it preserves all pre-existing
user-defined profiles, selectively enforces/upserts the visualvibe-* system profiles
and 'default', preserves the active profile if valid, preserves custom mode mappings
while updating standard modes, and conditionally seeds globalState settings only when undefined.

Idempotent: a versioned marker comment is injected alongside the seed and detected on
re-runs. (The Zoo Code extension dir is restored fresh from /opt on every boot by
001_sync-extensions.sh, so there is no legacy v1 seed to migrate in practice.)
"""
import sys, os, re

sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from vv_common import VV_HOME, HOME, zoo_lang, latest_zoo_ext_dir, PatchTracker

# Tested and validated with Zoo Code version 3.92.0 (the version pinned in
# Containerfile / 002_zoo-fallback.sh).
# When upgrading Zoo Code in Containerfile (ARG ZOO_VERSION), this constant
# MUST be updated and all regex/replace patterns re-verified against new bundle files.
ZOO_CODE_COMPAT_VERSION = "3.92.0"

tracker = PatchTracker("011_zoo-seed-profiles", compat_version=ZOO_CODE_COMPAT_VERSION)

# Versioned marker: bump when the injected snippet's shape changes.
# v1 non-suffixed; v2 logging+always-overwrite; v3 removed welcome keys; v4 re-added
# welcome keys always; v5 status file; v6 fixed anchor (was injecting into the wrong
# function `pll` — see main() comment); v7 seeds Zoo Code settings (language from
# AI_LANG, auto-approve everything except Question, preventFocusDisruption); v8 removes file logging to /tmp;
# v9 disables auto-approval for mode switch (alwaysAllowModeSwitch=false);
# v10 enables image support (supportsImages=true) and re-enables mode switch auto-approval (alwaysAllowModeSwitch=true);
# v11 sets per-model reasoningEffort (orchestrator: high, code: medium, ask: medium, architect: high, debug: high);
# v12 enables prompt caching (supportsPromptCache=true) on all models.
# v13 anchors strictly to the exported activate() function (no generic fallback) on Zoo Code 3.90.0.
# v14 adds toolRepetitionLimitsMigrated:true in migrations and verified on Zoo Code 3.92.0.
# v15 non-destructive merge of user profiles, selective visualvibe-* enforcing, conditional globalState pre-seeding.
MARKER = "/*[VisualVibe profiles seed v15]*/"

# Seed snippet injected at the top of Zoo Code's activate() function. __CTX__ is
# replaced with the activate() context parameter name found in the bundle.
SEED = (
    MARKER
    + 'try{const __vvk="roo_cline_config_api_config",'
    + '__log=(m)=>{console.log("[VisualVibe] "+m)};'
    + '__log("seed running; AI_API_URL="+(process.env.AI_API_URL?"set":"MISSING")+", AI_API_KEY="+(process.env.AI_API_KEY?"set":"MISSING"));'
    + 'if(process.env.AI_API_URL&&process.env.AI_API_KEY){'
    + 'const __u=process.env.AI_API_URL,__k=process.env.AI_API_KEY,'
    + '__mk=(id,m,eff)=>({id,apiProvider:"openai",openAiBaseUrl:__u,openAiApiKey:__k,openAiModelId:m,'
    + 'enableReasoningEffort:true,reasoningEffort:eff,'
    + 'openAiCustomModelInfo:{maxTokens:null,maxThinkingTokens:null,contextWindow:1e6,supportsImages:true,supportsPromptCache:true,supportsReasoningEffort:true,reasoningEffort:eff}}),'
    + '__effMap={"visualvibe-orchestrator":"high","visualvibe-code":"medium","visualvibe-ask":"medium","visualvibe-architect":"high","visualvibe-debug":"high","default":"medium"};'
    + 'let __existing=null;'
    + 'try{const __raw=await __CTX__.secrets.get(__vvk);if(__raw){__existing=JSON.parse(__raw);}}catch(__re){__log("read/parse existing profiles failed: "+(__re&&__re.message?__re.message:__re));__existing=null;}'
    + 'const __exCf=(__existing&&typeof __existing.apiConfigs==="object"&&__existing.apiConfigs!==null)?__existing.apiConfigs:{};'
    + 'const __gsMd=__CTX__.globalState.get("modeApiConfigs");'
    + 'const __exMd={...((typeof __gsMd==="object"&&__gsMd!==null)?__gsMd:{}),...((__existing&&typeof __existing.modeApiConfigs==="object"&&__existing.modeApiConfigs!==null)?__existing.modeApiConfigs:{})};'
    + 'const __isSys=(n)=>n==="default"||(typeof n==="string"&&n.startsWith("visualvibe-"));'
    + 'const __mergedCf={};'
    + 'for(const[n,p]of Object.entries(__exCf)){if(!__isSys(n)){__mergedCf[n]=p;}}'
    + '__mergedCf["default"]=__mk("default","visualvibe-default",__effMap["default"]);'
    + 'for(const[m,p]of[["architect","visualvibe-architect"],["code","visualvibe-code"],["ask","visualvibe-ask"],["debug","visualvibe-debug"],["orchestrator","visualvibe-orchestrator"]]){'
    + '__mergedCf[p]=__mk(p,p,__effMap[p]||"medium");}'
    + 'let __curName=(__existing&&typeof __existing.currentApiConfigName==="string")?__existing.currentApiConfigName:null;'
    + 'if(!__curName||!__mergedCf[__curName]){__curName="default";}'
    + 'const __mergedMd={...__exMd};'
    + 'for(const[m,p]of[["architect","visualvibe-architect"],["code","visualvibe-code"],["ask","visualvibe-ask"],["debug","visualvibe-debug"],["orchestrator","visualvibe-orchestrator"]]){'
    + '__mergedMd[m]=p;}'
    + 'for(const[m,p]of Object.entries(__mergedMd)){if(!__mergedCf[p]){__mergedMd[m]="default";}}'
    + 'const __sysMigrations={rateLimitSecondsMigrated:true,openAiHeadersMigrated:true,consecutiveMistakeLimitMigrated:true,toolRepetitionLimitsMigrated:true,todoListEnabledMigrated:true,claudeCodeLegacySettingsMigrated:true,routerProviderMigrated:true};'
    + 'const __mergedMigrations={...((__existing&&typeof __existing.migrations==="object"&&__existing.migrations!==null)?__existing.migrations:{}),...__sysMigrations};'
    + 'try{await __CTX__.secrets.store(__vvk,JSON.stringify({currentApiConfigName:__curName,apiConfigs:__mergedCf,modeApiConfigs:__mergedMd,migrations:__mergedMigrations}));'
    + 'await __CTX__.globalState.update("modeApiConfigs",__mergedMd);'
    + '__log("profiles merged & stored OK (total: "+Object.keys(__mergedCf).length+", user preserved: "+Object.keys(__mergedCf).filter(k=>!__isSys(k)).length+", active: "+__curName+")");}'
    + 'catch(__e1){__log("profiles store FAILED: "+(__e1&&__e1.message?__e1.message:__e1));}'
    + 'try{if(!(await __CTX__.secrets.get("openAiApiKey"))){await __CTX__.secrets.store("openAiApiKey",__k);}'
    + 'if(__CTX__.globalState.get("apiProvider")===undefined){await __CTX__.globalState.update("apiProvider","openai");}'
    + 'if(__CTX__.globalState.get("openAiBaseUrl")===undefined){await __CTX__.globalState.update("openAiBaseUrl",__u);}'
    + 'if(__CTX__.globalState.get("enableReasoningEffort")===undefined){await __CTX__.globalState.update("enableReasoningEffort",true);}'
    + 'if(__CTX__.globalState.get("reasoningEffort")===undefined){await __CTX__.globalState.update("reasoningEffort","medium");}'
    + '__log("welcome keys stored OK");}'
    + 'catch(__e2){__log("welcome keys FAILED: "+(__e2&&__e2.message?__e2.message:__e2));}'
    + '}else{__log("env vars missing; skip seed");}'
    + 'try{const __lang="' + zoo_lang() + '",'
    + '__setIf=async(k,v)=>{if(__CTX__.globalState.get(k)===undefined){await __CTX__.globalState.update(k,v);}};'
    + 'await __setIf("language",__lang);'
    + 'await __setIf("preferredLanguage",__lang);'
    + 'await __setIf("autoApprovalEnabled",true);'
    + 'await __setIf("alwaysAllowReadOnly",true);'
    + 'await __setIf("alwaysAllowReadOnlyOutsideWorkspace",true);'
    + 'await __setIf("alwaysAllowWrite",true);'
    + 'await __setIf("alwaysAllowWriteOutsideWorkspace",true);'
    + 'await __setIf("alwaysAllowWriteProtected",true);'
    + 'await __setIf("alwaysAllowExecute",true);'
    + 'await __setIf("allowedCommands",["*"]);'
    + 'await __setIf("deniedCommands",[]);'
    + 'await __setIf("destructiveCommandGuardEnabled",false);'
    + 'await __setIf("alwaysAllowMcp",true);'
    + 'await __setIf("alwaysAllowModeSwitch",true);'
    + 'await __setIf("alwaysAllowSubtasks",true);'
    + 'await __setIf("alwaysAllowFollowupQuestions",false);'
    + 'let __curExp=__CTX__.globalState.get("experiments");'
    + 'if(__curExp===undefined){await __CTX__.globalState.update("experiments",{preventFocusDisruption:true});}'
    + 'else if(typeof __curExp==="object"&&__curExp!==null&&__curExp.preventFocusDisruption===undefined){await __CTX__.globalState.update("experiments",{...__curExp,preventFocusDisruption:true});}'
    + '__log("settings conditionally initialized OK (lang="+__lang+")");}'
    + 'catch(__e3){__log("settings FAILED: "+(__e3&&__e3.message?__e3.message:__e3));}'
    + '}catch(__e0){__log("seed outer FAILED: "+(__e0&&__e0.message?__e0.message:__e0))}'
)


def main():
    ext_dir = latest_zoo_ext_dir()
    if not ext_dir:
        print("[Init] Zoo Code extension dir not found; skipping profiles seed.")
        return

    ext_js = os.path.join(ext_dir, "dist", "extension.js")
    if not os.path.isfile(ext_js):
        print("[Init] Zoo Code extension.js not found; skipping profiles seed.")
        return

    with open(ext_js, "r", encoding="utf-8", errors="replace") as f:
        s = f.read()

    if MARKER in s:
        print(f"[Init] Zoo Code profiles seed ({MARKER}) already applied.")
        return

    # Strip any older seed version so upgrades/re-runs cleanly replace the injection.
    s = tracker.tracked_sub(
        r'/\*\[VisualVibe profiles seed [^\]]+\]\*/.*?(catch\(__e0\)\{[^}]+\})',
        '',
        s,
        name="strip-legacy-seed",
        critical=False,
        log_level="DEBUG",
    )

    # Activate() signature:
    # - Zoo Code 3.86.0: async function gll(t){oxi=t, ...  (context stored globally as `oxi`)
    # - Zoo Code 3.88.0: async function lgl(t){F_i=t, ...  (context stored globally as `F_i`)
    # - Zoo Code 3.90.0: the export `activate:()=>NAME` still resolves the real entry
    #   point, but the function body may differ, so anchor on the exported name only.
    # Resolve the real activate() from the bundle export and inject the seed immediately
    # after its opening brace. Deliberately do NOT fall back to a generic "any async
    # function" pattern: a wrong match (e.g. the mode-switch handler) makes the seed run
    # only after a mode change, reproducing the "default profile keeps gpt-o4 on first
    # open" symptom.
    act_pattern = None
    act_fn = None
    m_exp = re.search(r"activate:\(\)=>([A-Za-z0-9_$]+)", s)
    if m_exp:
        act_fn = m_exp.group(1)
        act_pattern = rf"(async function {re.escape(act_fn)}\(([A-Za-z0-9_$]+)\)\{{)"
        if not re.search(act_pattern, s):
            print(f"[Init] WARN: exported activate() {act_fn!r} declaration not found; refusing generic fallback injection.")
            act_pattern = None

    if not act_pattern:
        print("[Init] ERROR: Zoo Code activate() anchor not found; profiles seed NOT applied.")
        tracker.report()
        if tracker.has_critical_failures():
            sys.stderr.write("[Init] CRITICAL: Zoo Code extension.js patching failed! Container startup will continue, but AI profiles may not be seeded.\n")
        return

    ctx_ref = [None]

    def _inject_seed(match):
        opening = match.group(1)
        ctx = match.group(2)
        ctx_ref[0] = ctx
        seed = SEED.replace("__CTX__", ctx)
        rest = match.group(0)[len(opening):]
        return opening + seed + rest

    s = tracker.tracked_sub(
        act_pattern,
        _inject_seed,
        s,
        name="inject-activate-seed",
        critical=True,
        count=1,
    )

    if ctx_ref[0] is None:
        print("[Init] ERROR: Zoo Code activate() anchor not found; profiles seed NOT applied.")
        tracker.report()
        if tracker.has_critical_failures():
            sys.stderr.write("[Init] CRITICAL: Zoo Code extension.js patching failed! Container startup will continue, but AI profiles may not be seeded.\n")
        return

    with open(ext_js, "w", encoding="utf-8") as f:
        f.write(s)

    # Verify the injection actually landed (fail-loud if not).
    with open(ext_js, "r", encoding="utf-8", errors="replace") as f:
        check = f.read()
    ctx = ctx_ref[0]
    verification_ok = False
    if MARKER in check and act_fn and ctx:
        # The seed must sit immediately after the real activate() opening brace.
        verification_ok = re.search(
            rf"async function {re.escape(act_fn)}\({re.escape(ctx)}\)\{{{re.escape(MARKER)}",
            check,
        ) is not None
    if verification_ok:
        print("[Init] Zoo Code profiles seed injected into extension.js (activate).")
    else:
        print("[Init] ERROR: profiles seed injection verification FAILED (marker/activate anchor missing).")

    tracker.report()
    if tracker.has_critical_failures():
        sys.stderr.write("[Init] CRITICAL: Zoo Code extension.js patching had critical failures! Container startup will continue.\n")


if __name__ == "__main__":
    main()
