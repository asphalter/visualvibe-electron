// Mock minimal VS Code environment
const EventEmitter = require('events');

// Load extension module with mocked vscode
const moduleExports = {};
const warningMessages = [];
const executedCommands = [];
let lastCreatedStatusBarItem = null;

const mockVscode = {
  window: {
    createStatusBarItem: () => {
      lastCreatedStatusBarItem = {
        text: '',
        tooltip: '',
        command: '',
        backgroundColor: undefined,
        color: undefined,
        show: () => {},
        dispose: () => {}
      };
      return lastCreatedStatusBarItem;
    },
    createOutputChannel: () => ({
      appendLine: (msg) => console.log(`[OUTPUT_CHANNEL] ${msg}`),
      dispose: () => {}
    }),
    showInformationMessage: () => Promise.resolve(),
    showWarningMessage: (msg) => {
      warningMessages.push(msg);
      return Promise.resolve();
    },
    showErrorMessage: () => Promise.resolve(),
    showInputBox: () => Promise.resolve()
  },
  StatusBarAlignment: { Right: 2 },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      update: () => Promise.resolve()
    }),
    workspaceFolders: [{ name: 'test-workspace', uri: { fsPath: '/mock/workspace' } }],
    onDidChangeConfiguration: () => ({ dispose: () => {} })
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: (cmd, ...args) => {
      executedCommands.push({ cmd, args });
      return Promise.resolve();
    }
  },
  extensions: {
    getExtension: () => null
  },
  Uri: {
    file: (p) => ({ fsPath: p })
  },
  ThemeColor: function(id) {
    this.id = id;
  }
};

// Patch require for vscode
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path === 'vscode') return mockVscode;
  return origRequire.apply(this, arguments);
};

const bridgeExt = require('./extension.js');
console.log('Bridge module successfully required');

// Set default env credentials for baseline flow tests
process.env.TELEGRAM_BOT_TOKEN = '123456:TEST_TOKEN';
process.env.TELEGRAM_ALLOWED_USER_ID = '999888777';

// Instantiate TelegramBridgeController
const bridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
bridge.init();
bridge.allowedUserId = '999888777';
bridge.state = 'ACTIVE';

const sentMessages = [];
const editMarkupCalls = [];
bridge.telegramClient = {
  sendMessage: async (chatId, text, extra = {}) => {
    sentMessages.push({ chatId, text, extra });
    console.log(`[MOCK_TG_SEND] to ${chatId}:`, text.substring(0, 80));
    return { ok: true, result: { message_id: 1234 } };
  },
  answerCallbackQuery: async (id, text) => {
    console.log(`[MOCK_TG_CB_ANSWER] id=${id} text=${text}`);
    return { ok: true };
  },
  editMessageReplyMarkup: async (chatId, msgId, markup) => {
    editMarkupCalls.push({ chatId, msgId, markup });
    console.log(`[MOCK_TG_EDIT_MARKUP] msgId=${msgId}`, JSON.stringify(markup));
    return { ok: true };
  },
  editMessageText: async (chatId, msgId, text, extra = {}) => {
    sentMessages.push({ chatId, text, options: extra, editedMessageId: msgId });
    console.log(`[MOCK_TG_EDIT_TEXT] msgId=${msgId}:`, text.substring(0, 80));
    return { ok: true, result: { message_id: msgId } };
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  // Test 1: Nested completion_result event
  console.log('--- Test 1: Nested completion_result event ---');
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Activity completed successfully with test data.'
    }
  });

  if (sentMessages.length === 1 && sentMessages[0].text.includes('Activity completed successfully')) {
    console.log('Test 1 PASSED: Completion result correctly forwarded');
  } else {
    console.error('Test 1 FAILED', sentMessages);
    process.exit(1);
  }

  // Test 2: Nested followup question with JSON suggestion array
  console.log('--- Test 2: Nested followup question with suggest array ---');
  const followupJson = JSON.stringify({
    question: 'Quale opzione preferisci?',
    suggest: [
      { answer: 'Opzione A: procedi con fix', mode: 'code' },
      { answer: 'Opzione B: interrompi', mode: null }
    ]
  });

  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'followup',
      text: followupJson
    }
  });

  const lastMsg = sentMessages[sentMessages.length - 1];
  if (lastMsg && lastMsg.text.includes('Quale opzione preferisci?') && lastMsg.extra.reply_markup?.inline_keyboard?.length === 2) {
    console.log('Test 2 PASSED: Followup question with Inline Keyboard buttons generated correctly');
    console.log('Buttons:', JSON.stringify(lastMsg.extra.reply_markup.inline_keyboard));
  } else {
    console.error('Test 2 FAILED', lastMsg);
    process.exit(1);
  }

  // Test 3: Callback query when clicking an option
  console.log('--- Test 3: Callback query option selection ---');
  const btn = lastMsg.extra.reply_markup.inline_keyboard[0][0];
  const callbackData = btn.callback_data;
  console.log('Simulating click with callback_data:', callbackData);

  let forwardedToZoo = null;
  bridge.forwardMessageToZooCode = async (text, chatId) => {
    forwardedToZoo = text;
    console.log(`[FORWARD_TO_ZOO] received text: "${text}"`);
  };

  await bridge.handleCallbackQuery({
    id: 'cb_query_1',
    from: { id: 999888777 },
    message: { chat: { id: 999888777 }, message_id: 1234 },
    data: callbackData
  });

  if (forwardedToZoo === 'Opzione A: procedi con fix') {
    console.log('Test 3 PASSED: Clicked option successfully forwarded to Zoo Code');
  } else {
    console.error('Test 3 FAILED: Expected option text not forwarded:', forwardedToZoo);
    process.exit(1);
  }

  // Test 4: Tool approval request
  console.log('--- Test 4: Tool approval request ---');
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'command',
      command: 'podman ps',
      text: 'Execute container command'
    }
  });

  // The approval prompt is now debounced (400ms) before sending.
  await sleep(600);

  const toolMsg = sentMessages[sentMessages.length - 1];
  if (toolMsg && toolMsg.extra.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'approve') {
    console.log('Test 4 PASSED: Tool approval request correctly forwarded with inline buttons');
  } else {
    console.error('Test 4 FAILED', toolMsg);
    process.exit(1);
  }

  // Test 5: Auto-approved tool request must NOT be forwarded to Telegram
  console.log('--- Test 5: Auto-approved tool request (no Telegram approval) ---');
  const beforeAutoApproval = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'read_file',
      text: 'Read file auto-approved',
      isAnswered: true,
      autoApprovalDecision: 'approve'
    }
  });

  if (sentMessages.length === beforeAutoApproval) {
    console.log('Test 5 PASSED: Auto-approved ask was not forwarded to Telegram');
  } else {
    console.error('Test 5 FAILED: Auto-approved ask still sent a Telegram message', sentMessages.slice(beforeAutoApproval));
    process.exit(1);
  }

  // Test 6: Auto-denied tool request must NOT be forwarded to Telegram
  console.log('--- Test 6: Auto-denied tool request (no Telegram approval) ---');
  const beforeAutoDenial = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'execute_command',
      text: 'Auto-denied command',
      autoApprovalDecision: 'deny'
    }
  });

  if (sentMessages.length === beforeAutoDenial) {
    console.log('Test 6 PASSED: Auto-denied ask was not forwarded to Telegram');
  } else {
    console.error('Test 6 FAILED: Auto-denied ask still sent a Telegram message', sentMessages.slice(beforeAutoDenial));
    process.exit(1);
  }

  // Test 7: Partial streaming tool ask (created + updated partial) followed by
  // a final auto-approved updated must NOT forward any Telegram prompt.
  console.log('--- Test 7: Partial streaming + final auto-approved (no Telegram approval) ---');
  const beforePartial = sentMessages.length;
  const partialMsgId = 'partial-tool-0001';
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: { type: 'ask', ask: 'tool', tool: 'write_to_file', text: 'Write file streaming', partial: true, messageId: partialMsgId, ts: 1000 }
  });
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'updated',
    message: { type: 'ask', ask: 'tool', tool: 'write_to_file', text: 'Write file streaming continued', partial: true, messageId: partialMsgId, ts: 1000 }
  });
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'updated',
    message: { type: 'ask', ask: 'tool', tool: 'write_to_file', text: 'Write file final', partial: false, isAnswered: true, autoApprovalDecision: 'approve', messageId: partialMsgId, ts: 1000 }
  });
  await sleep(600);
  if (sentMessages.length === beforePartial) {
    console.log('Test 7 PASSED: Partial streaming ask was not forwarded to Telegram');
  } else {
    console.error('Test 7 FAILED: Partial streaming ask still sent a Telegram message', sentMessages.slice(beforePartial));
    process.exit(1);
  }

  // Test 8: Genuine pending approval after partial streaming is forwarded exactly once
  // (debounced and deduped by messageId).
  console.log('--- Test 8: Genuine pending approval forwarded exactly once ---');
  const beforeGenuine = sentMessages.length;
  const genuineMsgId = 'genuine-tool-0002';
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: { type: 'ask', ask: 'tool', tool: 'execute_command', text: 'Run risky command', partial: true, messageId: genuineMsgId, ts: 2000 }
  });
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'updated',
    message: { type: 'ask', ask: 'tool', tool: 'execute_command', text: 'Run risky command final', partial: false, messageId: genuineMsgId, ts: 2000 }
  });
  // Duplicate non-partial update must not cause a second send.
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'updated',
    message: { type: 'ask', ask: 'tool', tool: 'execute_command', text: 'Run risky command final', partial: false, messageId: genuineMsgId, ts: 2000 }
  });
  await sleep(600);
  const genuineSent = sentMessages.length - beforeGenuine;
  if (genuineSent === 1) {
    console.log('Test 8 PASSED: Genuine pending approval forwarded exactly once after debounce');
  } else {
    console.error(`Test 8 FAILED: Expected 1 approval prompt, got ${genuineSent}`, sentMessages.slice(beforeGenuine));
    process.exit(1);
  }

  // Test 9: completion_result sequence (say with final text followed by
  // trailing ask with empty text) must send only the final completion message
  // and never an APPROVAL PROMPT.
  console.log('--- Test 9: completion_result say + ask (no approval prompt) ---');
  const beforeCompletion = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'updated',
    message: { type: 'say', say: 'completion_result', text: '### Analisi finale regressione completata.' }
  });
  await bridge.handleZooEvent({
    taskId: 'task-101',
    action: 'created',
    message: { type: 'ask', ask: 'completion_result', text: '' }
  });
  await sleep(600);
  const completionSent = sentMessages.length - beforeCompletion;
  const lastCompletion = sentMessages[sentMessages.length - 1];
  const hasNoApprovalMarkup = !lastCompletion || !lastCompletion.extra || !lastCompletion.extra.reply_markup;
  if (completionSent === 1 && lastCompletion.text.includes('### Analisi finale regressione completata.') && hasNoApprovalMarkup) {
    console.log('Test 9 PASSED: completion_result sequence sent only the final completion message');
  } else {
    console.error(`Test 9 FAILED: Expected 1 completion message and no approval prompt, got ${completionSent}`, sentMessages.slice(beforeCompletion));
    process.exit(1);
  }

  // Test 10: Avvio subtask con tool new_task (formato Zoo Code JSON in text)
  console.log('--- Test 10: Subtask creation via new_task tool (JSON in text) ---');
  const beforeSubtask10 = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-main-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'tool',
      text: JSON.stringify({
        tool: 'newTask',
        mode: 'code',
        content: 'Implementa il modulo di autenticazione OAuth',
        todos: '- [ ] Configura endpoint'
      })
    }
  });

  const subtask10Msg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length > beforeSubtask10 &&
    (subtask10Msg.text.includes('Subtask Started [Profile: Code]') || subtask10Msg.text.includes('Subtask Avviato [Profilo: Code]')) &&
    subtask10Msg.text.includes('Implementa il modulo di autenticazione OAuth')
  ) {
    console.log('Test 10 PASSED: Subtask creation notified with profile Code');
  } else {
    console.error('Test 10 FAILED: Subtask start notification missing or incorrect:', subtask10Msg);
    process.exit(1);
  }

  // Test 11: Avvio subtask con profilo Architect (formato parametri nativi)
  console.log('--- Test 11: Subtask creation via new_task tool with Architect profile ---');
  const beforeSubtask11 = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-main-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'tool',
      tool: 'new_task',
      mode: 'architect',
      message: 'Definisci architettura del sistema'
    }
  });

  const subtask11Msg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length > beforeSubtask11 &&
    (subtask11Msg.text.includes('Subtask Started [Profile: Architect]') || subtask11Msg.text.includes('Subtask Avviato [Profilo: Architect]')) &&
    subtask11Msg.text.includes('Definisci architettura del sistema')
  ) {
    console.log('Test 11 PASSED: Subtask creation notified with profile Architect');
  } else {
    console.error('Test 11 FAILED: Subtask Architect start notification missing or incorrect:', subtask11Msg);
    process.exit(1);
  }

  // Test 12: Completamento subtask (verifica intestazione Subtask Completato [Profilo: Code])
  console.log('--- Test 12: Subtask completion header verification ---');
  const beforeSubtaskComp = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-child-002',
    parentTaskId: 'task-main-001',
    isSubtask: true,
    mode: 'code',
    action: 'created',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Modulo OAuth completato con test passati al 100%.'
    }
  });

  const compMsg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length > beforeSubtaskComp &&
    (compMsg.text.startsWith('🏁 *Subtask Completed [Profile: Code]*') || compMsg.text.startsWith('🏁 *Subtask Completato [Profilo: Code]*')) &&
    compMsg.text.includes('Modulo OAuth completato con test passati al 100%.')
  ) {
    console.log('Test 12 PASSED: Subtask completion result correctly header-formatted with profile');
  } else {
    console.error('Test 12 FAILED: Subtask completion header incorrect:', compMsg);
    process.exit(1);
  }

  // Test 13: Completamento task principale (verifica intestazione Zoo Code — Risultato Finale [Profilo: Orchestrator])
  console.log('--- Test 13: Main task completion header verification ---');
  const beforeMainComp = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-main-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Attività globale dell\'orchestrator finalizzata con successo.'
    }
  });

  const mainCompMsg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length > beforeMainComp &&
    (mainCompMsg.text.startsWith('🏁 *Zoo Code — Final Result [Profile: Orchestrator]*') ||
     mainCompMsg.text.startsWith('🏁 *Zoo Code — Risultato Finale [Profilo: Orchestrator]*')) &&
    mainCompMsg.text.includes('Attività globale dell\'orchestrator finalizzata con successo.')
  ) {
    console.log('Test 13 PASSED: Main task completion result correctly header-formatted with profile');
  } else {
    console.error('Test 13 FAILED: Main task completion header incorrect:', mainCompMsg);
    process.exit(1);
  }

  // Test 14: Verifica helper formatProfileName
  console.log('--- Test 14: formatProfileName formatting check ---');
  const { formatProfileName } = bridgeExt;
  if (
    formatProfileName('code') === 'Code' &&
    formatProfileName('orchestrator') === 'Orchestrator' &&
    formatProfileName('architect') === 'Architect' &&
    formatProfileName('ask') === 'Ask' &&
    formatProfileName('debug') === 'Debug' &&
    formatProfileName('custom_mode') === 'Custom Mode' &&
    formatProfileName('data-analyst') === 'Data Analyst' &&
    formatProfileName(null, 'Code') === 'Code'
  ) {
    console.log('Test 14 PASSED: formatProfileName behaves correctly across standard and custom slugs');
  } else {
    console.error('Test 14 FAILED: formatProfileName returned unexpected values');
    process.exit(1);
  }

  // Test 15: Verifica localizzazione i18n per messaggi subtask
  console.log('--- Test 15: i18n localization dictionary check for subtasks ---');
  const { t } = bridgeExt;
  const enStart = t('subtaskStarted', { profile: 'Code', message: 'Do work' }, 'en');
  const itStart = t('subtaskStarted', { profile: 'Code', message: 'Fai lavoro' }, 'it');
  const enSubComp = t('subtaskCompletedPrefix', { profile: 'Code' }, 'en');
  const itSubComp = t('subtaskCompletedPrefix', { profile: 'Code' }, 'it');
  const enMainComp = t('mainTaskCompletedPrefix', { profile: 'Orchestrator' }, 'en');
  const itMainComp = t('mainTaskCompletedPrefix', { profile: 'Orchestrator' }, 'it');

  if (
    enStart.includes('Subtask Started [Profile: Code]') &&
    itStart.includes('Subtask Avviato [Profilo: Code]') &&
    enSubComp === '🏁 *Subtask Completed [Profile: Code]*\n\n' &&
    itSubComp === '🏁 *Subtask Completato [Profilo: Code]*\n\n' &&
    enMainComp === '🏁 *Zoo Code — Final Result [Profile: Orchestrator]*\n\n' &&
    itMainComp === '🏁 *Zoo Code — Risultato Finale [Profilo: Orchestrator]*\n\n'
  ) {
    console.log('Test 15 PASSED: i18n localization verified for both en and it');
  } else {
    console.error('Test 15 FAILED: i18n dictionary strings mismatch:', {
      enStart, itStart, enSubComp, itSubComp, enMainComp, itMainComp
    });
    process.exit(1);
  }

  // Test 16: Messaggio utente inviato da UI desktop -> inoltrato su Telegram con prefisso 👤 *Utente (UI):*
  console.log('--- Test 16: User prompt from desktop UI forwarded to Telegram with userPromptUiPrefix ---');
  process.env.AI_LANG = 'it';
  const beforeUiPrompt = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-ui-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'user_feedback',
      text: 'Qual è lo stato del container visualvibe?'
    }
  });

  const uiPromptMsg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length === beforeUiPrompt + 1 &&
    uiPromptMsg.text.startsWith('👤 *Utente (UI):*\n\n') &&
    uiPromptMsg.text.includes('Qual è lo stato del container visualvibe?')
  ) {
    console.log('Test 16 (it) PASSED: Desktop UI user prompt correctly prefixed with Italian header');
  } else {
    console.error('Test 16 (it) FAILED: Desktop UI user prompt relay mismatch:', uiPromptMsg);
    process.exit(1);
  }

  // Verifica prefisso in lingua inglese
  process.env.AI_LANG = 'en';
  await bridge.handleZooEvent({
    taskId: 'task-ui-002',
    action: 'created',
    message: {
      type: 'say',
      say: 'user_feedback',
      text: 'What is the container status?'
    }
  });
  const enUiPromptMsg = sentMessages[sentMessages.length - 1];
  if (
    enUiPromptMsg.text.startsWith('👤 *User (UI):*\n\n') &&
    enUiPromptMsg.text.includes('What is the container status?')
  ) {
    console.log('Test 16 (en) PASSED: Desktop UI user prompt correctly prefixed with English header');
  } else {
    console.error('Test 16 (en) FAILED: English desktop UI user prompt relay mismatch:', enUiPromptMsg);
    process.exit(1);
  }
  process.env.AI_LANG = 'it';

  // Test 17: Messaggio utente originato da Telegram -> non duplicato/non rimbalzato
  console.log('--- Test 17: Telegram-originated user prompt suppresses echo ---');
  const tgPromptText = 'Avvia il server di sviluppo';
  bridge.trackTelegramPrompt(tgPromptText);

  const beforeTgEcho = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-tg-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'user_feedback',
      text: tgPromptText
    }
  });

  const afterTgEcho = sentMessages.length;
  if (afterTgEcho === beforeTgEcho) {
    console.log('Test 17 PASSED: Telegram-originated user feedback event correctly suppressed without echo');
  } else {
    console.error('Test 17 FAILED: Telegram prompt echoed back to Telegram:', sentMessages.slice(beforeTgEcho));
    process.exit(1);
  }

  // Test 18: Messaggio dell\'assistente -> inoltrato con 💬 *Zoo Code:*
  console.log('--- Test 18: Assistant message forwarded exclusively with zooCodePrefix ---');
  const beforeAssistant = sentMessages.length;

  // Mark the task model as started so the following say:text is treated as an
  // assistant response (not the initial user prompt).
  await bridge.handleZooEvent({
    taskId: 'task-agent-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'api_req_started'
    }
  });

  await bridge.handleZooEvent({
    taskId: 'task-agent-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'text',
      text: 'Sto controllando la configurazione del bridge.'
    }
  });

  const assistantMsg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length === beforeAssistant + 1 &&
    assistantMsg.text.startsWith('💬 *Zoo Code:') &&
    assistantMsg.text.includes('Sto controllando la configurazione del bridge.')
  ) {
    console.log('Test 18 PASSED: Assistant say:text message relayed with zooCodePrefix');
  } else {
    console.error('Test 18 FAILED: Assistant message prefix mismatch:', assistantMsg);
    process.exit(1);
  }

  // Test 19: Verifica dizionario i18n per userPromptUiPrefix e zooCodePrefix
  console.log('--- Test 19: i18n dictionary verification for userPromptUiPrefix and zooCodePrefix ---');
  const itUiPrefix = t('userPromptUiPrefix', {}, 'it');
  const enUiPrefix = t('userPromptUiPrefix', {}, 'en');
  const itZooPrefix = t('zooCodePrefix', {}, 'it');
  const enZooPrefix = t('zooCodePrefix', {}, 'en');

  if (
    itUiPrefix === '👤 *Utente (UI):*\n\n' &&
    enUiPrefix === '👤 *User (UI):*\n\n' &&
    itZooPrefix.startsWith('💬 *Zoo Code:') &&
    enZooPrefix.startsWith('💬 *Zoo Code:')
  ) {
    console.log('Test 19 PASSED: userPromptUiPrefix and zooCodePrefix verified for en and it');
  } else {
    console.error('Test 19 FAILED: Prefix dictionary mismatch:', {
      itUiPrefix, enUiPrefix, itZooPrefix, enZooPrefix
    });
    process.exit(1);
  }

  // Test 20: Problema 1 - prompt iniziale UI emesso come say:text prima di api_req_started
  console.log('--- Test 20: Initial UI prompt (say:text before api_req_started) as Utente (UI) ---');
  const beforeInitialPrompt = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-ui-init-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'text',
      text: 'Analizza il repository e indicami come procedere'
    }
  });

  const initialPromptMsg = sentMessages[sentMessages.length - 1];
  if (
    sentMessages.length === beforeInitialPrompt + 1 &&
    initialPromptMsg.text.startsWith('👤 *Utente (UI):*') &&
    initialPromptMsg.text.includes('Analizza il repository e indicami come procedere')
  ) {
    console.log('Test 20 PASSED: Initial UI prompt correctly identified as Utente (UI)');
  } else {
    console.error('Test 20 FAILED: Initial UI prompt prefix mismatch:', initialPromptMsg);
    process.exit(1);
  }

  // Test 21: Problema 1 - prompt iniziale Telegram (say:text prima di api_req_started) soppresso
  console.log('--- Test 21: Telegram-originated initial prompt (say:text) suppressed ---');
  const tgInitialText = 'Avvia un nuovo task di analisi';
  bridge.trackTelegramPrompt(tgInitialText);
  const beforeTgInitial = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-tg-init-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'text',
      text: tgInitialText
    }
  });
  if (sentMessages.length === beforeTgInitial) {
    console.log('Test 21 PASSED: Telegram-originated initial say:text prompt suppressed');
  } else {
    console.error('Test 21 FAILED: Telegram initial prompt echoed back:', sentMessages.slice(beforeTgInitial));
    process.exit(1);
  }

  // Test 22: Problema 3 - ask:followup con streaming partial:true -> partial:false inviato una sola volta
  console.log('--- Test 22: Streaming followup (partial:true then partial:false) sent once ---');
  const beforeFollowupStream = sentMessages.length;

  await bridge.handleZooEvent({
    taskId: 'task-followup-stream-001',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'followup',
      partial: true,
      text: 'La directory di lavoro...'
    }
  });

  const followupStreamJson = JSON.stringify({
    question: 'Quale modalità preferisci per procedere?',
    suggest: [
      { answer: 'Modalità Code', mode: 'code' },
      { answer: 'Modalità Ask', mode: 'ask' }
    ]
  });

  await bridge.handleZooEvent({
    taskId: 'task-followup-stream-001',
    action: 'updated',
    message: {
      type: 'ask',
      ask: 'followup',
      partial: false,
      text: followupStreamJson
    }
  });

  const followupStreamMsgs = sentMessages.slice(beforeFollowupStream);
  const followupStreamMsg = followupStreamMsgs[0];
  if (
    followupStreamMsgs.length === 1 &&
    followupStreamMsg.text.includes('Quale modalità preferisci per procedere?') &&
    followupStreamMsg.extra.reply_markup?.inline_keyboard?.length === 2
  ) {
    console.log('Test 22 PASSED: Streaming followup forwarded exactly once with inline buttons');
  } else {
    console.error('Test 22 FAILED: Streaming followup relay mismatch:', followupStreamMsgs);
    process.exit(1);
  }

  // Test 23: Problema 2 - auto-approval con chiave deterministica (senza messageId/ts)
  console.log('--- Test 23: Auto-approved tool without messageId/ts never prompts ---');
  const beforeAutoNoId = sentMessages.length;
  await bridge.handleZooEvent({
    taskId: 'task-auto-noid-001',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'execute_command',
      text: 'podman ps'
    }
  });
  await bridge.handleZooEvent({
    taskId: 'task-auto-noid-001',
    action: 'updated',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'execute_command',
      text: 'podman ps',
      isAnswered: true,
      autoApprovalDecision: 'approve'
    }
  });
  await sleep(600);

  if (sentMessages.length === beforeAutoNoId) {
    console.log('Test 23 PASSED: Auto-approved tool without messageId/ts did not send a prompt');
  } else {
    console.error('Test 23 FAILED: Auto-approved tool still sent a prompt:', sentMessages.slice(beforeAutoNoId));
    process.exit(1);
  }

  // Test 24: Problema 2 - auto-approval tardiva ritira la tastiera del messaggio già inviato
  console.log('--- Test 24: Late auto-approval retracts already-sent approval buttons ---');
  const beforeLateAuto = sentMessages.length;
  const editCallsBefore = editMarkupCalls.length;

  await bridge.handleZooEvent({
    taskId: 'task-late-auto-001',
    action: 'created',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'write_to_file',
      text: 'Scrivi il file di configurazione'
    }
  });

  // Let the debounce fire so the approval prompt is sent before the auto-approval decision.
  await sleep(600);

  const lateAutoPrompt = sentMessages[sentMessages.length - 1];
  if (!(sentMessages.length === beforeLateAuto + 1 && lateAutoPrompt.extra.reply_markup)) {
    console.error('Test 24 FAILED: Expected an approval prompt before late auto-approval', sentMessages.slice(beforeLateAuto));
    process.exit(1);
  }

  await bridge.handleZooEvent({
    taskId: 'task-late-auto-001',
    action: 'updated',
    message: {
      type: 'ask',
      ask: 'tool',
      tool: 'write_to_file',
      text: 'Scrivi il file di configurazione',
      isAnswered: true,
      autoApprovalDecision: 'approve'
    }
  });

  const lateAutoEditCalls = editMarkupCalls.slice(editCallsBefore);
  if (
    lateAutoEditCalls.length === 1 &&
    Array.isArray(lateAutoEditCalls[0].markup?.inline_keyboard) &&
    lateAutoEditCalls[0].markup.inline_keyboard.length === 0
  ) {
    console.log('Test 24 PASSED: Late auto-approval retracted the approval buttons');
  } else {
    console.error('Test 24 FAILED: Expected one retraction edit call', lateAutoEditCalls);
    process.exit(1);
  }

  // Test 25: Problema 1 - streaming completion_result (partial:true seguito da
  // partial:false) per subtask e task principale con lo stesso testo. Entrambi i
  // completamenti devono essere recapitati su Telegram in modo indipendente,
  // mentre i frammenti partial devono essere ignorati.
  console.log('--- Test 25: Streaming completion_result for subtask and main task ---');
  const beforeStreamingCompletion = sentMessages.length;
  bridge.handleTaskDelegated('main-stream-001', 'subtask-stream-001');

  await bridge.handleZooEvent({
    taskId: 'subtask-stream-001',
    action: 'updated',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Completamento condiviso tra subtask e main.',
      partial: true
    }
  });
  await bridge.handleZooEvent({
    taskId: 'subtask-stream-001',
    action: 'updated',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Completamento condiviso tra subtask e main.',
      partial: false
    }
  });
  await bridge.handleZooEvent({
    taskId: 'main-stream-001',
    action: 'updated',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Completamento condiviso tra subtask e main.',
      partial: true
    }
  });
  await bridge.handleZooEvent({
    taskId: 'main-stream-001',
    action: 'updated',
    message: {
      type: 'say',
      say: 'completion_result',
      text: 'Completamento condiviso tra subtask e main.',
      partial: false
    }
  });

  const streamingCompletionMsgs = sentMessages.slice(beforeStreamingCompletion);
  const sharedCompletionCount = streamingCompletionMsgs.filter(
    (m) => m.text.includes('Completamento condiviso tra subtask e main.')
  ).length;

  if (streamingCompletionMsgs.length === 2 && sharedCompletionCount === 2) {
    console.log('Test 25 PASSED: both subtask and main task completions forwarded, partial fragments ignored');
  } else {
    console.error('Test 25 FAILED', {
      expectedMessages: 2,
      actualMessages: streamingCompletionMsgs.length,
      sharedCompletionCount
    });
    process.exit(1);
  }

  // Test 26: Problema 2 - creazione subtask. Deve essere inviata la sola
  // notifica "Subtask Avviato" e nessun falso messaggio "Utente (UI)".
  console.log('--- Test 26: Subtask creation (only "Subtask Avviato", no fake Utente (UI)) ---');
  const beforeSubtaskCreation = sentMessages.length;
  bridge.handleTaskDelegated('task-main-sub-001', 'task-child-sub-001');

  await bridge.handleZooEvent({
    taskId: 'task-child-sub-001',
    action: 'created',
    message: {
      type: 'say',
      say: 'text',
      text: 'Contesto: Lo spazio di lavoro...'
    }
  });
  await bridge.handleZooEvent({
    taskId: 'task-main-sub-001',
    action: 'created',
    message: {
      type: 'tool',
      tool: 'new_task',
      mode: 'architect',
      message: 'Contesto: Lo spazio di lavoro...'
    }
  });

  const subtaskCreationMsgs = sentMessages.slice(beforeSubtaskCreation);
  const hasStartedNotification = subtaskCreationMsgs.some(
    (m) => m.text.startsWith('🚀 *Subtask Avviato')
  );
  const hasFakeUiPrompt = subtaskCreationMsgs.some(
    (m) => m.text.startsWith('👤 *Utente (UI):*')
  );

  if (subtaskCreationMsgs.length === 1 && hasStartedNotification && !hasFakeUiPrompt) {
    console.log('Test 26 PASSED: only the Subtask Started notification was sent, no fake Utente (UI) prompt');
  } else {
    console.error('Test 26 FAILED', {
      expectedMessages: 1,
      actualMessages: subtaskCreationMsgs.length,
      hasStartedNotification,
      hasFakeUiPrompt
    });
    process.exit(1);
  }

  // Test 27: Status Bar "Disabled" e blocco di attivazione in assenza di variabili d'ambiente
  console.log('--- Test 27: Status Bar Disabled and activation guard when env vars missing ---');
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevUser = process.env.TELEGRAM_ALLOWED_USER_ID;

  // 27a: Entrambe le variabili mancanti
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_ALLOWED_USER_ID;
  warningMessages.length = 0;

  const noEnvBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
  noEnvBridge.init();

  if (
    noEnvBridge.state === 'DISABLED' &&
    noEnvBridge.statusBarItem.text === '$(circle-slash) Telegram: Disabled' &&
    noEnvBridge.statusBarItem.tooltip.includes('TELEGRAM_BOT_TOKEN')
  ) {
    console.log('Test 27a PASSED: Status Bar initialized to Disabled with descriptive tooltip');
  } else {
    console.error('Test 27a FAILED: Status Bar state or text mismatch without env vars', {
      state: noEnvBridge.state,
      text: noEnvBridge.statusBarItem?.text,
      tooltip: noEnvBridge.statusBarItem?.tooltip
    });
    process.exit(1);
  }

  // 27b: start() bloccato e warning mostrato
  await noEnvBridge.start();
  if (noEnvBridge.state === 'DISABLED' && warningMessages.length === 1) {
    console.log('Test 27b PASSED: start() blocked and warning message emitted');
  } else {
    console.error('Test 27b FAILED: start() was not properly blocked', {
      state: noEnvBridge.state,
      warningCount: warningMessages.length,
      warningMessages
    });
    process.exit(1);
  }

  // 27c: toggle() bloccato e warning mostrato
  warningMessages.length = 0;
  await noEnvBridge.toggle();
  if (noEnvBridge.state === 'DISABLED' && warningMessages.length === 1) {
    console.log('Test 27c PASSED: toggle() blocked and warning message emitted');
  } else {
    console.error('Test 27c FAILED: toggle() was not properly blocked', {
      state: noEnvBridge.state,
      warningCount: warningMessages.length
    });
    process.exit(1);
  }

  // 27d: Solo una variabile presente -> ancora Disabled
  process.env.TELEGRAM_BOT_TOKEN = 'test_token_only';
  delete process.env.TELEGRAM_ALLOWED_USER_ID;
  warningMessages.length = 0;
  await noEnvBridge.start();
  if (noEnvBridge.state === 'DISABLED' && warningMessages.length === 1) {
    console.log('Test 27d PASSED: partial credentials still block activation');
  } else {
    console.error('Test 27d FAILED: partial credentials did not block activation', {
      state: noEnvBridge.state,
      warningCount: warningMessages.length
    });
    process.exit(1);
  }

  // Ripristina credenziali
  process.env.TELEGRAM_BOT_TOKEN = prevToken || '123456:TEST_TOKEN';
  process.env.TELEGRAM_ALLOWED_USER_ID = prevUser || '999888777';

  // Inizializzazione con credenziali presenti -> INACTIVE
  const validBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
  validBridge.init();
  if (validBridge.state === 'INACTIVE' && validBridge.statusBarItem.text === '$(radio-tower) Telegram: Inactive') {
    console.log('Test 27e PASSED: Valid env variables initialize Status Bar as Inactive');
  } else {
    console.error('Test 27e FAILED: With valid env vars, state was not INACTIVE', {
      state: validBridge.state,
      text: validBridge.statusBarItem?.text
    });
    process.exit(1);
  }

  // Test 28: Risposta comando /status con Zoo Code in esecuzione (task/subtask) vs idle
  console.log('--- Test 28: /status execution state tracking (task, subtask, idle, i18n) ---');
  const statusTestBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
  statusTestBridge.init();
  statusTestBridge.allowedUserId = '999888777';
  statusTestBridge.state = 'ACTIVE';
  statusTestBridge.telegramClient = bridge.telegramClient;

  // 28a: Idle in italiano
  process.env.AI_LANG = 'it';
  statusTestBridge.isExecuting = false;
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const idleItMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (idleItMsg.includes('• *Attività:* 💤 In attesa (Idle)')) {
    console.log('Test 28a PASSED: /status shows localized Idle state in Italian');
  } else {
    console.error('Test 28a FAILED: expected Italian idle status in /status', idleItMsg);
    process.exit(1);
  }

  // 28b: Idle in inglese
  process.env.AI_LANG = 'en';
  statusTestBridge.isExecuting = false;
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const idleEnMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (idleEnMsg.includes('• *Activity:* 💤 Idle')) {
    console.log('Test 28b PASSED: /status shows localized Idle state in English');
  } else {
    console.error('Test 28b FAILED: expected English idle status in /status', idleEnMsg);
    process.exit(1);
  }

  // 28c: Task in corso (Orchestrator) in italiano
  process.env.AI_LANG = 'it';
  statusTestBridge.isExecuting = true;
  statusTestBridge.isCurrentSubtask = false;
  statusTestBridge.currentTaskMode = 'orchestrator';
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const taskItMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (taskItMsg.includes('• *Attività:* 🔄 In corso (Task: Orchestrator)')) {
    console.log('Test 28c PASSED: /status shows Task in corso in Italian');
  } else {
    console.error('Test 28c FAILED: expected Task in corso in Italian', taskItMsg);
    process.exit(1);
  }

  // 28d: Task in corso (Orchestrator) in inglese
  process.env.AI_LANG = 'en';
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const taskEnMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (taskEnMsg.includes('• *Activity:* 🔄 In progress (Task: Orchestrator)')) {
    console.log('Test 28d PASSED: /status shows Task in progress in English');
  } else {
    console.error('Test 28d FAILED: expected Task in progress in English', taskEnMsg);
    process.exit(1);
  }

  // 28e: Subtask in corso (Code) in italiano
  process.env.AI_LANG = 'it';
  statusTestBridge.isExecuting = true;
  statusTestBridge.isCurrentSubtask = true;
  statusTestBridge.currentTaskMode = 'code';
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const subtaskItMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (subtaskItMsg.includes('• *Attività:* 🔄 In corso (Subtask: Code)')) {
    console.log('Test 28e PASSED: /status shows Subtask in corso in Italian');
  } else {
    console.error('Test 28e FAILED: expected Subtask in corso in Italian', subtaskItMsg);
    process.exit(1);
  }

  // 28f: Subtask in corso (Code) in inglese
  process.env.AI_LANG = 'en';
  sentMessages.length = 0;
  await statusTestBridge.replyStatus('999888777');
  const subtaskEnMsg = sentMessages[sentMessages.length - 1]?.text || '';
  if (subtaskEnMsg.includes('• *Activity:* 🔄 In progress (Subtask: Code)')) {
    console.log('Test 28f PASSED: /status shows Subtask in progress in English');
  } else {
    console.error('Test 28f FAILED: expected Subtask in progress in English', subtaskEnMsg);
    process.exit(1);
  }

  // 28g: Event transitions: subtask completion -> parent task continues, root completion -> idle
  process.env.AI_LANG = 'it';
  statusTestBridge.rootTaskId = 'root-status-1';
  statusTestBridge.taskHierarchy.set('root-status-1', { isSubtask: false, mode: 'orchestrator' });
  statusTestBridge.taskHierarchy.set('sub-status-1', { isSubtask: true, mode: 'code', parentTaskId: 'root-status-1' });
  statusTestBridge.isExecuting = true;
  statusTestBridge.isCurrentSubtask = true;
  statusTestBridge.currentTaskMode = 'code';

  // Subtask completes
  await statusTestBridge.handleZooEvent({
    taskId: 'sub-status-1',
    action: 'created',
    message: { type: 'say', say: 'completion_result', text: 'Subtask finished successfully' }
  });
  if (
    statusTestBridge.isExecuting === true &&
    statusTestBridge.isCurrentSubtask === false &&
    statusTestBridge.currentTaskMode === 'orchestrator'
  ) {
    console.log('Test 28g-1 PASSED: Subtask completion returned state to active root task (Orchestrator)');
  } else {
    console.error('Test 28g-1 FAILED: state mismatch after subtask completion', {
      isExecuting: statusTestBridge.isExecuting,
      isCurrentSubtask: statusTestBridge.isCurrentSubtask,
      currentTaskMode: statusTestBridge.currentTaskMode
    });
    process.exit(1);
  }

  // Root task completes
  await statusTestBridge.handleZooEvent({
    taskId: 'root-status-1',
    action: 'created',
    message: { type: 'say', say: 'completion_result', text: 'Overall task completed' }
  });
  if (statusTestBridge.isExecuting === false && statusTestBridge.isCurrentSubtask === false) {
    console.log('Test 28g-2 PASSED: Root task completion set state to Idle');
  } else {
    console.error('Test 28g-2 FAILED: state mismatch after root task completion', {
      isExecuting: statusTestBridge.isExecuting,
      isCurrentSubtask: statusTestBridge.isCurrentSubtask
    });
    process.exit(1);
  }

  // 28h: Ask followup question sets state to idle (waiting for user)
  await statusTestBridge.handleZooEvent({
    taskId: 'ask-task-1',
    action: 'created',
    message: { type: 'say', text: 'Working...' }
  });
  if (statusTestBridge.isExecuting !== true) {
    console.error('Test 28h setup FAILED: expected isExecuting true after active say');
    process.exit(1);
  }

  await statusTestBridge.handleZooEvent({
    taskId: 'ask-task-1',
    action: 'updated',
    message: {
      type: 'ask',
      ask: 'followup',
      partial: false,
      text: JSON.stringify({ question: 'Procedere con il build?', suggest: [{ answer: 'Sì' }] })
    }
  });

  if (statusTestBridge.isExecuting === false) {
    console.log('Test 28h PASSED: Ask followup question transitioned agent to Idle (waiting for user input)');
  } else {
    console.error('Test 28h FAILED: Ask followup did not transition to Idle', {
      isExecuting: statusTestBridge.isExecuting
    });
    process.exit(1);
  }

  console.log('\nALL 28 BASELINE SIMULATION TESTS PASSED SUCCESSFULLY!');

  // --- Test 29: Scansione Progetti e Caricamento Task Zoo Code ---
  console.log('\n--- Test 29: Scansione Progetti e Caricamento Task Zoo Code ---');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const testWorkdirsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-test-workdirs-'));
  const testTasksRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-test-tasks-'));
  let scannedProjects = [];

  try {
    // 29a: Creazione progetti e cartelle escluse
    const projAlpha = path.join(testWorkdirsRoot, 'proj-alpha');
    const projBeta = path.join(testWorkdirsRoot, 'proj-beta');
    const ignoredModules = path.join(testWorkdirsRoot, 'node_modules');
    const hiddenDir = path.join(testWorkdirsRoot, '.hidden-dir');
    const regularFile = path.join(testWorkdirsRoot, 'ignore_me.txt');

    fs.mkdirSync(projAlpha, { recursive: true });
    fs.mkdirSync(projBeta, { recursive: true });
    fs.mkdirSync(ignoredModules, { recursive: true });
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(regularFile, 'not a directory');

    scannedProjects = bridgeExt.scanProjects(testWorkdirsRoot);
    if (scannedProjects.length === 2 && scannedProjects[0].name === 'proj-alpha' && scannedProjects[1].name === 'proj-beta') {
      console.log('Test 29a PASSED: scanProjects correctly filtered directories and excluded ignored folders');
    } else {
      console.error('Test 29a FAILED: unexpected scanProjects result:', scannedProjects);
      process.exit(1);
    }

    // 29b: Creazione task Zoo Code
    // Task 1 per proj-alpha (più vecchio)
    const task1Dir = path.join(testTasksRoot, 'task-001');
    fs.mkdirSync(task1Dir, { recursive: true });
    fs.writeFileSync(
      path.join(task1Dir, 'history_item.json'),
      JSON.stringify({
        id: 'task-001',
        ts: 1700000001000,
        task: 'Primo prompt utente per alpha',
        workspace: projAlpha
      })
    );

    // Task 2 per proj-alpha (più recente)
    const task2Dir = path.join(testTasksRoot, 'task-002');
    fs.mkdirSync(task2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(task2Dir, 'history_item.json'),
      JSON.stringify({
        id: 'task-002',
        ts: 1700000002000,
        task: 'Secondo prompt utente per alpha',
        workspace: projAlpha
      })
    );

    // Task 3: subtask di task-002 per proj-alpha (deve essere ESCLUSO perché ha parentTaskId)
    const task3Dir = path.join(testTasksRoot, 'task-003');
    fs.mkdirSync(task3Dir, { recursive: true });
    fs.writeFileSync(
      path.join(task3Dir, 'history_item.json'),
      JSON.stringify({
        id: 'task-003',
        ts: 1700000003000,
        task: 'Subtask di delega interna',
        workspace: projAlpha,
        parentTaskId: 'task-002'
      })
    );

    // Task 4: per proj-beta (deve essere ESCLUSO quando si interroga proj-alpha)
    const task4Dir = path.join(testTasksRoot, 'task-004');
    fs.mkdirSync(task4Dir, { recursive: true });
    fs.writeFileSync(
      path.join(task4Dir, 'history_item.json'),
      JSON.stringify({
        id: 'task-004',
        ts: 1700000004000,
        task: 'Prompt per beta',
        workspace: projBeta
      })
    );

    const alphaTasks = await bridgeExt.getZooTasksForProject(projAlpha, testTasksRoot);
    if (
      alphaTasks.length === 2 &&
      alphaTasks[0].id === 'task-002' &&
      alphaTasks[1].id === 'task-001'
    ) {
      console.log('Test 29b PASSED: getZooTasksForProject correctly retrieved and sorted user tasks, filtering subtasks');
    } else {
      console.error('Test 29b FAILED: unexpected tasks result:', alphaTasks);
      process.exit(1);
    }
  } finally {
    try { fs.rmSync(testWorkdirsRoot, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(testTasksRoot, { recursive: true, force: true }); } catch (e) {}
  }

  // --- Test 30: Generazione markup bottoni /projects e gestione navigazione ---
  console.log('\n--- Test 30: Generazione markup bottoni /projects e gestione navigazione ---');
  const navWorkdirs = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-nav-workdirs-'));
  const navTasks = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-nav-tasks-'));
  const customHandover = path.join(os.tmpdir(), '.vv_test_session_handover');
  process.env.VV_TELEGRAM_HANDOVER_PATH = customHandover;
  let navBridge = null;
  let nextHostBridge = null;

  try {
    const projCurr = path.join(navWorkdirs, 'project-current');
    const projOther = path.join(navWorkdirs, 'project-other');
    fs.mkdirSync(projCurr, { recursive: true });
    fs.mkdirSync(projOther, { recursive: true });

    // Task esistente in project-current
    const tCurrDir = path.join(navTasks, 'task-curr-1');
    fs.mkdirSync(tCurrDir, { recursive: true });
    fs.writeFileSync(
      path.join(tCurrDir, 'history_item.json'),
      JSON.stringify({
        id: 'task-curr-1',
        ts: 1710000000000,
        task: 'Implementazione feature auth',
        workspace: projCurr
      })
    );

    process.env.WORKDIRS_DIR = navWorkdirs;
    process.env.ZOO_TASKS_DIR = navTasks;
    mockVscode.workspace.workspaceFolders = [{
      name: 'project-current',
      uri: { fsPath: projCurr }
    }];

    navBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
    navBridge.telegramClient = {
      sendMessage: (chatId, text, options) => {
        sentMessages.push({ chatId, text, options });
        return Promise.resolve({ ok: true, result: { message_id: 200 } });
      },
      answerCallbackQuery: (cbId, text) => {
        return Promise.resolve({ ok: true });
      },
      editMessageReplyMarkup: (chatId, msgId, replyMarkup) => {
        return Promise.resolve({ ok: true });
      },
      editMessageText: (chatId, msgId, text, options) => {
        sentMessages.push({ chatId, text, options, editedMessageId: msgId });
        return Promise.resolve({ ok: true, result: { message_id: msgId } });
      },
      getMe: () => Promise.resolve({ id: 123456, username: 'test_bot', first_name: 'Test' }),
      getUpdates: (offset, timeout, signal) => new Promise((res) => {
        if (signal) {
          signal.addEventListener('abort', () => res([]));
        }
      })
    };
    navBridge.botInfo = { id: 123456, username: 'test_bot', first_name: 'Test' };
    navBridge.allowedUserId = '999888777';
    navBridge.state = bridgeExt.BridgeState.ACTIVE;

    // 30a: Comando /projects in italiano
    process.env.AI_LANG = 'it';
    sentMessages.length = 0;
    await navBridge.handleMessage({
      text: '/projects',
      from: { id: 999888777 },
      chat: { id: 999888777 }
    });

    const projectsMsg = sentMessages[sentMessages.length - 1];
    const kb = projectsMsg?.options?.reply_markup?.inline_keyboard || [];
    if (
      projectsMsg &&
      projectsMsg.text.includes('Progetto attuale') &&
      projectsMsg.text.includes('project-current') &&
      kb.length === 3 &&
      kb[0][0].text === '📁 project-current' &&
      kb[0][0].callback_data === 'proj:0' &&
      kb[1][0].text === '📁 project-other' &&
      kb[1][0].callback_data === 'proj:1' &&
      kb[2][0].text === '⬅️ Indietro' &&
      kb[2][0].callback_data === 'nav:back'
    ) {
      console.log('Test 30a PASSED: /projects correctly remembered current active project at top');
    } else {
      console.error('Test 30a FAILED: unexpected /projects message:', projectsMsg, kb);
      process.exit(1);
    }

    // 30b: Selezione dello stesso progetto corrente (proj:0) -> mostra chat storiche
    sentMessages.length = 0;
    await navBridge.handleCallbackQuery({
      id: 'cb_p0',
      data: 'proj:0',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });

    const chatsMsg = sentMessages[sentMessages.length - 1];
    const chatKb = chatsMsg?.options?.reply_markup?.inline_keyboard || [];
    if (
      chatsMsg &&
      chatsMsg.text.includes('project-current') &&
      chatKb.length >= 3 &&
      chatKb[0][0].callback_data === 'chat:task-curr-1' &&
      chatKb[1][0].callback_data === 'chat:new' &&
      chatKb[2][0].callback_data === 'nav:back'
    ) {
      console.log('Test 30b PASSED: proj:0 on current workspace immediately displayed chats menu');
    } else {
      console.error('Test 30b FAILED: unexpected chats menu:', chatsMsg, chatKb);
      process.exit(1);
    }

    // 30c: Selezione di una chat esistente (chat:task-curr-1)
    sentMessages.length = 0;
    await navBridge.handleCallbackQuery({
      id: 'cb_c1',
      data: 'chat:task-curr-1',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });

    const selectChatMsg = sentMessages[sentMessages.length - 1]?.text || '';
    if (
      navBridge.rootTaskId === 'task-curr-1' &&
      selectChatMsg.includes('Chat attiva impostata su')
    ) {
      console.log('Test 30c PASSED: existing chat selected and rootTaskId updated');
    } else {
      console.error('Test 30c FAILED: chat selection failed:', selectChatMsg, navBridge.rootTaskId);
      process.exit(1);
    }

    // 30d: Creazione nuova chat (chat:new)
    sentMessages.length = 0;
    await navBridge.handleCallbackQuery({
      id: 'cb_cnew',
      data: 'chat:new',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });

    const newChatMsg = sentMessages[sentMessages.length - 1]?.text || '';
    if (
      navBridge.rootTaskId === null &&
      newChatMsg.includes('Nuova chat avviata')
    ) {
      console.log('Test 30d PASSED: chat:new cleared active task and notified user');
    } else {
      console.error('Test 30d FAILED: chat:new failed:', newChatMsg);
      process.exit(1);
    }

    // 30e: nav:back da livello lista progetti -> chiude/annulla menu
    navBridge.navigationState.set(999888777, { step: 'projects', projects: scannedProjects });
    sentMessages.length = 0;
    await navBridge.handleCallbackQuery({
      id: 'cb_back_root',
      data: 'nav:back',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });

    const cancelMsg = sentMessages[sentMessages.length - 1]?.text || '';
    if (cancelMsg.includes('Operazione annullata') && !navBridge.navigationState.has(999888777)) {
      console.log('Test 30e PASSED: nav:back at projects level cleanly cancelled navigation with "Operazione annullata"');
    } else {
      console.error('Test 30e FAILED: nav:back cancel failed:', cancelMsg);
      process.exit(1);
    }

    // --- Test 31: Handover Effimero di Sessione per Switch Workspace ---
    console.log('\n--- Test 31: Handover Effimero di Sessione per Switch Workspace ---');
    executedCommands.length = 0;
    sentMessages.length = 0;
    bridgeExt.clearSessionHandover();

    // 31a: Selezione di un progetto differente (proj:1 -> project-other)
    await navBridge.handleCallbackQuery({
      id: 'cb_p1',
      data: 'proj:1',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });

    const switchMsg = sentMessages[sentMessages.length - 1]?.text || '';
    const handoverData = bridgeExt.readSessionHandover();
    const openFolderCall = executedCommands.find(c => c.cmd === 'vscode.openFolder');

    if (
      switchMsg.includes('Cambio workspace in corso verso `project-other`') &&
      handoverData &&
      handoverData.data.chatId === 999888777 &&
      handoverData.data.intent === 'show_project_chats' &&
      openFolderCall &&
      openFolderCall.args[0].fsPath === projOther
    ) {
      console.log('Test 31a PASSED: Workspace switch correctly created ephemeral handover and invoked openFolder');
    } else {
      console.error('Test 31a FAILED: switch workspace handover failed:', switchMsg, handoverData, openFolderCall);
      process.exit(1);
    }

    // 31b: Ripristino handover al boot del nuovo host (checkSessionHandover)
    // Simuliamo che il nuovo host si avvii in project-other
    mockVscode.workspace.workspaceFolders = [{
      name: 'project-other',
      uri: { fsPath: projOther }
    }];

    nextHostBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
    nextHostBridge.init();
    nextHostBridge.telegramClient = navBridge.telegramClient;
    nextHostBridge.botInfo = { id: 123456, username: 'test_bot', first_name: 'Test' };
    nextHostBridge.allowedUserId = '999888777';
    nextHostBridge.state = bridgeExt.BridgeState.INACTIVE;

    sentMessages.length = 0;
    const restored = await nextHostBridge.checkSessionHandover();
    const afterHandover = bridgeExt.readSessionHandover();

    if (
      restored === true &&
      nextHostBridge.state === bridgeExt.BridgeState.ACTIVE &&
      afterHandover === null &&
      sentMessages.some(m => m.text.includes('Passaggio al workspace `project-other` completato'))
    ) {
      console.log('Test 31b PASSED: checkSessionHandover consumed handover file, reconnected bridge and notified user');
    } else {
      console.error('Test 31b FAILED: session restore failed:', restored, nextHostBridge.state, afterHandover, sentMessages);
      process.exit(1);
    }

    // 31c: Rollback tramite nav:back su workspace commutato
    executedCommands.length = 0;
    sentMessages.length = 0;
    await nextHostBridge.handleCallbackQuery({
      id: 'cb_rollback',
      data: 'nav:back',
      from: { id: 999888777 },
      message: { message_id: 201, chat: { id: 999888777 } }
    });

    const rollbackCall = executedCommands.find(c => c.cmd === 'vscode.openFolder');
    if (rollbackCall && rollbackCall.args[0].fsPath === projCurr) {
      console.log('Test 31c PASSED: nav:back successfully performed rollback to previous workspace');
    } else {
      console.error('Test 31c FAILED: rollback failed:', rollbackCall);
      process.exit(1);
    }

    // 31d: Verifica scadenza handover (> 60s)
    const expiredHandoverPath = path.join(os.tmpdir(), '.vv_test_expired_handover');
    bridgeExt.saveSessionHandover({
      timestamp: Date.now() - 70000,
      chatId: 999888777,
      intent: 'show_project_chats'
    }, expiredHandoverPath);

    const expiredResult = bridgeExt.readSessionHandover(expiredHandoverPath, 60000);
    if (expiredResult === null && !fs.existsSync(expiredHandoverPath)) {
      console.log('Test 31d PASSED: Expired handover (>60s) correctly ignored and removed');
    } else {
      console.error('Test 31d FAILED: expired handover handling failed:', expiredResult);
      process.exit(1);
    }

    // --- Test 32: Verifica Fix Zoo Code Integration & Anti-Duplicazione ---
    console.log('\n--- Test 32: Verifica Fix Zoo Code Integration & Anti-Duplicazione ---');

    // 32a: Promemoria progetto attivo e annullamento in inglese
    process.env.AI_LANG = 'en';
    sentMessages.length = 0;
    await navBridge.handleMessage({
      text: '/projects',
      from: { id: 999888777 },
      chat: { id: 999888777 }
    });
    const enProjMsg = sentMessages[sentMessages.length - 1];
    if (enProjMsg && enProjMsg.text.includes('Current project:') && enProjMsg.text.includes(navBridge.getWorkspaceName())) {
      console.log('Test 32a PASSED: English /projects includes "Current project:" reminder');
    } else {
      console.error('Test 32a FAILED: expected "Current project:" in English /projects', enProjMsg);
      process.exit(1);
    }

    // Verifica annullamento in inglese
    sentMessages.length = 0;
    await navBridge.handleCallbackQuery({
      id: 'cb_en_back',
      data: 'nav:back',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });
    const enCancelMsg = sentMessages[sentMessages.length - 1]?.text || '';
    if (enCancelMsg.includes('Operation cancelled.')) {
      console.log('Test 32a.2 PASSED: English cancellation says "Operation cancelled."');
    } else {
      console.error('Test 32a.2 FAILED: expected "Operation cancelled."', enCancelMsg);
      process.exit(1);
    }

    // 32b: Deduplicazione callback query
    sentMessages.length = 0;
    const initialProcessedCount = navBridge.processedCallbackIds.size;
    await navBridge.handleCallbackQuery({
      id: 'cb_dedup_test',
      data: 'chat:new',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });
    const messagesAfterFirst = sentMessages.length;
    // Invia di nuovo con lo stesso ID callback query (simulazione ritrasmissione o doppio click)
    await navBridge.handleCallbackQuery({
      id: 'cb_dedup_test',
      data: 'chat:new',
      from: { id: 999888777 },
      message: { message_id: 200, chat: { id: 999888777 } }
    });
    if (sentMessages.length === messagesAfterFirst) {
      console.log('Test 32b PASSED: Duplicate callback query with same id was cleanly ignored without double sending');
    } else {
      console.error('Test 32b FAILED: duplicate callback query produced duplicate message');
      process.exit(1);
    }

    // 32c: Test invokeZooCodeShowTask con resumeTask e showTaskWithId
    let resumeTaskCalledWith = null;
    let sidebarShowTaskCalledWith = null;
    let focusCommandCalled = false;
    let mockZooApi = {
      resumeTask: async (taskId) => {
        resumeTaskCalledWith = taskId;
      },
      sidebarProvider: {
        showTaskWithId: async (taskId) => {
          sidebarShowTaskCalledWith = taskId;
        },
        getCurrentTask: () => null
      }
    };
    mockVscode.extensions.getExtension = (id) => {
      if (id.toLowerCase().includes('zoo')) {
        return {
          isActive: true,
          exports: mockZooApi
        };
      }
      return null;
    };

    const resumeResult = await navBridge.invokeZooCodeShowTask('task-curr-1');
    if (resumeResult && resumeTaskCalledWith === 'task-curr-1') {
      console.log('Test 32c PASSED: invokeZooCodeShowTask invoked api.resumeTask("task-curr-1")');
    } else {
      console.error('Test 32c FAILED: resumeTask not called:', resumeResult, resumeTaskCalledWith);
      process.exit(1);
    }

    // Fallback: se resumeTask non esiste ma c'è sidebarProvider.showTaskWithId
    delete mockZooApi.resumeTask;
    const sidebarResult = await navBridge.invokeZooCodeShowTask('task-curr-1');
    if (sidebarResult && sidebarShowTaskCalledWith === 'task-curr-1') {
      console.log('Test 32c.2 PASSED: fallback invokeZooCodeShowTask invoked api.sidebarProvider.showTaskWithId');
    } else {
      console.error('Test 32c.2 FAILED: sidebarProvider.showTaskWithId not called');
      process.exit(1);
    }

    // 32d: forwardMessageToZooCode prosegue nella chat esistente senza avviare un nuovo task
    let sentMessageCalledWith = null;
    let startNewTaskCalled = false;
    mockZooApi.sendMessage = async (text) => {
      sentMessageCalledWith = text;
    };
    mockZooApi.startNewTask = async (opts) => {
      startNewTaskCalled = true;
    };

    navBridge.rootTaskId = 'task-curr-1';
    sentMessages.length = 0;
    await navBridge.forwardMessageToZooCode('Aggiungi un test unitario', 999888777);

    if (sentMessageCalledWith === 'Aggiungi un test unitario' && !startNewTaskCalled) {
      console.log('Test 32d PASSED: When chat is active, forwardMessageToZooCode uses api.sendMessage and NEVER calls startNewTask');
    } else {
      console.error('Test 32d FAILED: sendMessage not called or startNewTask invoked:', { sentMessageCalledWith, startNewTaskCalled });
      process.exit(1);
    }

    // 32e: forwardMessageToZooCode avvia un nuovo task SOLO se non c'è una chat attiva
    navBridge.rootTaskId = null;
    mockZooApi.sidebarProvider.getCurrentTask = () => null;
    sentMessageCalledWith = null;
    startNewTaskCalled = false;
    let newTaskArg = null;
    mockZooApi.startNewTask = async (opts) => {
      startNewTaskCalled = true;
      newTaskArg = opts;
    };

    sentMessages.length = 0;
    await navBridge.forwardMessageToZooCode('Nuova attività da zero', 999888777);

    if (startNewTaskCalled && (newTaskArg?.text === 'Nuova attività da zero' || newTaskArg === 'Nuova attività da zero')) {
      console.log('Test 32e PASSED: When no chat is active, forwardMessageToZooCode correctly calls api.startNewTask');
    } else {
      console.error('Test 32e FAILED: startNewTask not called when no chat is active');
      process.exit(1);
    }

  } finally {
    if (navBridge) {
      await navBridge.stop(false);
    }
    if (typeof nextHostBridge !== 'undefined' && nextHostBridge) {
      await nextHostBridge.stop(false);
    }
    try { fs.rmSync(navWorkdirs, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(navTasks, { recursive: true, force: true }); } catch (e) {}
    bridgeExt.clearSessionHandover();
  }

  // --- Test 33: Safe /stop confirmation flow ---
  console.log('\n--- Test 33: Safe /stop confirmation flow ---');
  const stopBridge = new bridgeExt.TelegramBridgeController({ subscriptions: [] });
  stopBridge.init();
  stopBridge.allowedUserId = '999888777';
  stopBridge.state = 'ACTIVE';

  const stopSentMessages = [];
  const stopAnsweredCallbacks = [];
  stopBridge.telegramClient = {
    sendMessage: async (chatId, text, extra = {}) => {
      stopSentMessages.push({ chatId, text, extra });
      return { ok: true, result: { message_id: 9999 } };
    },
    answerCallbackQuery: async (id, text) => {
      stopAnsweredCallbacks.push({ id, text });
      return { ok: true };
    },
    editMessageReplyMarkup: async (chatId, msgId, markup) => {
      return { ok: true };
    }
  };

  // 1. Invio comando /stop: non spegne il bot ma invia i bottoni di conferma
  await stopBridge.handleMessage({
    from: { id: 999888777 },
    chat: { id: 999888777 },
    text: '/stop'
  });

  if (stopBridge.state !== 'ACTIVE') {
    console.error('Test 33 FAILED: /stop immediately deactivated bridge before confirmation');
    process.exit(1);
  }

  const promptMsg = stopSentMessages.find(m =>
    m.extra?.reply_markup?.inline_keyboard?.some(row =>
      row.some(btn => btn.callback_data === 'stop:confirm')
    )
  );

  if (!promptMsg) {
    console.error('Test 33 FAILED: /stop did not send confirmation prompt with stop:confirm button', stopSentMessages);
    process.exit(1);
  }

  const buttons = promptMsg.extra.reply_markup.inline_keyboard[0];
  const confirmBtn = buttons.find(b => b.callback_data === 'stop:confirm');
  const cancelBtn = buttons.find(b => b.callback_data === 'stop:cancel');

  if (!confirmBtn || !cancelBtn) {
    console.error('Test 33 FAILED: missing confirm or cancel button in prompt', buttons);
    process.exit(1);
  }
  console.log('Test 33a PASSED: /stop keeps bridge ACTIVE and sends confirmation prompt with inline buttons');

  // 2. Click su stop:cancel: mantiene attivo il bot e mostra il messaggio di annullamento
  stopSentMessages.length = 0;
  await stopBridge.handleCallbackQuery({
    id: 'cb_stop_cancel',
    from: { id: 999888777 },
    message: { chat: { id: 999888777 }, message_id: 9999 },
    data: 'stop:cancel'
  });

  if (stopBridge.state !== 'ACTIVE') {
    console.error('Test 33 FAILED: stop:cancel deactivated bridge');
    process.exit(1);
  }

  const cancelNotice = stopSentMessages.find(m => (m.text && m.text.includes('annullata')) || (m.text && m.text.includes('cancelled')));
  if (!cancelNotice) {
    console.error('Test 33 FAILED: stop:cancel did not send cancellation notice', stopSentMessages);
    process.exit(1);
  }
  console.log('Test 33b PASSED: stop:cancel keeps bridge ACTIVE and sends cancellation message');

  // 3. Click su stop:confirm: arresta il bot
  stopSentMessages.length = 0;
  await stopBridge.handleCallbackQuery({
    id: 'cb_stop_confirm',
    from: { id: 999888777 },
    message: { chat: { id: 999888777 }, message_id: 9999 },
    data: 'stop:confirm'
  });

  if (stopBridge.state !== 'INACTIVE') {
    console.error(`Test 33 FAILED: stop:confirm did not set bridge state to INACTIVE (state=${stopBridge.state})`);
    process.exit(1);
  }
  console.log('Test 33c PASSED: stop:confirm successfully stops the bridge');

  // --- Test 34: 100% i18n Key Parity & Multi-Language Coverage (en, it, es, fr, de) ---
  console.log('\n--- Test 34: 100% i18n key parity and language resolution ---');
  const targetLangs = ['en', 'it', 'es', 'fr', 'de'];
  const refKeys = Object.keys(bridgeExt.MESSAGES.en);
  const dummyParams = {
    workspace: 'test-ws',
    host: 'test-host',
    bot: 'test-bot',
    date: '2026-10-28 17:00:00',
    current: 'current-project',
    project: 'target-project',
    title: 'Test Session',
    profile: 'Code',
    error: 'Test Error',
    toolName: 'execute_command',
    description: 'Execute npm run test',
    text: 'Test message text',
    activityStatus: 'Idle',
    zooStatus: 'Active'
  };

  for (const lang of targetLangs) {
    if (!bridgeExt.MESSAGES[lang]) {
      console.error(`Test 34 FAILED: Language '${lang}' is missing from MESSAGES`);
      process.exit(1);
    }

    const currentKeys = Object.keys(bridgeExt.MESSAGES[lang]);
    const missingKeys = refKeys.filter((k) => !(k in bridgeExt.MESSAGES[lang]));
    const extraKeys = currentKeys.filter((k) => !refKeys.includes(k));

    if (missingKeys.length > 0) {
      console.error(`Test 34 FAILED: Language '${lang}' is missing keys:`, missingKeys);
      process.exit(1);
    }
    if (extraKeys.length > 0) {
      console.error(`Test 34 FAILED: Language '${lang}' has unexpected extra keys:`, extraKeys);
      process.exit(1);
    }

    for (const key of refKeys) {
      const val = bridgeExt.MESSAGES[lang][key];
      if (val === undefined || val === null) {
        console.error(`Test 34 FAILED: Key '${key}' in '${lang}' is undefined or null`);
        process.exit(1);
      }
      if (typeof val === 'function') {
        const rendered = val(dummyParams);
        if (typeof rendered !== 'string' || rendered.trim().length === 0) {
          console.error(`Test 34 FAILED: Function key '${key}' in '${lang}' rendered empty or non-string output`);
          process.exit(1);
        }
      } else if (typeof val === 'string') {
        if (val.trim().length === 0) {
          console.error(`Test 34 FAILED: String key '${key}' in '${lang}' is empty`);
          process.exit(1);
        }
      } else {
        console.error(`Test 34 FAILED: Key '${key}' in '${lang}' has invalid type: ${typeof val}`);
        process.exit(1);
      }
    }
  }

  // Verify resolveAiLang with comprehensive variations and aliases
  const langTestCases = [
    ['it', 'it'], ['it-IT', 'it'], ['it_IT', 'it'], ['italiano', 'it'], ['italian', 'it'], ['ITALIANO', 'it'],
    ['es', 'es'], ['es-ES', 'es'], ['es-419', 'es'], ['es_MX', 'es'], ['spagnolo', 'es'], ['spanish', 'es'], ['español', 'es'], ['ESPAÑOL', 'es'],
    ['fr', 'fr'], ['fr-FR', 'fr'], ['fr_CA', 'fr'], ['francese', 'fr'], ['french', 'fr'], ['français', 'fr'], ['FRANÇAIS', 'fr'],
    ['de', 'de'], ['de-DE', 'de'], ['de_AT', 'de'], ['tedesco', 'de'], ['german', 'de'], ['deutsch', 'de'], ['DEUTSCH', 'de'],
    ['en', 'en'], ['en-US', 'en'], ['english', 'en'], ['unknown-lang', 'en'], ['', 'en'], [undefined, 'en']
  ];

  for (const [input, expected] of langTestCases) {
    const resolved = bridgeExt.resolveAiLang(input);
    if (resolved !== expected) {
      console.error(`Test 34 FAILED: resolveAiLang('${input}') expected '${expected}', got '${resolved}'`);
      process.exit(1);
    }
  }

  console.log(`Test 34 PASSED: 100% key parity across all 5 languages (${refKeys.length} keys each) and resolveAiLang normalized correctly.`);

  console.log('\n========================================');
  console.log('ALL 34 SIMULATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
})();
