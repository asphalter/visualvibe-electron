/**
 * extensions/vv-telegram-bridge/extension.js
 * VisualVibe Telegram Bridge for Zoo Code
 *
 * Implements a bidirectional bridge between Telegram and the Zoo Code AI agent in VisualVibe.
 * Follows strict Default-Off lifecycle, native Node.js APIs (zero external npm dependencies),
 * robust long-polling with AbortController, inline approval buttons, and graceful shutdown.
 */

const vscode = require('vscode');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

// --- Bridge States ---
const BridgeState = {
  DISABLED: 'DISABLED',
  INACTIVE: 'INACTIVE',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  STOPPING: 'STOPPING',
  ERROR: 'ERROR'
};

// Approval ask events are debounced for this many ms so the final
// non-partial `updated` event (carrying isAnswered/autoApprovalDecision)
// has time to arrive before a Telegram prompt is sent.
const APPROVAL_DEBOUNCE_MS = 400;

// --- i18n Localization Dictionary & Helpers ---
const MESSAGES = {
  en: {
    welcome: (p) => [
      '🚀 *VisualVibe Telegram Bridge Connected*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Workspace:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\` (VisualVibe Electron)`,
      `• *Bot:* @${p.bot}`,
      `• *Date/Time:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      'The bridge is ready to receive commands.',
      'Available commands:',
      '  /projects — Browse projects and manage chats',
      '  /status  — Check workspace and agent status',
      '  /stop    — Deactivate Telegram bridge',
      '  /help    — Show supported commands',
      '',
      'Send any message to start or continue a task with Zoo Code.'
    ].join('\n'),
    disconnected: '⏹️ *VisualVibe Telegram Bridge Disconnected*\nThe bridge was deactivated from VSCodium interface.',
    accessDenied: '⛔ *Access Denied*\nThis Telegram bot is private and only accepts commands from the configured authorized user.',
    unauthorizedCallback: '⛔ Unauthorized',
    stopRequested: '⏹️ Bridge deactivation requested from Telegram.',
    stopConfirmationPrompt: '⚠️ *Warning: confirm shutdown*\n\nStopping the bridge will disable Telegram access. To re-enable it, you will need to access the graphical desktop from the web page and click the status bar icon in VisualVibe Electron.\n\nAre you sure you want to proceed?',
    btnStopProceed: '🛑 Proceed',
    btnStopCancel: '❌ Cancel',
    stopCancelled: '✅ Operation cancelled. The Telegram bridge remains active.',
    help: [
      '📖 *VisualVibe Telegram Bridge Commands*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '• `/projects` — Browse projects and manage chats',
      '• `/status`   — Show workspace, VSCodium, and Zoo Code status',
      '• `/stop`     — Deactivate and disconnect the Telegram bridge',
      '• `/help`     — Show this guide',
      '',
      'All other text messages are forwarded to Zoo Code as instructions or conversation replies.'
    ].join('\n'),
    projectsTitle: (p) => (p && p.project
      ? `📁 *Current project:* \`${p.project}\`\n\nSelect a project to browse chats or switch workspace:`
      : '📁 *Available Projects:*\nSelect a project to browse chats or switch workspace:'),
    noProjectsFound: '⚠️ No project directories found in workspace root.',
    selectChatTitle: (p) => `📁 *Project:* \`${p.project}\`\nSelect a chat to resume or create a new one:`,
    noChatsFound: 'ℹ️ No previous chats found for this project.',
    btnNewChat: '➕ New Chat',
    btnBack: '⬅️ Back',
    btnRollback: '⬅️ Back to Previous Project',
    chatSelected: (p) => `✅ Active chat set to: *"${p.title}"*`,
    newChatCreated: (p) => `✨ New chat started for *${p.project}*`,
    navCancelled: '❌ Operation cancelled.',
    switchingWorkspace: (p) => `🔄 Switching workspace to \`${p.project}\`...\nThe bridge will reconnect shortly.`,
    workspaceSwitched: (p) => `✅ Workspace switched to \`${p.project}\`.`,
    status: (p) => [
      '📊 *VisualVibe Electron & Zoo Code Status*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Workspace:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\``,
      `• *Bridge Status:* \`ACTIVE\``,
      `• *Zoo Code:* ${p.zooStatus}`,
      `• *Activity:* ${p.activityStatus}`,
      `• *Date/Time:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    executionIdle: '💤 Idle',
    executionSubtaskInProgress: (p) => `🔄 In progress (Subtask: ${p.profile})`,
    executionTaskInProgress: (p) => `🔄 In progress (Task: ${p.profile})`,
    zooStatusAvailable: 'Available',
    zooStatusNotInstalled: 'Not installed',
    zooStatusInactive: 'Inactive (will be activated upon first request)',
    zooStatusActive: 'Active and integrated',
    zooStatusError: (p) => `Check error: ${p.error}`,
    noWorkspace: 'No workspace open',
    toolAuthMessage: (p) => [
      '⚠️ *Zoo Code Tool Authorization Request*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `*Action:* \`${p.toolName}\``,
      '',
      p.description,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    toolDefaultName: 'Action / Modification',
    toolDefaultDescription: 'Zoo Code requires authorization to proceed.',
    btnApprove: '✅ Approve',
    btnReject: '❌ Reject',
    btnApprovedByUser: '✅ Approved by user',
    btnRejectedByUser: '❌ Rejected by user',
    approvalSent: 'Approval sent to Zoo Code',
    rejectionSent: 'Rejection sent to Zoo Code',
    taskCompletedPrefix: (p) => (p && p.profile ? `🏁 *Zoo Code — Final Result [Profile: ${p.profile}]*\n\n` : '🏁 *Zoo Code — Final Result:*\n\n'),
    subtaskCompletedPrefix: (p) => `🏁 *Subtask Completed [Profile: ${p.profile}]*\n\n`,
    mainTaskCompletedPrefix: (p) => `🏁 *Zoo Code — Final Result [Profile: ${p.profile}]*\n\n`,
    subtaskStarted: (p) => [
      `🚀 *Subtask Started [Profile: ${p.profile}]*`,
      ...(p.message ? ['━━━━━━━━━━━━━━━━━━━━━━', p.message] : [])
    ].join('\n'),
    taskCompletedDefault: 'Task completed successfully by Zoo Code.',
    followupQuestionPrefix: '❓ *Zoo Code Question:*\n\n',
    followupAnswerSent: 'Option selected and sent to Zoo Code',
    followupSelectedPrefix: '✅ Selected: ',
    zooCodePrefix: (p) => (p && p.profile ? `💬 *Zoo Code [${p.profile}]:*\n` : '💬 *Zoo Code:*\n'),
    userPromptUiPrefix: '👤 *User (UI):*\n\n',
    messageRelayPrefix: '💬 *Zoo Code:*\n',
    taskStarted: '🚀 New task started in Zoo Code.',
    messageForwarded: '📨 Message forwarded to Zoo Code.',
    apiNotice: (p) => `⚠️ *Notice*: Received message: "${p.text}". Zoo Code API interface did not expose sendMessage. Check VSCodium interface.`,
    errorForwarding: (p) => `❌ Error forwarding to Zoo Code: ${p.error}`
  },
  it: {
    welcome: (p) => [
      '🚀 *VisualVibe Telegram Bridge connesso!*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Area di lavoro:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\` (VisualVibe Electron)`,
      `• *Bot:* @${p.bot}`,
      `• *Data/Ora:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      'Il bridge è pronto a ricevere comandi.',
      'Comandi disponibili:',
      '  /projects — Naviga tra i progetti e gestisci le chat',
      '  /status  — Controlla lo stato dell\'area di lavoro e dell\'agente',
      '  /stop    — Disattiva il bridge Telegram',
      '  /help    — Mostra i comandi supportati',
      '',
      'Invia qualsiasi messaggio per iniziare o continuare un\'attività con Zoo Code.'
    ].join('\n'),
    disconnected: '⏹️ *VisualVibe Telegram Bridge disconnesso*\nIl bridge è stato disattivato dall\'interfaccia di VSCodium.',
    accessDenied: '⛔ *Accesso negato*\nQuesto bot Telegram è privato e accetta comandi solo dall\'utente autorizzato configurato.',
    unauthorizedCallback: '⛔ Non autorizzato',
    stopRequested: '⏹️ Richiesta di disattivazione del bridge ricevuta da Telegram.',
    stopConfirmationPrompt: '⚠️ *Attenzione: conferma arresto*\n\nIl comando di arresto disattiverà il bot Telegram. Per riattivarlo sarà necessario accedere all\'interfaccia grafica dalla pagina web e cliccare sull\'icona nella barra di stato di VisualVibe Electron.\n\nSei sicuro di voler procedere?',
    btnStopProceed: '🛑 Procedi',
    btnStopCancel: '❌ Annulla',
    stopCancelled: '✅ Operazione annullata. Il bridge Telegram rimane attivo.',
    help: [
      '📖 *Comandi VisualVibe Telegram Bridge*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '• `/projects` — Naviga tra i progetti e gestisci le chat',
      '• `/status`   — Mostra lo stato dell\'area di lavoro, VSCodium e Zoo Code',
      '• `/stop`     — Disattiva e disconnette il bridge Telegram',
      '• `/help`     — Mostra questa guida',
      '',
      'Tutti gli altri messaggi di testo verranno inoltrati a Zoo Code come istruzioni o risposte di conversazione.'
    ].join('\n'),
    projectsTitle: (p) => (p && p.project
      ? `📁 *Progetto attuale:* \`${p.project}\`\n\nSeleziona un progetto per visualizzare le chat o cambiare workspace:`
      : '📁 *Progetti Disponibili:*\nSeleziona un progetto per visualizzare le chat o cambiare workspace:'),
    noProjectsFound: '⚠️ Nessuna cartella di progetto trovata nella directory radice.',
    selectChatTitle: (p) => `📁 *Progetto:* \`${p.project}\`\nSeleziona una chat da riprendere o creane una nuova:`,
    noChatsFound: 'ℹ️ Nessuna chat precedente trovata per questo progetto.',
    btnNewChat: '➕ Nuova Chat',
    btnBack: '⬅️ Indietro',
    btnRollback: '⬅️ Torna al Progetto Precedente',
    chatSelected: (p) => `✅ Chat attiva impostata su: *"${p.title}"*`,
    newChatCreated: (p) => `✨ Nuova chat avviata per *${p.project}*`,
    navCancelled: '❌ Operazione annullata.',
    switchingWorkspace: (p) => `🔄 Cambio workspace in corso verso \`${p.project}\`...\nIl bridge si ricollegherà a breve.`,
    workspaceSwitched: (p) => `✅ Passaggio al workspace \`${p.project}\` completato.`,
    status: (p) => [
      '📊 *Stato di VisualVibe Electron & Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Area di lavoro:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\``,
      `• *Stato Bridge:* \`ATTIVO\``,
      `• *Zoo Code:* ${p.zooStatus}`,
      `• *Attività:* ${p.activityStatus}`,
      `• *Data/Ora:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    executionIdle: '💤 In attesa (Idle)',
    executionSubtaskInProgress: (p) => `🔄 In corso (Subtask: ${p.profile})`,
    executionTaskInProgress: (p) => `🔄 In corso (Task: ${p.profile})`,
    zooStatusAvailable: 'Disponibile',
    zooStatusNotInstalled: 'Non installato',
    zooStatusInactive: 'Inattivo (verrà attivato alla prima richiesta)',
    zooStatusActive: 'Attivo e integrato',
    zooStatusError: (p) => `Errore verifica: ${p.error}`,
    noWorkspace: 'Nessuna area di lavoro aperta',
    toolAuthMessage: (p) => [
      '⚠️ *Richiesta di autorizzazione tool Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `*Azione:* \`${p.toolName}\``,
      '',
      p.description,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    toolDefaultName: 'Azione / Modifica',
    toolDefaultDescription: 'Zoo Code richiede autorizzazione per procedere.',
    btnApprove: '✅ Approva',
    btnReject: '❌ Rifiuta',
    btnApprovedByUser: '✅ Approvato dall\'utente',
    btnRejectedByUser: '❌ Rifiutato dall\'utente',
    approvalSent: 'Approvazione inviata a Zoo Code',
    rejectionSent: 'Rifiuto inviato a Zoo Code',
    taskCompletedPrefix: (p) => (p && p.profile ? `🏁 *Zoo Code — Risultato Finale [Profilo: ${p.profile}]*\n\n` : '🏁 *Zoo Code — Risultato Finale:*\n\n'),
    subtaskCompletedPrefix: (p) => `🏁 *Subtask Completato [Profilo: ${p.profile}]*\n\n`,
    mainTaskCompletedPrefix: (p) => `🏁 *Zoo Code — Risultato Finale [Profilo: ${p.profile}]*\n\n`,
    subtaskStarted: (p) => [
      `🚀 *Subtask Avviato [Profilo: ${p.profile}]*`,
      ...(p.message ? ['━━━━━━━━━━━━━━━━━━━━━━', p.message] : [])
    ].join('\n'),
    taskCompletedDefault: 'Attività completata con successo da Zoo Code.',
    followupQuestionPrefix: '❓ *Domanda di Zoo Code:*\n\n',
    followupAnswerSent: 'Opzione selezionata e inviata a Zoo Code',
    followupSelectedPrefix: '✅ Selezionato: ',
    zooCodePrefix: (p) => (p && p.profile ? `💬 *Zoo Code [${p.profile}]:*\n` : '💬 *Zoo Code:*\n'),
    userPromptUiPrefix: '👤 *Utente (UI):*\n\n',
    messageRelayPrefix: '💬 *Zoo Code:*\n',
    taskStarted: '🚀 Nuova attività avviata in Zoo Code.',
    messageForwarded: '📨 Messaggio inoltrato a Zoo Code.',
    apiNotice: (p) => `⚠️ *Avviso*: Ricevuto messaggio: "${p.text}". L'interfaccia API di Zoo Code non espone sendMessage. Controlla l'interfaccia di VSCodium.`,
    errorForwarding: (p) => `❌ Errore durante l'inoltro a Zoo Code: ${p.error}`
  },
  es: {
    welcome: (p) => [
      '🚀 *VisualVibe Telegram Bridge Conectado*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Espacio de trabajo:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\` (VisualVibe Electron)`,
      `• *Bot:* @${p.bot}`,
      `• *Fecha/Hora:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      'El puente está listo para recibir comandos.',
      'Comandos disponibles:',
      '  /projects — Explorar proyectos y gestionar chats',
      '  /status  — Verificar estado del espacio de trabajo y agente',
      '  /stop    — Desactivar el puente de Telegram',
      '  /help    — Mostrar comandos compatibles',
      '',
      'Envía cualquier mensaje para iniciar o continuar una tarea con Zoo Code.'
    ].join('\n'),
    disconnected: '⏹️ *VisualVibe Telegram Bridge Desconectado*\nEl puente fue desactivado desde la interfaz de VSCodium.',
    accessDenied: '⛔ *Acceso Denegado*\nEste bot de Telegram es privado y solo acepta comandos del usuario autorizado configurado.',
    unauthorizedCallback: '⛔ No autorizado',
    stopRequested: '⏹️ Desactivación del puente solicitada desde Telegram.',
    stopConfirmationPrompt: '⚠️ *Advertencia: confirmar apagado*\n\nDetener el puente deshabilitará el acceso por Telegram. Para reactivarlo, deberás acceder al escritorio gráfico desde la página web y hacer clic en el icono de la barra de estado de VisualVibe Electron.\n\n¿Estás seguro de que deseas continuar?',
    btnStopProceed: '🛑 Proceder',
    btnStopCancel: '❌ Cancelar',
    stopCancelled: '✅ Operación cancelada. El puente de Telegram permanece activo.',
    help: [
      '📖 *Comandos de VisualVibe Telegram Bridge*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '• `/projects` — Explorar proyectos y gestionar chats',
      '• `/status`   — Mostrar estado del espacio de trabajo, VSCodium y Zoo Code',
      '• `/stop`     — Desactivar y desconectar el puente de Telegram',
      '• `/help`     — Mostrar esta guía',
      '',
      'Todos los demás mensajes de texto se reenvían a Zoo Code como instrucciones o conversación.'
    ].join('\n'),
    projectsTitle: (p) => `📂 *Proyectos VisualVibe*\nEspacio de trabajo actual: \`${p.current}\`\nSelecciona un proyecto a continuación:`,
    noProjectsFound: '⚠️ No se encontraron proyectos en `/home/vvelectron/VisualVibe Workdirs`.',
    selectChatTitle: (p) => `📂 *Proyecto: \`${p.project}\`*\nSelecciona una sesión de chat o crea una nueva:`,
    noChatsFound: '💬 No se encontraron chats existentes para este proyecto.',
    btnNewChat: '➕ Nuevo Chat',
    btnBack: '⬅️ Volver',
    btnRollback: '⬅️ Volver al Proyecto Anterior',
    chatSelected: (p) => `✅ Chat activo configurado en: *"${p.title}"*`,
    newChatCreated: (p) => `✨ Nuevo chat iniciado para *${p.project}*`,
    navCancelled: '❌ Operación cancelada.',
    switchingWorkspace: (p) => `🔄 Cambiando espacio de trabajo a \`${p.project}\`...\nEl puente se reconectará en breve.`,
    workspaceSwitched: (p) => `✅ Espacio de trabajo cambiado a \`${p.project}\`.`,
    status: (p) => [
      '📊 *Estado de VisualVibe Electron & Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Espacio de trabajo:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\``,
      `• *Estado del puente:* \`ACTIVE\``,
      `• *Zoo Code:* ${p.zooStatus}`,
      `• *Actividad:* ${p.activityStatus}`,
      `• *Fecha/Hora:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    executionIdle: '💤 Inactivo',
    executionSubtaskInProgress: (p) => `🔄 En curso (Subtarea: ${p.profile})`,
    executionTaskInProgress: (p) => `🔄 En curso (Tarea: ${p.profile})`,
    zooStatusAvailable: 'Disponible',
    zooStatusNotInstalled: 'No instalado',
    zooStatusInactive: 'Inactivo (se activará con la primera solicitud)',
    zooStatusActive: 'Activo e integrado',
    zooStatusError: (p) => `Error de comprobación: ${p.error}`,
    noWorkspace: 'Ningún espacio de trabajo abierto',
    toolAuthMessage: (p) => [
      '⚠️ *Solicitud de Autorización de Herramienta Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `*Acción:* \`${p.toolName}\``,
      '',
      p.description,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    toolDefaultName: 'Acción / Modificación',
    toolDefaultDescription: 'Zoo Code requiere autorización para continuar.',
    btnApprove: '✅ Aprobar',
    btnReject: '❌ Rechazar',
    btnApprovedByUser: '✅ Aprobado por el usuario',
    btnRejectedByUser: '❌ Rechazado por el usuario',
    approvalSent: 'Autorización enviada a Zoo Code',
    rejectionSent: 'Rechazo enviado a Zoo Code',
    taskCompletedPrefix: (p) => `🏁 *Zoo Code — Resultado Final [Perfil: ${p.profile}]*\n\n`,
    subtaskCompletedPrefix: (p) => `🧩 *Zoo Code — Subtarea Completada [Perfil: ${p.profile}]*\n\n`,
    mainTaskCompletedPrefix: (p) => `🎯 *Zoo Code — Tarea Principal Completada [Perfil: ${p.profile}]*\n\n`,
    subtaskStarted: (p) => `🚀 *Zoo Code — Subtarea Iniciada [Perfil: ${p.profile}]*\n\n${p.text}`,
    taskCompletedDefault: 'Tarea completada.',
    followupQuestionPrefix: '❓ *Pregunta de Zoo Code:*\n\n',
    followupAnswerSent: 'Opción seleccionada y enviada a Zoo Code',
    followupSelectedPrefix: 'Opción seleccionada: ',
    zooCodePrefix: (p) => `🤖 *Zoo Code [${p.profile}]:*\n\n`,
    userPromptUiPrefix: '👤 *Mensaje desde la Interfaz Web:*\n\n',
    messageRelayPrefix: '💬 *Reenvío desde la Interfaz Web:*\n\n',
    taskStarted: '🤖 Tarea iniciada en VisualVibe.',
    messageForwarded: '📨 Mensaje reenviado a Zoo Code.',
    apiNotice: (p) => `⚠️ *Aviso*: Recibido mensaje: "${p.text}". La API de Zoo Code no expone sendMessage. Revisa la interfaz de VSCodium.`,
    errorForwarding: (p) => `❌ Error al reenviar a Zoo Code: ${p.error}`
  },
  fr: {
    welcome: (p) => [
      '🚀 *VisualVibe Telegram Bridge Connecté*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Espace de travail :* \`${p.workspace}\``,
      `• *Hôte :* \`${p.host}\` (VisualVibe Electron)`,
      `• *Bot :* @${p.bot}`,
      `• *Date/Heure :* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      'Le pont est prêt à recevoir des commandes.',
      'Commandes disponibles :',
      '  /projects — Parcourir les projets et gérer les discussions',
      '  /status  — Vérifier l\'état de l\'espace de travail et de l\'agent',
      '  /stop    — Désactiver le pont Telegram',
      '  /help    — Afficher les commandes prises en charge',
      '',
      'Envoyez un message pour démarrer ou continuer une tâche avec Zoo Code.'
    ].join('\n'),
    disconnected: '⏹️ *VisualVibe Telegram Bridge Déconnecté*\nLe pont a été désactivé depuis l\'interface de VSCodium.',
    accessDenied: '⛔ *Accès Refusé*\nCe bot Telegram est privé et n\'accepte que les commandes de l\'utilisateur autorisé configuré.',
    unauthorizedCallback: '⛔ Non autorisé',
    stopRequested: '⏹️ Désactivation du pont demandée depuis Telegram.',
    stopConfirmationPrompt: '⚠️ *Attention : confirmer l\'arrêt*\n\nL\'arrêt du pont désactivera l\'accès via Telegram. Pour le réactiver, vous devrez accéder au bureau graphique depuis la page web et cliquer sur l\'icône de la barre d\'état de VisualVibe Electron.\n\nÊtes-vous sûr de vouloir continuer ?',
    btnStopProceed: '🛑 Continuer',
    btnStopCancel: '❌ Annuler',
    stopCancelled: '✅ Opération annulée. Le pont Telegram reste actif.',
    help: [
      '📖 *Commandes de VisualVibe Telegram Bridge*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '• `/projects` — Parcourir les projets et gérer les discussions',
      '• `/status`   — Afficher l\'état de l\'espace de travail, de VSCodium et de Zoo Code',
      '• `/stop`     — Désactiver et déconnecter le pont Telegram',
      '• `/help`     — Afficher ce guide',
      '',
      'Tous les autres messages texte sont transmis à Zoo Code en tant qu\'instructions ou conversation.'
    ].join('\n'),
    projectsTitle: (p) => `📂 *Projets VisualVibe*\nEspace de travail actuel : \`${p.current}\`\nSélectionnez un projet ci-dessous :`,
    noProjectsFound: '⚠️ Aucun projet trouvé dans `/home/vvelectron/VisualVibe Workdirs`.',
    selectChatTitle: (p) => `📂 *Projet : \`${p.project}\`*\nSélectionnez une session de discussion ou créez-en une nouvelle :`,
    noChatsFound: '💬 Aucune discussion existante trouvée pour ce projet.',
    btnNewChat: '➕ Nouvelle discussion',
    btnBack: '⬅️ Retour',
    btnRollback: '⬅️ Retour au Projet Précédent',
    chatSelected: (p) => `✅ Discussion active définie sur : *"${p.title}"*`,
    newChatCreated: (p) => `✨ Nouvelle discussion démarrée pour *${p.project}*`,
    navCancelled: '❌ Opération annulée.',
    switchingWorkspace: (p) => `🔄 Basculement vers l'espace de travail \`${p.project}\`...\nLe pont se reconnectera sous peu.`,
    workspaceSwitched: (p) => `✅ Espace de travail basculé vers \`${p.project}\`.`,
    status: (p) => [
      '📊 *État de VisualVibe Electron & Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Espace de travail :* \`${p.workspace}\``,
      `• *Hôte :* \`${p.host}\``,
      `• *État du pont :* \`ACTIVE\``,
      `• *Zoo Code :* ${p.zooStatus}`,
      `• *Activité :* ${p.activityStatus}`,
      `• *Date/Heure :* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    executionIdle: '💤 Inactif',
    executionSubtaskInProgress: (p) => `🔄 En cours (Sous-tâche : ${p.profile})`,
    executionTaskInProgress: (p) => `🔄 En cours (Tâche : ${p.profile})`,
    zooStatusAvailable: 'Disponible',
    zooStatusNotInstalled: 'Non installé',
    zooStatusInactive: 'Inactif (sera activé dès la première requête)',
    zooStatusActive: 'Actif et intégré',
    zooStatusError: (p) => `Erreur de vérification : ${p.error}`,
    noWorkspace: 'Aucun espace de travail ouvert',
    toolAuthMessage: (p) => [
      '⚠️ *Demande d\'Autorisation d\'Outil Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `*Action :* \`${p.toolName}\``,
      '',
      p.description,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    toolDefaultName: 'Action / Modification',
    toolDefaultDescription: 'Zoo Code nécessite une autorisation pour continuer.',
    btnApprove: '✅ Approuver',
    btnReject: '❌ Rejeter',
    btnApprovedByUser: '✅ Approuvé par l\'utilisateur',
    btnRejectedByUser: '❌ Rejeté par l\'utilisateur',
    approvalSent: 'Autorisation envoyée à Zoo Code',
    rejectionSent: 'Rejet envoyé à Zoo Code',
    taskCompletedPrefix: (p) => `🏁 *Zoo Code — Résultat Final [Profil : ${p.profile}]*\n\n`,
    subtaskCompletedPrefix: (p) => `🧩 *Zoo Code — Sous-tâche Terminée [Profil : ${p.profile}]*\n\n`,
    mainTaskCompletedPrefix: (p) => `🎯 *Zoo Code — Tâche Principale Terminée [Profil : ${p.profile}]*\n\n`,
    subtaskStarted: (p) => `🚀 *Zoo Code — Sous-tâche Démarrée [Profil : ${p.profile}]*\n\n${p.text}`,
    taskCompletedDefault: 'Tâche terminée.',
    followupQuestionPrefix: '❓ *Question de Zoo Code :*\n\n',
    followupAnswerSent: 'Option sélectionnée et envoyée à Zoo Code',
    followupSelectedPrefix: 'Option sélectionnée : ',
    zooCodePrefix: (p) => `🤖 *Zoo Code [${p.profile}] :*\n\n`,
    userPromptUiPrefix: '👤 *Invite depuis l\'Interface Web :*\n\n',
    messageRelayPrefix: '💬 *Relais depuis l\'Interface Web :*\n\n',
    taskStarted: '🤖 Tâche démarrée sur VisualVibe.',
    messageForwarded: '📨 Message transmis à Zoo Code.',
    apiNotice: (p) => `⚠️ *Avis* : Message reçu : "${p.text}". L'API de Zoo Code n'expose pas sendMessage. Vérifiez l'interface de VSCodium.`,
    errorForwarding: (p) => `❌ Erreur lors de la transmission à Zoo Code : ${p.error}`
  },
  de: {
    welcome: (p) => [
      '🚀 *VisualVibe Telegram Bridge Verbunden*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Workspace:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\` (VisualVibe Electron)`,
      `• *Bot:* @${p.bot}`,
      `• *Datum/Uhrzeit:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      'Die Bridge ist bereit, Befehle zu empfangen.',
      'Verfügbare Befehle:',
      '  /projects — Projekte durchsuchen und Chats verwalten',
      '  /status  — Workspace- und Agentenstatus prüfen',
      '  /stop    — Telegram-Bridge deaktivieren',
      '  /help    — Unterstützte Befehle anzeigen',
      '',
      'Sende eine Nachricht, um eine Aufgabe mit Zoo Code zu starten oder fortzusetzen.'
    ].join('\n'),
    disconnected: '⏹️ *VisualVibe Telegram Bridge Getrennt*\nDie Bridge wurde über die VSCodium-Benutzeroberfläche deaktiviert.',
    accessDenied: '⛔ *Zugriff Verweigert*\nDieser Telegram-Bot ist privat und akzeptiert nur Befehle vom konfigurierten autorisierten Benutzer.',
    unauthorizedCallback: '⛔ Nicht autorisiert',
    stopRequested: '⏹️ Deaktivierung der Bridge über Telegram angefordert.',
    stopConfirmationPrompt: '⚠️ *Warnung: Herunterfahren bestätigen*\n\nDas Anhalten der Bridge deaktiviert den Telegram-Zugriff. Um sie wieder zu aktivieren, müssen Sie über die Webseite auf die grafische Desktop-Oberfläche zugreifen und auf das Statusleisten-Symbol in VisualVibe Electron klicken.\n\nMöchten Sie wirklich fortfahren?',
    btnStopProceed: '🛑 Fortfahren',
    btnStopCancel: '❌ Abbrechen',
    stopCancelled: '✅ Vorgang abgebrochen. Die Telegram-Bridge bleibt aktiv.',
    help: [
      '📖 *Befehle der VisualVibe Telegram Bridge*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '• `/projects` — Projekte durchsuchen und Chats verwalten',
      '• `/status`   — Status von Workspace, VSCodium und Zoo Code anzeigen',
      '• `/stop`     — Telegram-Bridge deaktivieren und trennen',
      '• `/help`     — Diese Anleitung anzeigen',
      '',
      'Alle anderen Textnachrichten werden als Anweisungen oder Gespräch an Zoo Code weitergeleitet.'
    ].join('\n'),
    projectsTitle: (p) => `📂 *VisualVibe-Projekte*\nAktueller Workspace: \`${p.current}\`\nWähle unten ein Projekt aus:`,
    noProjectsFound: '⚠️ Keine Projekte in `/home/vvelectron/VisualVibe Workdirs` gefunden.',
    selectChatTitle: (p) => `📂 *Projekt: \`${p.project}\`*\nWähle eine Chat-Sitzung oder erstelle eine neue:`,
    noChatsFound: '💬 Keine vorhandenen Chats für dieses Projekt gefunden.',
    btnNewChat: '➕ Neuer Chat',
    btnBack: '⬅️ Zurück',
    btnRollback: '⬅️ Zurück zum vorherigen Projekt',
    chatSelected: (p) => `✅ Aktiver Chat festgelegt auf: *"${p.title}"*`,
    newChatCreated: (p) => `✨ Neuer Chat gestartet für *${p.project}*`,
    navCancelled: '❌ Vorgang abgebrochen.',
    switchingWorkspace: (p) => `🔄 Wechsle zu Workspace \`${p.project}\`...\nDie Bridge verbindet sich in Kürze wieder.`,
    workspaceSwitched: (p) => `✅ Workspace gewechselt zu \`${p.project}\`.`,
    status: (p) => [
      '📊 *Status von VisualVibe Electron & Zoo Code*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `• *Workspace:* \`${p.workspace}\``,
      `• *Host:* \`${p.host}\``,
      `• *Bridge-Status:* \`ACTIVE\``,
      `• *Zoo Code:* ${p.zooStatus}`,
      `• *Aktivität:* ${p.activityStatus}`,
      `• *Datum/Uhrzeit:* ${p.date}`,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    executionIdle: '💤 Im Leerlauf',
    executionSubtaskInProgress: (p) => `🔄 In Bearbeitung (Teilaufgabe: ${p.profile})`,
    executionTaskInProgress: (p) => `🔄 In Bearbeitung (Aufgabe: ${p.profile})`,
    zooStatusAvailable: 'Verfügbar',
    zooStatusNotInstalled: 'Nicht installiert',
    zooStatusInactive: 'Inaktiv (wird bei der ersten Anfrage aktiviert)',
    zooStatusActive: 'Aktiv und integriert',
    zooStatusError: (p) => `Prüffehler: ${p.error}`,
    noWorkspace: 'Kein Workspace geöffnet',
    toolAuthMessage: (p) => [
      '⚠️ *Zoo Code Tool-Autorisierungsanfrage*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `*Aktion:* \`${p.toolName}\``,
      '',
      p.description,
      '━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    toolDefaultName: 'Aktion / Änderung',
    toolDefaultDescription: 'Zoo Code benötigt eine Autorisierung, um fortzufahren.',
    btnApprove: '✅ Genehmigen',
    btnReject: '❌ Ablehnen',
    btnApprovedByUser: '✅ Vom Benutzer genehmigt',
    btnRejectedByUser: '❌ Vom Benutzer abgelehnt',
    approvalSent: 'Autorisierung an Zoo Code gesendet',
    rejectionSent: 'Ablehnung an Zoo Code gesendet',
    taskCompletedPrefix: (p) => `🏁 *Zoo Code — Endergebnis [Profil: ${p.profile}]*\n\n`,
    subtaskCompletedPrefix: (p) => `🧩 *Zoo Code — Teilaufgabe Abgeschlossen [Profil: ${p.profile}]*\n\n`,
    mainTaskCompletedPrefix: (p) => `🎯 *Zoo Code — Hauptaufgabe Abgeschlossen [Profil: ${p.profile}]*\n\n`,
    subtaskStarted: (p) => `🚀 *Zoo Code — Teilaufgabe Gestartet [Profil: ${p.profile}]*\n\n${p.text}`,
    taskCompletedDefault: 'Aufgabe abgeschlossen.',
    followupQuestionPrefix: '❓ *Frage von Zoo Code:*\n\n',
    followupAnswerSent: 'Option ausgewählt und an Zoo Code gesendet',
    followupSelectedPrefix: 'Ausgewählte Option: ',
    zooCodePrefix: (p) => `🤖 *Zoo Code [${p.profile}]:*\n\n`,
    userPromptUiPrefix: '👤 *Prompt über Web-Benutzeroberfläche:*\n\n',
    messageRelayPrefix: '💬 *Weiterleitung über Web-Benutzeroberfläche:*\n\n',
    taskStarted: '🤖 Aufgabe auf VisualVibe gestartet.',
    messageForwarded: '📨 Nachricht an Zoo Code weitergeleitet.',
    apiNotice: (p) => `⚠️ *Hinweis*: Nachricht erhalten: "${p.text}". Die Zoo Code-API unterstützt kein sendMessage. Bitte prüfe die VSCodium-Oberfläche.`,
    errorForwarding: (p) => `❌ Fehler bei der Weiterleitung an Zoo Code: ${p.error}`
  }
};

/**
 * Resolves and normalizes language from environment or explicit parameter.
 * Default is 'en'. Normalizes 'it', 'it-IT', 'italiano' to 'it'.
 * @param {string} [envLang] - Optional override language string
 * @returns {string} Normalized 2-letter language code
 */
function resolveAiLang(envLang) {
  const raw = (envLang !== undefined ? envLang : (process.env.AI_LANG || '')).trim().toLowerCase();
  if (!raw) return 'en';
  if (raw.startsWith('it') || raw === 'italiano' || raw === 'italian') {
    return 'it';
  }
  if (raw.startsWith('es') || raw === 'spagnolo' || raw === 'spanish' || raw === 'español') {
    return 'es';
  }
  if (raw.startsWith('fr') || raw === 'francese' || raw === 'french' || raw === 'français') {
    return 'fr';
  }
  if (raw.startsWith('de') || raw === 'tedesco' || raw === 'german' || raw === 'deutsch') {
    return 'de';
  }
  const prefix = raw.split(/[-_]/)[0];
  if (MESSAGES[prefix]) {
    return prefix;
  }
  return 'en';
}

/**
 * Formats a mode slug (e.g. 'code', 'orchestrator', 'architect', 'ask', 'debug')
 * into an elegant profile display string (e.g. 'Code', 'Orchestrator', 'Architect').
 * @param {string} mode - Raw mode identifier
 * @param {string} [defaultProfile='Code'] - Fallback profile display name
 * @returns {string} Formatted profile title
 */
function formatProfileName(mode, defaultProfile = 'Code') {
  if (!mode || typeof mode !== 'string') return defaultProfile;
  const trimmed = mode.trim();
  if (!trimmed) return defaultProfile;
  const knownProfiles = {
    orchestrator: 'Orchestrator',
    code: 'Code',
    architect: 'Architect',
    ask: 'Ask',
    debug: 'Debug',
    test: 'Test',
    review: 'Review'
  };
  const lower = trimmed.toLowerCase();
  if (knownProfiles[lower]) {
    return knownProfiles[lower];
  }
  return trimmed
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Returns localized string or formatted message for key.
 * @param {string} key - Dictionary key
 * @param {object} [params] - Optional interpolation parameters
 * @param {string} [lang] - Optional explicit language code
 * @returns {string} Localized message
 */
function t(key, params = {}, lang = null) {
  const activeLang = lang || resolveAiLang();
  const dict = MESSAGES[activeLang] || MESSAGES.en;
  let val = dict[key];
  if (val === undefined && activeLang !== 'en') {
    val = MESSAGES.en[key];
  }
  if (typeof val === 'function') {
    return val(params);
  }
  if (val !== undefined) {
    return val;
  }
  return key;
}

// --- Project Navigation & Active Session Handover Helpers ---
const SESSION_HANDOVER_PATH = process.env.VV_TELEGRAM_HANDOVER_PATH || '/tmp/.vv_telegram_active_session';

function formatTaskTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${mon} ${hr}:${min}`;
}

function getWorkdirsRoot() {
  const custom = process.env.WORKDIRS_DIR;
  if (custom && fs.existsSync(custom)) {
    return custom;
  }
  const home = process.env.HOME || '/home/vvelectron';
  const candidate = path.join(home, 'VisualVibe Workdirs');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  const current = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
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
  if (!workdirsRoot || !fs.existsSync(workdirsRoot)) {
    return [];
  }
  try {
    const entries = fs.readdirSync(workdirsRoot, { withFileTypes: true });
    let ignoredList = ['tmp', '.git', '.vscode', 'node_modules', '__pycache__', 'VisualVibe Workdirs'];
    const configCandidates = [
      '/opt/visualvibe/config/ignored-dirs.json',
      path.join(__dirname, '..', '..', 'config', 'ignored-dirs.json'),
      path.join(__dirname, 'config', 'ignored-dirs.json')
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
    projects.sort((a, b) => a.name.localeCompare(b.name));
    return projects;
  } catch (err) {
    return [];
  }
}

async function getZooTasksForProject(projectPath, customTasksDir = null) {
  const baseDir = customTasksDir || process.env.ZOO_TASKS_DIR || path.join(
    process.env.HOME || '/home/vvelectron',
    '.config',
    'VSCodium',
    'User',
    'globalStorage',
    'zoocodeorganization.zoo-code',
    'tasks'
  );
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  try {
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    const tasks = [];
    const normalizedProj = projectPath ? path.resolve(projectPath) : '';
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const historyFile = path.join(baseDir, ent.name, 'history_item.json');
      try {
        if (fs.existsSync(historyFile)) {
          const raw = await fs.promises.readFile(historyFile, 'utf8');
          const item = JSON.parse(raw);
          const itemWorkspace = item && item.workspace ? path.resolve(item.workspace) : '';
          // Filtrare per workspace === projectPath e privi di parentTaskId
          if (item && itemWorkspace === normalizedProj && !item.parentTaskId) {
            tasks.push({
              id: item.id || ent.name,
              ts: Number(item.ts) || 0,
              task: item.task || '',
              workspace: item.workspace,
              size: item.size,
              totalCost: item.totalCost,
              tokensIn: item.tokensIn,
              tokensOut: item.tokensOut
            });
          }
        }
      } catch (readErr) {}
    }
    tasks.sort((a, b) => b.ts - a.ts);
    return tasks;
  } catch (err) {
    return [];
  }
}

function saveSessionHandover(sessionData, filePath = SESSION_HANDOVER_PATH) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function readSessionHandover(filePath = SESSION_HANDOVER_PATH, maxAgeMs = 60000) {
  const candidates = [filePath, `${filePath}.json`];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(raw);
        if (data && data.timestamp) {
          const age = Date.now() - Number(data.timestamp);
          if (age < maxAgeMs) {
            return { data, path: p };
          }
        }
        try { fs.unlinkSync(p); } catch (e) {}
      } catch (e) {}
    }
  }
  return null;
}

function clearSessionHandover(filePath = SESSION_HANDOVER_PATH) {
  const candidates = [filePath, `${filePath}.json`];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {}
  }
}

// --- Telegram API Helper (Zero-dependency HTTPS Client) ---
class TelegramClient {
  constructor(token) {
    this.token = token;
  }

  /**
   * Invokes a Telegram Bot API method over HTTPS.
   * @param {string} method - Telegram API method name (e.g. 'getMe', 'sendMessage')
   * @param {object} payload - JSON payload body
   * @param {AbortSignal} [signal] - Optional abort signal for cancellation
   * @returns {Promise<object>} JSON response from Telegram
   */
  async request(method, payload = {}, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        return reject(new Error('Aborted'));
      }

      const bodyData = JSON.stringify(payload);
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData)
        }
      };

      const req = https.request(options, (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawData);
            if (parsed.ok) {
              resolve(parsed.result);
            } else {
              const err = new Error(parsed.description || `Telegram API error: ${parsed.error_code}`);
              err.code = parsed.error_code;
              reject(err);
            }
          } catch (e) {
            reject(new Error(`Failed to parse Telegram API response: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (signal) {
        const onAbort = () => {
          req.destroy(new Error('Aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => {
          signal.removeEventListener('abort', onAbort);
        });
      }

      req.write(bodyData);
      req.end();
    });
  }

  async getMe(signal = null) {
    return this.request('getMe', {}, signal);
  }

  /**
   * Sends a text message, splitting into chunks if text exceeds 4000 characters.
   */
  async sendMessage(chatId, text, options = {}, signal = null) {
    const MAX_CHUNK = 4000;
    if (text.length <= MAX_CHUNK) {
      return this._sendMessageInternal(chatId, text, options, signal);
    }

    // Split text into lines to avoid cutting in the middle of words/sentences
    const lines = text.split('\n');
    let currentChunk = '';
    let lastResult = null;

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > MAX_CHUNK) {
        if (currentChunk.length > 0) {
          lastResult = await this._sendMessageInternal(chatId, currentChunk, {}, signal);
          currentChunk = '';
        }
        // If a single line is itself > MAX_CHUNK, hard-split it
        if (line.length > MAX_CHUNK) {
          for (let i = 0; i < line.length; i += MAX_CHUNK) {
            const slice = line.slice(i, i + MAX_CHUNK);
            lastResult = await this._sendMessageInternal(chatId, slice, {}, signal);
          }
          continue;
        }
      }
      currentChunk = currentChunk ? currentChunk + '\n' + line : line;
    }

    if (currentChunk.length > 0) {
      lastResult = await this._sendMessageInternal(chatId, currentChunk, options, signal);
    }
    return lastResult;
  }

  async _sendMessageInternal(chatId, text, options = {}, signal = null) {
    const payload = {
      chat_id: chatId,
      text: text,
      ...options
    };

    try {
      return await this.request('sendMessage', payload, signal);
    } catch (err) {
      // If Markdown parsing fails, retry with plain text
      if (options.parse_mode && (err.message || '').includes('can\'t parse entities')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.parse_mode;
        return await this.request('sendMessage', fallbackPayload, signal);
      }
      throw err;
    }
  }

  async answerCallbackQuery(callbackQueryId, text = null, showAlert = false, signal = null) {
    const payload = { callback_query_id: callbackQueryId, show_alert: showAlert };
    if (text) payload.text = text;
    return this.request('answerCallbackQuery', payload, signal);
  }

  async editMessageReplyMarkup(chatId, messageId, replyMarkup = null, signal = null) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup || { inline_keyboard: [] }
    };
    return this.request('editMessageReplyMarkup', payload, signal).catch(() => {});
  }

  async editMessageText(chatId, messageId, text, options = {}, signal = null) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: options.parse_mode,
      reply_markup: options.reply_markup
    };
    return this.request('editMessageText', payload, signal);
  }

  async getUpdates(offset = 0, timeout = 25, signal = null) {
    return this.request(
      'getUpdates',
      {
        offset: offset,
        limit: 100,
        timeout: timeout,
        allowed_updates: ['message', 'callback_query']
      },
      signal
    );
  }
}

// --- Main Extension Controller ---
class TelegramBridgeController {
  constructor(context) {
    this.context = context;
    this.state = BridgeState.INACTIVE;
    this.statusBarItem = null;
    this.pollingAbortController = null;
    this.telegramClient = null;
    this.botInfo = null;
    this.lastUpdateId = 0;
    this.outputChannel = vscode.window.createOutputChannel('VisualVibe Telegram Bridge');
    this.zooExtension = null;
    this.zooListenerDisposable = null;
    this.currentPendingAsk = null;
    this.pendingFollowupOptions = new Map();
    this.pendingApprovalTimers = new Map();
    this.latestAskState = new Map();
    this.forwardedApprovalKeys = new Set();
    this.autoApprovedAskKeys = new Set();
    this.approvalSentMessages = new Map();
    this.forwardedFollowupKeys = new Set();
    this.taskModelStarted = new Map();
    this.sentCompletionKeys = new Set();
    this.sentCompletionTasks = new Set();
    this.processedCallbackIds = new Set();

    // Subtask & task hierarchy tracking
    this.taskHierarchy = new Map(); // taskId -> { isSubtask: boolean, mode: string, parentTaskId?: string }
    this.rootTaskId = null;
    this.currentTaskMode = null;
    this.pendingSubtasksByParent = new Map(); // parentTaskId -> { mode, message }
    this.notifiedSubtaskStarts = new Set();
    this.completedTaskIds = new Set();
    this.telegramOriginPrompts = [];

    // Execution state tracking
    this.isExecuting = false;
    this.currentTaskMode = null;
    this.currentSubtaskMode = null;
    this.isCurrentSubtask = false;

    // Project and chat navigation state
    this.cachedProjects = [];
    this.cachedTasks = [];
    this.navigationState = new Map();
  }

  trackTelegramPrompt(text) {
    if (!this.telegramOriginPrompts) {
      this.telegramOriginPrompts = [];
    }
    const normalized = (text || '').trim();
    if (normalized) {
      this.telegramOriginPrompts.push({ text: normalized, ts: Date.now() });
      if (this.telegramOriginPrompts.length > 50) {
        this.telegramOriginPrompts.shift();
      }
    }
  }

  isFromTelegramAndConsume(text) {
    if (!this.telegramOriginPrompts || this.telegramOriginPrompts.length === 0) {
      return false;
    }
    const normalized = (text || '').trim();
    const now = Date.now();
    this.telegramOriginPrompts = this.telegramOriginPrompts.filter(item => (now - item.ts) < 300000);
    const index = this.telegramOriginPrompts.findIndex(item => item.text === normalized);
    if (index !== -1) {
      this.telegramOriginPrompts.splice(index, 1);
      return true;
    }
    return false;
  }

  init() {
    // 1. Create and configure Status Bar Item (Strict Default-Off)
    this.statusBarItem = vscode.window.createStatusBarItem(
      'visualvibe.telegram.statusBar',
      vscode.StatusBarAlignment.Right,
      95
    );
    this.statusBarItem.command = 'visualvibe.telegram.toggle';

    const creds = this.getCredentials();
    if (!creds.botToken || !creds.allowedUserId) {
      this.updateStatusBar(BridgeState.DISABLED);
      this.log('VisualVibe Telegram Bridge initialized (Disabled: missing environment variables TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID).');
    } else {
      this.updateStatusBar(BridgeState.INACTIVE);
      this.log('VisualVibe Telegram Bridge initialized (Default-Off: Inactive).');
    }

    this.statusBarItem.show();
  }

  log(msg) {
    const ts = new Date().toISOString();
    this.outputChannel.appendLine(`[${ts}] ${msg}`);
  }

  updateStatusBar(newState, customTooltip = null) {
    this.state = newState;
    if (!this.statusBarItem) {
      return;
    }
    switch (newState) {
      case BridgeState.DISABLED: {
        const lang = resolveAiLang();
        const defaultTooltip = lang === 'it'
          ? 'VisualVibe Telegram Bridge: Disabilitato (Variabili d\'ambiente TELEGRAM_BOT_TOKEN o TELEGRAM_ALLOWED_USER_ID mancanti nel container)'
          : 'VisualVibe Telegram Bridge: Disabled (Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID environment variables in container)';
        this.statusBarItem.text = '$(circle-slash) Telegram: Disabled';
        this.statusBarItem.tooltip = customTooltip || defaultTooltip;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        break;
      }

      case BridgeState.INACTIVE:
        this.statusBarItem.text = '$(radio-tower) Telegram: Inactive';
        this.statusBarItem.tooltip = customTooltip || 'VisualVibe Telegram Bridge: Inactive (Click to activate)';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        break;

      case BridgeState.STARTING:
        this.statusBarItem.text = '$(sync~spin) Telegram: Connecting...';
        this.statusBarItem.tooltip = customTooltip || 'Verifying credentials and connecting to Telegram...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        break;

      case BridgeState.ACTIVE: {
        const botName = this.botInfo ? `@${this.botInfo.username}` : 'Bot';
        this.statusBarItem.text = '$(radio-tower) Telegram: Active';
        this.statusBarItem.tooltip = customTooltip || `VisualVibe Telegram Bridge: Active (${botName})\nClick to deactivate.`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.color = undefined;
        break;
      }

      case BridgeState.STOPPING:
        this.statusBarItem.text = '$(sync~spin) Telegram: Stopping...';
        this.statusBarItem.tooltip = customTooltip || 'Disconnecting from Telegram...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        break;

      case BridgeState.ERROR:
        this.statusBarItem.text = '$(error) Telegram: Error';
        this.statusBarItem.tooltip = customTooltip || 'Telegram Bridge error (Click to retry)';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.color = undefined;
        break;
    }
  }

  getCredentials() {
    const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const allowedUserId = (process.env.TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').trim();
    return { botToken, allowedUserId };
  }

  hasCredentials() {
    const creds = this.getCredentials();
    return Boolean(creds.botToken && creds.allowedUserId);
  }

  getExecutionStatusString(lang = resolveAiLang()) {
    if (!this.isExecuting) {
      return t('executionIdle', null, lang);
    }
    const mode = this.isCurrentSubtask
      ? (this.currentSubtaskMode || this.currentTaskMode)
      : this.currentTaskMode;
    const profile = formatProfileName(
      mode,
      this.isCurrentSubtask ? 'Code' : 'Orchestrator'
    );
    if (this.isCurrentSubtask) {
      return t('executionSubtaskInProgress', { profile }, lang);
    }
    return t('executionTaskInProgress', { profile }, lang);
  }

  async start(isHandover = false) {
    if (this.state === BridgeState.ACTIVE || this.state === BridgeState.STARTING) {
      this.log('Start requested but bridge is already running or starting.');
      return;
    }

    const creds = this.getCredentials();
    if (!creds.botToken || !creds.allowedUserId) {
      this.updateStatusBar(BridgeState.DISABLED);
      const lang = resolveAiLang();
      const warnMsg = lang === 'it'
        ? 'VisualVibe Telegram Bridge è disabilitato: variabili d\'ambiente TELEGRAM_BOT_TOKEN o TELEGRAM_ALLOWED_USER_ID non configurate nel container.'
        : 'VisualVibe Telegram Bridge is disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID environment variables are missing in the container.';
      vscode.window.showWarningMessage(warnMsg);
      this.log('Start cancelled: environment variables TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID are missing.');
      return;
    }

    this.updateStatusBar(BridgeState.STARTING);
    this.log('Starting VisualVibe Telegram Bridge...');

    if (!this.telegramClient) {
      this.telegramClient = new TelegramClient(creds.botToken);
    }
    this.allowedUserId = creds.allowedUserId;

    // Validate bot token via getMe if not already populated
    try {
      this.pollingAbortController = new AbortController();
      if (!this.botInfo && typeof this.telegramClient.getMe === 'function') {
        const me = await this.telegramClient.getMe(this.pollingAbortController.signal);
        this.botInfo = me;
        this.log(`Telegram Bot verified: @${me.username} (${me.first_name}, ID: ${me.id})`);
      }
    } catch (err) {
      this.log(`Failed to verify Telegram Bot token: ${err.message}`);
      vscode.window.showErrorMessage(`VisualVibe Telegram: Could not connect to Telegram bot: ${err.message}`);
      this.updateStatusBar(BridgeState.ERROR, `Bot verification error: ${err.message}`);
      return;
    }

    // Connect to Zoo Code extension and listen for events
    await this.setupZooCodeIntegration();

    // Send welcome / handshake message to Telegram (skip on session handover)
    if (!isHandover) {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
          ? vscode.workspace.workspaceFolders[0].name
          : t('noWorkspace');
        const hostname = os.hostname();
        const dateLocale = resolveAiLang() === 'it' ? 'it-IT' : 'en-US';
        const nowStr = new Date().toLocaleString(dateLocale, { timeZone: 'Europe/Rome' });

        const welcomeMsg = t('welcome', {
          workspace: workspaceFolder,
          host: hostname,
          bot: this.botInfo.username,
          date: nowStr
        });

        await this.telegramClient.sendMessage(this.allowedUserId, welcomeMsg, { parse_mode: 'Markdown' });
      } catch (sendErr) {
        this.log(`Notice: Could not send handshake message to allowed chat ${this.allowedUserId}: ${sendErr.message}`);
      }
    }

    // Update status to ACTIVE
    this.updateStatusBar(BridgeState.ACTIVE);
    vscode.window.showInformationMessage(`VisualVibe Telegram Bridge active with @${this.botInfo.username}`);

    // Begin Long-Polling Loop
    this.runPollingLoop();
  }

  async stop(sendFarewell = true) {
    if (this.state === BridgeState.INACTIVE || this.state === BridgeState.STOPPING) {
      return;
    }

    this.updateStatusBar(BridgeState.STOPPING);
    this.log('Stopping VisualVibe Telegram Bridge...');

    // Optionally notify Telegram user about disconnect
    if (sendFarewell && this.telegramClient && this.allowedUserId) {
      try {
        await this.telegramClient.sendMessage(
          this.allowedUserId,
          t('disconnected'),
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        this.log(`Could not send farewell message: ${e.message}`);
      }
    }

    // Abort active polling request
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }

    // Dispose Zoo Code listener if attached
    if (this.zooListenerDisposable) {
      try {
        this.zooListenerDisposable.dispose();
      } catch (e) {
        // Ignore dispose error
      }
      this.zooListenerDisposable = null;
    }

    // Clear any pending approval debounce timers
    if (this.pendingApprovalTimers) {
      for (const timer of this.pendingApprovalTimers.values()) {
        clearTimeout(timer);
      }
      this.pendingApprovalTimers.clear();
    }
    if (this.latestAskState) {
      this.latestAskState.clear();
    }
    if (this.forwardedApprovalKeys) {
      this.forwardedApprovalKeys.clear();
    }
    if (this.autoApprovedAskKeys) {
      this.autoApprovedAskKeys.clear();
    }
    if (this.approvalSentMessages) {
      this.approvalSentMessages.clear();
    }
    if (this.forwardedFollowupKeys) {
      this.forwardedFollowupKeys.clear();
    }
    if (this.taskModelStarted) {
      this.taskModelStarted.clear();
    }
    if (this.taskHierarchy) {
      this.taskHierarchy.clear();
    }
    if (this.pendingSubtasksByParent) {
      this.pendingSubtasksByParent.clear();
    }
    if (this.notifiedSubtaskStarts) {
      this.notifiedSubtaskStarts.clear();
    }
    if (this.completedTaskIds) {
      this.completedTaskIds.clear();
    }
    if (this.telegramOriginPrompts) {
      this.telegramOriginPrompts = [];
    }
    if (this.sentCompletionKeys) {
      this.sentCompletionKeys.clear();
    }
    if (this.sentCompletionTasks) {
      this.sentCompletionTasks.clear();
    }
    this.rootTaskId = null;
    this.currentTaskMode = null;
    this.currentSubtaskMode = null;
    this.isExecuting = false;
    this.isCurrentSubtask = false;

    this.telegramClient = null;
    this.botInfo = null;
    this.updateStatusBar(this.hasCredentials() ? BridgeState.INACTIVE : BridgeState.DISABLED);
    this.log('VisualVibe Telegram Bridge stopped cleanly.');
  }

  async toggle() {
    if (!this.hasCredentials()) {
      this.updateStatusBar(BridgeState.DISABLED);
      const lang = resolveAiLang();
      const warnMsg = lang === 'it'
        ? 'VisualVibe Telegram Bridge è disabilitato: variabili d\'ambiente TELEGRAM_BOT_TOKEN o TELEGRAM_ALLOWED_USER_ID non configurate nel container.'
        : 'VisualVibe Telegram Bridge is disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID environment variables are missing in the container.';
      vscode.window.showWarningMessage(warnMsg);
      this.log('Toggle blocked: missing environment variables TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID.');
      return;
    }

    if (this.state === BridgeState.ACTIVE) {
      await this.stop(true);
    } else {
      await this.start();
    }
  }

  showStatus() {
    const stateStr = this.state;
    const botName = this.botInfo ? `@${this.botInfo.username}` : 'N/A';
    const activityStr = this.getExecutionStatusString();
    const msg = `Telegram Bridge Status: ${stateStr}\nBot: ${botName}\nAuthorized chat: ${this.allowedUserId || 'N/A'}\nActivity: ${activityStr}`;
    vscode.window.showInformationMessage(msg);
  }

  async runPollingLoop() {
    const controller = this.pollingAbortController;
    let consecutiveErrors = 0;

    this.log('Long-polling loop started.');
    while (this.state === BridgeState.ACTIVE && controller && !controller.signal.aborted) {
      try {
        const updates = await this.telegramClient.getUpdates(
          this.lastUpdateId + 1,
          25,
          controller.signal
        );

        consecutiveErrors = 0;
        if (Array.isArray(updates)) {
          for (const update of updates) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.handleUpdate(update);
          }
        }
      } catch (err) {
        if (controller.signal.aborted || this.state !== BridgeState.ACTIVE) {
          break; // Clean shutdown requested
        }

        consecutiveErrors++;
        this.log(`Polling error (attempt ${consecutiveErrors}): ${err.message}`);

        // Backoff delay before retrying
        const delay = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 15000);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    this.log('Long-polling loop exited.');
  }

  /**
   * Handles incoming Telegram updates (messages and callback queries).
   */
  async handleUpdate(update) {
    // 1. Handle Inline Button Callback Queries (Approve / Reject)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    // 2. Handle Text Messages
    if (update.message) {
      await this.handleMessage(update.message);
    }
  }

  isAuthorized(senderId, chatId) {
    if (!this.allowedUserId) return false;
    const allowed = this.allowedUserId.toString().split(/[\s,]+/);
    const sId = (senderId || '').toString();
    const cId = (chatId || '').toString();
    return allowed.includes(sId) || allowed.includes(cId);
  }

  async handleCallbackQuery(cb) {
    const senderId = cb.from ? cb.from.id : null;
    const chatId = cb.message && cb.message.chat ? cb.message.chat.id : null;

    if (!this.isAuthorized(senderId, chatId)) {
      this.log(`Unauthorized callback query from sender ${senderId}`);
      await this.telegramClient.answerCallbackQuery(cb.id, t('unauthorizedCallback'), true);
      return;
    }

    if (cb.id) {
      if (this.processedCallbackIds.has(cb.id)) {
        this.log(`Duplicate callback query ignored: ${cb.id}`);
        await this.telegramClient.answerCallbackQuery(cb.id).catch(() => {});
        return;
      }
      this.processedCallbackIds.add(cb.id);
      if (this.processedCallbackIds.size > 200) {
        const oldest = this.processedCallbackIds.values().next().value;
        this.processedCallbackIds.delete(oldest);
      }
    }

    const data = cb.data;
    this.log(`Received callback query: ${data}`);

    try {
      if (data === 'approve') {
        this.isExecuting = true;
        await this.telegramClient.answerCallbackQuery(cb.id, t('approvalSent'));
        await this.handleZooApproval(true);
        if (chatId && cb.message && cb.message.message_id) {
          await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id, {
            inline_keyboard: [[{ text: t('btnApprovedByUser'), callback_data: 'noop' }]]
          });
        }
      } else if (data === 'reject') {
        this.isExecuting = true;
        await this.telegramClient.answerCallbackQuery(cb.id, t('rejectionSent'));
        await this.handleZooApproval(false);
        if (chatId && cb.message && cb.message.message_id) {
          await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id, {
            inline_keyboard: [[{ text: t('btnRejectedByUser'), callback_data: 'noop' }]]
          });
        }
      } else if (typeof data === 'string' && data.startsWith('fo:')) {
        const optionKey = data.substring(3);
        const selectedText = this.pendingFollowupOptions ? this.pendingFollowupOptions.get(optionKey) : null;
        if (selectedText) {
          this.isExecuting = true;
          this.log(`Followup option clicked: key="${optionKey}" text="${selectedText}"`);
          await this.telegramClient.answerCallbackQuery(cb.id, t('followupAnswerSent'));
          await this.forwardMessageToZooCode(selectedText, chatId);
          if (chatId && cb.message && cb.message.message_id) {
            const shortLabel = selectedText.length > 35 ? selectedText.substring(0, 32) + '...' : selectedText;
            await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id, {
              inline_keyboard: [[{ text: `${t('followupSelectedPrefix')}${shortLabel}`, callback_data: 'noop' }]]
            });
          }
          this.pendingFollowupOptions.delete(optionKey);
        } else {
          await this.telegramClient.answerCallbackQuery(cb.id);
        }
      } else if (typeof data === 'string' && data.startsWith('proj:')) {
        const idx = parseInt(data.substring(5), 10);
        const projects = (this.cachedProjects && this.cachedProjects.length > 0)
          ? this.cachedProjects
          : (this.navigationState.get(chatId)?.projects || scanProjects(getWorkdirsRoot()));
        const proj = projects[idx];
        if (!proj) {
          await this.telegramClient.answerCallbackQuery(cb.id, 'Progetto non valido');
          return;
        }
        await this.telegramClient.answerCallbackQuery(cb.id);

        const currentWs = path.resolve(this.getWorkspacePath());
        const targetWs = path.resolve(proj.path);

        if (currentWs === targetWs) {
          await this.showProjectChats(chatId, targetWs, null, null, cb.message?.message_id);
        } else {
          saveSessionHandover({
            timestamp: Date.now(),
            chatId: chatId,
            lastUpdateId: this.lastUpdateId,
            previousWorkspace: currentWs,
            previousTaskId: this.rootTaskId || null,
            targetWorkspace: targetWs,
            intent: 'show_project_chats'
          });

          await this.telegramClient.sendMessage(
            chatId,
            t('switchingWorkspace', { project: proj.name }),
            { parse_mode: 'Markdown' }
          );

          if (chatId && cb.message?.message_id) {
            await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id);
          }

          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(proj.path), false);
        }
      } else if (typeof data === 'string' && data.startsWith('chat:')) {
        const chatParam = data.substring(5);
        await this.telegramClient.answerCallbackQuery(cb.id);

        if (chatParam === 'new') {
          await this.invokeZooCodeClearTask();
          this.rootTaskId = null;
          const wsName = this.getWorkspaceName();
          await this.telegramClient.sendMessage(
            chatId,
            t('newChatCreated', { project: wsName }),
            { parse_mode: 'Markdown' }
          );
          if (chatId && cb.message?.message_id) {
            await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id);
          }
          this.navigationState.delete(chatId);
        } else {
          const taskId = chatParam;
          await this.invokeZooCodeShowTask(taskId);
          this.rootTaskId = taskId;

          let title = taskId;
          const nav = this.navigationState.get(chatId);
          const taskList = (nav && nav.tasks) || this.cachedTasks || [];
          const found = taskList.find((tItem) => tItem.id === taskId);
          if (found && found.task) {
            title = found.task.trim().replace(/[\r\n]+/g, ' ');
            if (title.length > 50) {
              title = title.substring(0, 50) + '…';
            }
          }

          await this.telegramClient.sendMessage(
            chatId,
            t('chatSelected', { title: title }),
            { parse_mode: 'Markdown' }
          );
          if (chatId && cb.message?.message_id) {
            await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id);
          }
          this.navigationState.delete(chatId);
        }
      } else if (data === 'nav:back') {
        await this.telegramClient.answerCallbackQuery(cb.id);
        const nav = this.navigationState.get(chatId);
        if (nav && nav.step === 'chats') {
          if (nav.previousWorkspace && path.resolve(nav.previousWorkspace) !== path.resolve(this.getWorkspacePath())) {
            const prevWs = nav.previousWorkspace;
            const prevTask = nav.previousTaskId;
            saveSessionHandover({
              timestamp: Date.now(),
              chatId: chatId,
              previousWorkspace: this.getWorkspacePath(),
              previousTaskId: this.rootTaskId || null,
              targetWorkspace: prevWs,
              targetTaskId: prevTask,
              intent: 'show_project_chats'
            });

            await this.telegramClient.sendMessage(
              chatId,
              t('switchingWorkspace', { project: path.basename(prevWs) }),
              { parse_mode: 'Markdown' }
            );
            if (chatId && cb.message?.message_id) {
              await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id);
            }
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(prevWs), false);
            return;
          }
          await this.showProjectsList(chatId, cb.message?.message_id);
          return;
        }

        this.navigationState.delete(chatId);
        if (chatId && cb.message?.message_id) {
          await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id);
        }
        await this.telegramClient.sendMessage(chatId, t('navCancelled'));
      } else if (data === 'stop:confirm') {
        await this.telegramClient.answerCallbackQuery(cb.id);
        if (chatId && cb.message?.message_id) {
          await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id).catch(() => {});
        }
        await this.stop();
      } else if (data === 'stop:cancel') {
        await this.telegramClient.answerCallbackQuery(cb.id);
        if (chatId && cb.message?.message_id) {
          await this.telegramClient.editMessageReplyMarkup(chatId, cb.message.message_id).catch(() => {});
        }
        await this.telegramClient.sendMessage(chatId, t('stopCancelled'), { parse_mode: 'Markdown' });
      } else {
        await this.telegramClient.answerCallbackQuery(cb.id);
      }
    } catch (err) {
      this.log(`Error handling callback query: ${err.message}`);
    }
  }

  async handleMessage(msg) {
    const senderId = msg.from ? msg.from.id : null;
    const chatId = msg.chat ? msg.chat.id : null;
    const text = (msg.text || '').trim();

    if (!this.isAuthorized(senderId, chatId)) {
      this.log(`Unauthorized message attempt from ID ${senderId} (chat ${chatId})`);
      if (chatId) {
        try {
          await this.telegramClient.sendMessage(
            chatId,
            t('accessDenied')
          );
        } catch (e) {}
      }
      return;
    }

    if (!text) {
      return;
    }

    // Command handling
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      if (command === '/status') {
        await this.replyStatus(chatId);
        return;
      }

      if (command === '/stop' || command === '/pause') {
        const keyboard = {
          inline_keyboard: [
            [
              { text: t('btnStopProceed'), callback_data: 'stop:confirm' },
              { text: t('btnStopCancel'), callback_data: 'stop:cancel' }
            ]
          ]
        };
        await this.telegramClient.sendMessage(chatId, t('stopConfirmationPrompt'), {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }

      if (command === '/help' || command === '/start') {
        await this.telegramClient.sendMessage(chatId, t('help'), { parse_mode: 'Markdown' });
        return;
      }

      if (command === '/projects' || command === '/project') {
        await this.showProjectsList(chatId);
        return;
      }
    }

    // Forward ordinary text to Zoo Code
    this.log(`Forwarding user message from Telegram to Zoo Code: "${text.substring(0, 60)}..."`);
    await this.forwardMessageToZooCode(text, chatId);
  }

  async replyStatus(chatId) {
    const wsName = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
      ? vscode.workspace.workspaceFolders[0].name
      : t('noWorkspace');
    const dateLocale = resolveAiLang() === 'it' ? 'it-IT' : 'en-US';
    const now = new Date().toLocaleString(dateLocale, { timeZone: 'Europe/Rome' });

    let zooStatus = t('zooStatusAvailable');
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');
      if (!zooExt) {
        zooStatus = t('zooStatusNotInstalled');
      } else if (!zooExt.isActive) {
        zooStatus = t('zooStatusInactive');
      } else {
        zooStatus = t('zooStatusActive');
      }
    } catch (e) {
      zooStatus = t('zooStatusError', { error: e.message });
    }

    const activityStatus = this.getExecutionStatusString();

    const statusMsg = t('status', {
      workspace: wsName,
      host: os.hostname(),
      zooStatus: zooStatus,
      activityStatus: activityStatus,
      date: now
    });

    await this.telegramClient.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
  }

  getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
  }

  getWorkspaceName() {
    const wsPath = this.getWorkspacePath();
    if (wsPath) {
      return path.basename(wsPath);
    }
    return vscode.workspace.workspaceFolders?.[0]?.name || t('noWorkspace');
  }

  async showProjectsList(chatId, editMessageId = null) {
    const root = getWorkdirsRoot();
    const projects = scanProjects(root);
    this.cachedProjects = projects;
    this.navigationState.set(chatId, { step: 'projects', projects });

    if (projects.length === 0) {
      await this.telegramClient.sendMessage(chatId, t('noProjectsFound'));
      return;
    }

    const keyboard = projects.map((p, idx) => [
      { text: `📁 ${p.name}`, callback_data: `proj:${idx}` }
    ]);
    keyboard.push([{ text: t('btnBack'), callback_data: 'nav:back' }]);

    const currentProject = this.getWorkspaceName();
    const titleText = t('projectsTitle', { project: currentProject });

    if (editMessageId && typeof this.telegramClient?.editMessageText === 'function') {
      try {
        await this.telegramClient.editMessageText(chatId, editMessageId, titleText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
        return;
      } catch (editErr) {
        this.log(`Could not edit message ${editMessageId}, falling back to sendMessage: ${editErr.message}`);
      }
    }

    await this.telegramClient.sendMessage(chatId, titleText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async showProjectChats(chatId, projectPath, previousWorkspace = null, previousTaskId = null, editMessageId = null) {
    const tasks = await getZooTasksForProject(projectPath);
    this.cachedTasks = tasks;
    this.navigationState.set(chatId, {
      step: 'chats',
      projectPath,
      previousWorkspace,
      previousTaskId,
      tasks
    });

    const keyboard = [];
    const displayTasks = tasks.slice(0, 10);
    for (const task of displayTasks) {
      const dateStr = formatTaskTimestamp(task.ts);
      let promptText = (task.task || 'Chat').trim().replace(/[\r\n]+/g, ' ');
      if (promptText.length > 25) {
        promptText = promptText.substring(0, 25) + '…';
      }
      const label = dateStr ? `💬 ${dateStr} - ${promptText}` : `💬 ${promptText}`;
      keyboard.push([{ text: label, callback_data: `chat:${task.id}` }]);
    }

    keyboard.push([{ text: t('btnNewChat'), callback_data: 'chat:new' }]);
    const backBtnText = previousWorkspace ? t('btnRollback') : t('btnBack');
    keyboard.push([{ text: backBtnText, callback_data: 'nav:back' }]);

    let msgText = t('selectChatTitle', { project: path.basename(projectPath) });
    if (tasks.length === 0) {
      msgText += `\n\n${t('noChatsFound')}`;
    }

    if (editMessageId && typeof this.telegramClient?.editMessageText === 'function') {
      try {
        await this.telegramClient.editMessageText(chatId, editMessageId, msgText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
        return;
      } catch (editErr) {
        this.log(`Could not edit message ${editMessageId}, falling back to sendMessage: ${editErr.message}`);
      }
    }

    await this.telegramClient.sendMessage(chatId, msgText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async invokeZooCodeShowTask(taskId) {
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');
      if (zooExt && !zooExt.isActive) {
        await zooExt.activate();
      }
      const api = zooExt ? zooExt.exports : null;
      if (!api) {
        this.log('Zoo Code API not available for showTask');
        return false;
      }

      // Focus sidebar view so UI is active and webview launches if needed
      await vscode.commands.executeCommand('zoo-code.SidebarProvider.focus').then(null, () => {});

      // 1. Primary method in Zoo Code 3.92.0 API: api.resumeTask(taskId)
      if (typeof api.resumeTask === 'function') {
        this.log(`Invoking api.resumeTask("${taskId}")`);
        await api.resumeTask(taskId);
        return true;
      }

      // 2. Direct sidebarProvider method: showTaskWithId(taskId)
      if (typeof api.sidebarProvider?.showTaskWithId === 'function') {
        this.log(`Invoking api.sidebarProvider.showTaskWithId("${taskId}")`);
        await api.sidebarProvider.showTaskWithId(taskId);
        return true;
      }

      // 3. Fallbacks
      if (typeof api.showTaskWithId === 'function') {
        this.log(`Invoking api.showTaskWithId("${taskId}")`);
        await api.showTaskWithId(taskId);
        return true;
      }
      if (typeof api.controller?.showTaskWithId === 'function') {
        this.log(`Invoking api.controller.showTaskWithId("${taskId}")`);
        await api.controller.showTaskWithId(taskId);
        return true;
      }

      // 4. Webview notification fallback
      if (typeof api.sidebarProvider?.postMessageToWebview === 'function') {
        await api.sidebarProvider.postMessageToWebview({ type: 'action', action: 'chatButtonClicked' });
      }

      return false;
    } catch (e) {
      this.log(`Error invoking showTaskWithId/resumeTask: ${e.message}`);
      return false;
    }
  }

  async invokeZooCodeClearTask() {
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');
      if (zooExt && !zooExt.isActive) {
        await zooExt.activate();
      }
      const api = zooExt ? zooExt.exports : null;
      if (!api) return false;

      // 1. Primary method in Zoo Code 3.92.0: clearCurrentTask()
      if (typeof api.clearCurrentTask === 'function') {
        await api.clearCurrentTask();
        return true;
      }
      // 2. Direct sidebarProvider clearTask()
      if (typeof api.sidebarProvider?.clearTask === 'function') {
        await api.sidebarProvider.clearTask();
        return true;
      }
      // 3. Fallbacks
      if (typeof api.clearTask === 'function') {
        await api.clearTask();
        return true;
      }
      if (typeof api.controller?.clearTask === 'function') {
        await api.controller.clearTask();
        return true;
      }
      return false;
    } catch (e) {
      this.log(`Error invoking clearTask: ${e.message}`);
      return false;
    }
  }

  async checkSessionHandover() {
    const handover = readSessionHandover();
    if (!handover) {
      return false;
    }
    const { data, path: filePath } = handover;
    this.log(`Found valid active session handover at ${filePath}: ${JSON.stringify(data)}`);
    clearSessionHandover(filePath);

    try {
      if (typeof data.lastUpdateId === 'number') {
        this.lastUpdateId = Math.max(this.lastUpdateId, data.lastUpdateId);
      }
      await this.start(true);
      if (this.state === BridgeState.ACTIVE && data.chatId) {
        const wsName = this.getWorkspaceName();
        await this.telegramClient.sendMessage(
          data.chatId,
          t('workspaceSwitched', { project: wsName }),
          { parse_mode: 'Markdown' }
        );

        if (data.targetTaskId) {
          await this.invokeZooCodeShowTask(data.targetTaskId);
          this.rootTaskId = data.targetTaskId;
        }

        if (data.intent === 'show_project_chats') {
          const wsPath = this.getWorkspacePath();
          await this.showProjectChats(
            data.chatId,
            wsPath,
            data.previousWorkspace || null,
            data.previousTaskId || null
          );
        }
      }
      return true;
    } catch (err) {
      this.log(`Error processing session handover: ${err.message}`);
      return false;
    }
  }

  // --- Zoo Code Integration & Event Relay ---

  async setupZooCodeIntegration() {
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');
      if (!zooExt) {
        this.log('Zoo Code extension not found in VSCodium environment.');
        return;
      }

      if (!zooExt.isActive) {
        this.log('Activating Zoo Code extension...');
        await zooExt.activate();
      }

      const api = zooExt.exports;
      this.zooExtension = zooExt;
      this.log('Zoo Code extension connected.');

      // Check if Zoo Code exports an event emitter or controller
      const targetEmitter = api?.emitter || (typeof api?.on === 'function' ? api : null) ||
                            (typeof api?.controller?.on === 'function' ? api.controller : null) ||
                            (typeof api?.sidebarProvider?.on === 'function' ? api.sidebarProvider : null);

      // Diagnostic logging to validate the real event source & payload shape.
      this.log(`[ZooIntegration] api keys=${api ? Object.keys(api).slice(0, 15).join(',') : 'none'}`);
      this.log(`[ZooIntegration] api.on=${typeof api?.on}, api.emitter=${typeof api?.emitter}, api.sidebarProvider.on=${typeof api?.sidebarProvider?.on}`);
      this.log(`[ZooIntegration] selected targetEmitter.on=${typeof targetEmitter?.on}`);

      if (targetEmitter && typeof targetEmitter.on === 'function') {
        const disposers = [];

        const handler = (event) => {
          try {
            const keys = event && typeof event === 'object' ? Object.keys(event).join(',') : 'n/a';
            this.log(`[ZooIntegration] message event keys=${keys} json=${JSON.stringify(event).slice(0, 600)}`);
          } catch (e) {
            this.log(`[ZooIntegration] message event (non-serializable) type=${typeof event}`);
          }
          this.handleZooEvent(event);
        };
        targetEmitter.on('message', handler);
        disposers.push(() => {
          if (typeof targetEmitter.removeListener === 'function') {
            targetEmitter.removeListener('message', handler);
          } else if (typeof targetEmitter.off === 'function') {
            targetEmitter.off('message', handler);
          }
        });

        const delegatedHandler = (parentTaskId, childTaskId) => {
          this.handleTaskDelegated(parentTaskId, childTaskId);
        };
        targetEmitter.on('taskDelegated', delegatedHandler);
        disposers.push(() => {
          if (typeof targetEmitter.removeListener === 'function') targetEmitter.removeListener('taskDelegated', delegatedHandler);
          else if (typeof targetEmitter.off === 'function') targetEmitter.off('taskDelegated', delegatedHandler);
        });

        const modeHandler = (taskId, mode) => {
          this.handleTaskModeSwitched(taskId, mode);
        };
        targetEmitter.on('taskModeSwitched', modeHandler);
        disposers.push(() => {
          if (typeof targetEmitter.removeListener === 'function') targetEmitter.removeListener('taskModeSwitched', modeHandler);
          else if (typeof targetEmitter.off === 'function') targetEmitter.off('taskModeSwitched', modeHandler);
        });

        const completedHandler = (taskId, result, tokenUsage, meta) => {
          this.handleTaskCompletedMeta(taskId, result, tokenUsage, meta);
        };
        targetEmitter.on('taskCompleted', completedHandler);
        disposers.push(() => {
          if (typeof targetEmitter.removeListener === 'function') targetEmitter.removeListener('taskCompleted', completedHandler);
          else if (typeof targetEmitter.off === 'function') targetEmitter.off('taskCompleted', completedHandler);
        });

        this.zooListenerDisposable = {
          dispose: () => {
            for (const d of disposers) {
              try { d(); } catch (e) {}
            }
          }
        };
        this.log('Registered event listeners on Zoo Code event provider.');
      }
    } catch (err) {
      this.log(`Error during Zoo Code integration setup: ${err.message}`);
    }
  }

  extractNewTaskCall(payload) {
    if (!payload || typeof payload !== 'object') return null;

    if (payload.tool === 'new_task' || payload.tool === 'newTask' || payload.name === 'new_task') {
      return {
        mode: payload.mode || payload.params?.mode || 'code',
        message: payload.message || payload.params?.message || payload.content || '',
        todos: payload.todos || payload.params?.todos
      };
    }

    if (typeof payload.text === 'string') {
      const text = payload.text.trim();
      if (
        text.startsWith('{') &&
        (text.includes('"tool":"newTask"') ||
          text.includes('"tool":"new_task"') ||
          text.includes('"tool": "newTask"') ||
          text.includes('"tool": "new_task"'))
      ) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.tool === 'newTask' || parsed.tool === 'new_task') {
            return {
              mode: parsed.mode || 'code',
              message: parsed.content || parsed.message || '',
              todos: parsed.todos
            };
          }
        } catch (e) {}
      }
    }

    if (payload.nativeArgs && (payload.name === 'new_task' || payload.nativeArgs.mode !== undefined)) {
      return {
        mode: payload.nativeArgs.mode || 'code',
        message: payload.nativeArgs.message || '',
        todos: payload.nativeArgs.todos
      };
    }

    if (payload.params && (payload.name === 'new_task' || payload.params.mode !== undefined)) {
      return {
        mode: payload.params.mode || 'code',
        message: payload.params.message || '',
        todos: payload.params.todos
      };
    }

    return null;
  }

  handleTaskDelegated(parentTaskId, childTaskId) {
    const pending = this.pendingSubtasksByParent.get(parentTaskId) || {};
    const mode = pending.mode || 'code';
    this.taskHierarchy.set(childTaskId, {
      isSubtask: true,
      mode: mode,
      parentTaskId: parentTaskId
    });
    this.isExecuting = true;
    this.isCurrentSubtask = true;
    this.currentSubtaskMode = mode;
    this.log(`[TaskHierarchy] taskDelegated: parent=${parentTaskId} -> child=${childTaskId} mode=${mode}`);
  }

  handleTaskModeSwitched(taskId, mode) {
    if (taskId && this.taskHierarchy.has(taskId)) {
      this.taskHierarchy.get(taskId).mode = mode;
    }
    if (!this.rootTaskId || taskId === this.rootTaskId || this.isExecuting) {
      this.currentTaskMode = mode;
    }
    this.log(`[TaskHierarchy] taskModeSwitched: task=${taskId} mode=${mode}`);
  }

  handleTaskCompletedMeta(taskId, result, tokenUsage, meta) {
    const isSubtask = Boolean(meta?.isSubtask || (taskId && this.taskHierarchy.get(taskId)?.isSubtask));
    if (taskId) {
      this.completedTaskIds.add(taskId);
      const existing = this.taskHierarchy.get(taskId) || {};
      this.taskHierarchy.set(taskId, {
        ...existing,
        isSubtask: isSubtask
      });
    }

    if (isSubtask) {
      this.isCurrentSubtask = false;
      if (this.rootTaskId && this.taskHierarchy.has(this.rootTaskId)) {
        this.currentTaskMode = this.taskHierarchy.get(this.rootTaskId).mode || 'orchestrator';
      }
      this.isExecuting = true;
    } else if (!this.rootTaskId || taskId === this.rootTaskId) {
      this.isExecuting = false;
      this.isCurrentSubtask = false;
    }
  }

  async handleZooEvent(event) {
    if (!this.telegramClient || !this.allowedUserId || this.state !== BridgeState.ACTIVE) {
      return;
    }

    try {
      // Normalize raw event: Zoo Code emits { taskId, action, message: { type, ask, say, text, ... } }
      // but might also pass direct payload { type, ask, say, text, ... } in different contexts.
      let payload = event;
      if (event && typeof event === 'object') {
        if (event.message && typeof event.message === 'object') {
          payload = event.message;
        } else if (event.payload && typeof event.payload === 'object') {
          payload = event.payload;
        }
      }

      if (!payload || typeof payload !== 'object') {
        return;
      }

      // Detailed diagnostic logging for every incoming Zoo Code event.
      const eventAction = (event && typeof event === 'object') ? (event.action || '-') : '-';
      const trunc = (v) => {
        const s = typeof v === 'string' ? v : (v === undefined ? '' : JSON.stringify(v));
        return s.length > 100 ? `${s.slice(0, 100)}…` : s;
      };
      this.log(
        `[ZooEvent] action=${eventAction} type=${payload.type || '-'} ask=${payload.ask || '-'} ` +
        `say=${payload.say || '-'} partial=${payload.partial} isAnswered=${payload.isAnswered} ` +
        `autoApprovalDecision=${payload.autoApprovalDecision || '-'} text=${trunc(payload.text)}`
      );

      const taskId = (event && typeof event === 'object' && event.taskId) || payload.taskId || null;
      const parentTaskId = (event && typeof event === 'object' && event.parentTaskId) || payload.parentTaskId || null;
      const isSubtaskFlag = Boolean(
        (event && typeof event === 'object' && (event.isSubtask || event.parentTaskId)) ||
        payload.isSubtask ||
        payload.parentTaskId
      );

      // Subtask Invocation / Creation Detection
      const newTaskCall = this.extractNewTaskCall(payload) || this.extractNewTaskCall(event);

      // Track active execution state
      if (newTaskCall && payload.partial !== true && event.partial !== true) {
        this.isExecuting = true;
        this.isCurrentSubtask = true;
        this.currentSubtaskMode = newTaskCall.mode || 'code';
      } else if (isSubtaskFlag || (taskId && this.taskHierarchy.get(taskId)?.isSubtask)) {
        this.isExecuting = true;
        this.isCurrentSubtask = true;
        this.currentSubtaskMode = payload.mode || event.mode || (taskId && this.taskHierarchy.get(taskId)?.mode) || 'code';
      } else if (payload.say !== 'completion_result' && payload.type !== 'ask') {
        this.isExecuting = true;
        this.isCurrentSubtask = false;
        this.currentSubtaskMode = null;
        if (payload.mode || event.mode) {
          this.currentTaskMode = payload.mode || event.mode;
        }
      }

      // Task Hierarchy Bookkeeping
      if (taskId) {
        if (isSubtaskFlag) {
          const item = this.taskHierarchy.get(taskId) || {};
          this.taskHierarchy.set(taskId, {
            ...item,
            isSubtask: true,
            mode: (!newTaskCall && (payload.mode || event.mode)) || item.mode || 'code',
            parentTaskId: parentTaskId || item.parentTaskId || this.rootTaskId || 'root'
          });
        } else if (!this.taskHierarchy.has(taskId)) {
          if (!this.rootTaskId) {
            this.rootTaskId = taskId;
          }
          this.taskHierarchy.set(taskId, {
            isSubtask: false,
            mode: (!newTaskCall && (payload.mode || event.mode)) || this.currentTaskMode || 'orchestrator'
          });
        } else if ((payload.mode || event.mode) && !newTaskCall) {
          const item = this.taskHierarchy.get(taskId);
          item.mode = payload.mode || event.mode;
        }
      }
      if (newTaskCall && payload.partial !== true && event.partial !== true) {
        const subtaskMode = newTaskCall.mode || 'code';
        const subtaskMsg = newTaskCall.message || '';
        const startKey = payload.messageId || `${taskId || 'root'}:${subtaskMode}:${subtaskMsg.slice(0, 40)}`;

        if (!this.notifiedSubtaskStarts.has(startKey)) {
          this.notifiedSubtaskStarts.add(startKey);
          if (this.notifiedSubtaskStarts.size > 100) {
            const first = this.notifiedSubtaskStarts.values().next().value;
            this.notifiedSubtaskStarts.delete(first);
          }

          const currentParentId = taskId || this.rootTaskId || 'root';
          this.pendingSubtasksByParent.set(currentParentId, {
            mode: subtaskMode,
            message: subtaskMsg
          });

          // The task delegating the subtask is a parent task
          if (taskId) {
            const existing = this.taskHierarchy.get(taskId) || {};
            this.taskHierarchy.set(taskId, {
              ...existing,
              isSubtask: false,
              mode: existing.mode || this.currentTaskMode || 'orchestrator'
            });
          }

          const profileName = formatProfileName(subtaskMode, 'Code');
          const startNotification = t('subtaskStarted', {
            profile: profileName,
            message: subtaskMsg
          });

          await this.telegramClient.sendMessage(this.allowedUserId, startNotification, {
            parse_mode: 'Markdown'
          });
          this.log(`[Telegram] Subtask creation notified [Profile: ${profileName}]`);
        }
      }

      // 1. Followup / Multiple-choice question (ask_followup_question)
      // Zoo Code emits ask: "followup" with payload.text containing JSON { question, suggest: [{ answer, mode }] }
      // or plain text question string.
      if (payload.ask === 'followup' || payload.type === 'ask_followup') {
        // Zoo Code streams the followup tool text as partial fragments before
        // emitting the final JSON payload (partial: false). Never forward
        // partial fragments; only the complete question is sent once.
        if (payload.partial === true) {
          this.log(`[Telegram] SKIPPED: partial followup streaming event (type=${payload.type}, ask=${payload.ask})`);
          return;
        }

        this.isExecuting = false;

        const followupKey = payload.messageId
          ? `id:${payload.messageId}`
          : (payload.ts ? `ts:${payload.ts}` : `followup:${String(payload.text || '').slice(0, 120)}`);
        if (this.forwardedFollowupKeys.has(followupKey)) {
          this.log(`[Telegram] SKIPPED: followup already forwarded (key=${followupKey})`);
          return;
        }
        this.forwardedFollowupKeys.add(followupKey);
        if (this.forwardedFollowupKeys.size > 100) {
          const firstKey = this.forwardedFollowupKeys.values().next().value;
          this.forwardedFollowupKeys.delete(firstKey);
        }

        this.currentPendingAsk = payload;
        let questionText = payload.text || '';
        let options = [];

        if (typeof questionText === 'string' && questionText.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(questionText);
            if (parsed.question) questionText = parsed.question;
            if (Array.isArray(parsed.suggest)) {
              options = parsed.suggest.map((s) => (typeof s === 'string' ? s : s.answer || s.text || '')).filter(Boolean);
            }
          } catch (e) {
            // Not valid JSON, retain raw questionText
          }
        }

        if (options.length === 0 && Array.isArray(payload.options)) {
          options = payload.options.map((o) => (typeof o === 'string' ? o : o.answer || o.text || '')).filter(Boolean);
        }

        // Build Inline Keyboard with 1 button per row for clear mobile tapping
        let keyboard = undefined;
        if (options.length > 0) {
          const rows = [];
          for (let i = 0; i < options.length; i++) {
            const optText = options[i];
            const optKey = `${Date.now()}_${i}`;
            if (!this.pendingFollowupOptions) {
              this.pendingFollowupOptions = new Map();
            }
            this.pendingFollowupOptions.set(optKey, optText);
            // Limit stored options to last 50 entries to prevent memory growth
            if (this.pendingFollowupOptions.size > 50) {
              const firstKey = this.pendingFollowupOptions.keys().next().value;
              this.pendingFollowupOptions.delete(firstKey);
            }

            const btnLabel = optText.length > 55 ? optText.substring(0, 52) + '...' : optText;
            rows.push([{ text: `🔘 ${btnLabel}`, callback_data: `fo:${optKey}` }]);
          }
          keyboard = { inline_keyboard: rows };
        }

        const msgContent = `${t('followupQuestionPrefix')}${questionText || t('toolDefaultDescription')}`;
        await this.telegramClient.sendMessage(this.allowedUserId, msgContent, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }

      // 2. Tool / Command approval request.
      // completion_result MUST NEVER trigger an approval prompt: the `say`
      // event already delivered the final result, while the trailing `ask`
      // event only asks the Webview for continue/finish confirmation.
      if (payload.ask === 'completion_result' || payload.say === 'completion_result') {
        this.log(`[ZooApproval] SKIPPED: completion_result is not an approval request (ask=${payload.ask || '-'}, say=${payload.say || '-'})`);
      } else if (payload.ask === 'tool' || payload.ask === 'command') {
        this.log(`[ZooApproval] action=${eventAction} ask=${payload.ask} type=${payload.type} partial=${payload.partial} isAnswered=${payload.isAnswered} autoApprovalDecision=${payload.autoApprovalDecision} text=${String(payload.text || '').slice(0, 120)}`);

        const isAutoAnswered = payload.isAnswered === true || !!payload.autoApprovalDecision;
        const askKey = this.askKeyFor(payload, taskId);

        // Keep the latest observed state so the debounced sender can re-check
        // whether the ask was auto-answered in the meantime.
        this.latestAskState.set(askKey, payload);

        // Partial events are streaming fragments: they do not carry the final
        // approval decision. The final non-partial event will carry
        // isAnswered/autoApprovalDecision, so never forward partial fragments.
        if (payload.partial === true) {
          this.log(`[Telegram] SKIPPED: partial streaming event (key=${askKey})`);
          return;
        }

        if (isAutoAnswered) {
          this.clearPendingApproval(askKey);
          this.autoApprovedAskKeys.add(askKey);
          // If an approval prompt was already sent before the auto-approval
          // decision arrived, retract its inline buttons so the user never
          // sees a stale actionable request.
          const sentMessageId = this.approvalSentMessages.get(askKey);
          if (sentMessageId) {
            await this.telegramClient.editMessageReplyMarkup(
              this.allowedUserId,
              sentMessageId,
              { inline_keyboard: [] }
            ).catch(() => {});
            this.approvalSentMessages.delete(askKey);
          }
          this.log(`[Telegram] SKIPPED: auto-approved (isAnswered=${payload.isAnswered}, autoApprovalDecision=${payload.autoApprovalDecision}, key=${askKey})`);
          return;
        }

        // Non-partial and still awaiting approval: debounce so a follow-up
        // `updated` event can cancel this send if Zoo Code auto-resolves it.
        this.log(`[Telegram] WAITING debounce (${APPROVAL_DEBOUNCE_MS}ms) for key=${askKey}`);
        this.scheduleApprovalSend(askKey, payload);
        return;
      }

      // 3. Completion / Result Relay.
      // Only forward a non-empty final completion once. The `say` event
      // carries the result text; a trailing `ask` completion (empty text or
      // duplicate text already sent) must be silently ignored.
      if (
        (payload.type === 'say' && payload.say === 'completion_result') ||
        payload.ask === 'completion_result' ||
        payload.say === 'completion_result'
      ) {
        // Zoo Code streams completion_result as partial fragments while the
        // final answer is still being produced. Only the final event
        // (partial === false or undefined) carries the canonical result and
        // must be relayed to Telegram; streaming fragments are discarded.
        if (payload.partial === true) {
          this.log('[ZooCompletion] SKIPPED: partial completion_result fragment (streaming)');
          return;
        }

        const resultText = (payload.text && String(payload.text).trim()) || '';

        if (!resultText) {
          this.log('[ZooCompletion] SKIPPED: empty completion_result (no duplicate send)');
          return;
        }

        // Deduplicate per message (stable id/ts) and per task+text (fallback),
        // so both a subtask and the main task are forwarded independently even
        // when they share the same completion text.
        const stableKey = payload.messageId
          ? `id:${payload.messageId}`
          : (payload.ts ? `ts:${payload.ts}` : null);
        const fallbackKey = `task:${taskId || 'default'}:${resultText}`;

        if (
          (stableKey && this.sentCompletionKeys.has(stableKey)) ||
          this.sentCompletionTasks.has(fallbackKey)
        ) {
          this.log('[ZooCompletion] SKIPPED: completion_result already forwarded');
          return;
        }

        if (stableKey) {
          this.sentCompletionKeys.add(stableKey);
          if (this.sentCompletionKeys.size > 200) {
            const first = this.sentCompletionKeys.values().next().value;
            this.sentCompletionKeys.delete(first);
          }
        }
        this.sentCompletionTasks.add(fallbackKey);
        if (this.sentCompletionTasks.size > 200) {
          const first = this.sentCompletionTasks.values().next().value;
          this.sentCompletionTasks.delete(first);
        }

        // Determine if subtask or main task
        let isSubtask = false;
        let detectedMode = null;

        if (event.isSubtask === false || payload.isSubtask === false) {
          isSubtask = false;
        } else if (
          event.isSubtask === true ||
          payload.isSubtask === true ||
          event.parentTaskId ||
          payload.parentTaskId
        ) {
          isSubtask = true;
        } else if (taskId && this.taskHierarchy.has(taskId)) {
          isSubtask = Boolean(this.taskHierarchy.get(taskId).isSubtask);
          detectedMode = this.taskHierarchy.get(taskId).mode;
        } else if (taskId && this.pendingSubtasksByParent.has(taskId)) {
          isSubtask = false;
        } else if (taskId && this.rootTaskId && taskId !== this.rootTaskId) {
          isSubtask = true;
        }

        if (!detectedMode) {
          detectedMode = payload.mode || event.mode;
        }
        if (!detectedMode && taskId && this.taskHierarchy.has(taskId)) {
          detectedMode = this.taskHierarchy.get(taskId).mode;
        }
        if (!detectedMode) {
          if (isSubtask) {
            const lastPending = Array.from(this.pendingSubtasksByParent.values()).pop();
            detectedMode = lastPending?.mode || 'code';
          } else {
            detectedMode = this.currentTaskMode || 'orchestrator';
          }
        }

        let formattedHeader = '';
        if (isSubtask) {
          this.isCurrentSubtask = false;
          this.currentSubtaskMode = null;
          const parentId = (taskId && this.taskHierarchy.get(taskId)?.parentTaskId) || this.rootTaskId;
          const parentMode = (parentId && this.taskHierarchy.get(parentId)?.mode) || null;
          this.currentTaskMode = parentMode;
          this.isExecuting = true;
          const profile = formatProfileName(detectedMode, 'Code');
          formattedHeader = t('subtaskCompletedPrefix', { profile });
          if (taskId) {
            this.completedTaskIds.add(taskId);
            const info = this.taskHierarchy.get(taskId);
            if (info && info.parentTaskId) {
              this.pendingSubtasksByParent.delete(info.parentTaskId);
            }
          } else if (this.pendingSubtasksByParent.size > 0) {
            const firstKey = this.pendingSubtasksByParent.keys().next().value;
            this.pendingSubtasksByParent.delete(firstKey);
          }
        } else {
          this.isExecuting = false;
          this.isCurrentSubtask = false;
          this.currentSubtaskMode = null;
          this.currentTaskMode = null;
          const profile = formatProfileName(detectedMode, 'Orchestrator');
          formattedHeader = t('mainTaskCompletedPrefix', { profile });
        }

        await this.telegramClient.sendMessage(
          this.allowedUserId,
          `${formattedHeader}${resultText}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // 4. User feedback / prompts (UI vs Telegram origin)
      if (payload.say === 'user_feedback' || (payload.type === 'say' && payload.say === 'user_feedback')) {
        const userText = (payload.text && String(payload.text).trim()) || '';
        if (!userText) {
          return;
        }
        if (this.isFromTelegramAndConsume(userText)) {
          this.log('[ZooEvent] Suppressed echo for user prompt originated from Telegram');
          return;
        }
        await this.telegramClient.sendMessage(
          this.allowedUserId,
          `${t('userPromptUiPrefix')}${userText}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // 5. Informational say messages (Agent responses only)
      // Before the model starts responding, Zoo Code records the initial user
      // instruction as the first `say: "text"` event of the task. Any
      // `say: "text"` arriving before `api_req_started` is therefore the user
      // prompt (UI origin), not an agent response.
      if (payload.say === 'api_req_started' || payload.type === 'api_req_started') {
        if (taskId) {
          this.taskModelStarted.set(taskId, true);
        }
        this.log(`[ZooEvent] Marked task ${taskId || 'unknown'} as model-started (api_req_started)`);
        return;
      }

      if (payload.type === 'say' && payload.text && payload.say === 'text') {
        // A subtask starts with a delegated instruction recorded as its first
        // `say: "text"` event, before the child model emits api_req_started.
        // That initial text is the parent agent's delegation prompt (already
        // summarized in the "Subtask Avviato" notification), not a message
        // typed by the operator. Never forward it as `Utente (UI)`.
        const isSubtaskPrompt = Boolean(
          (taskId && this.taskHierarchy.get(taskId)?.isSubtask === true) ||
          isSubtaskFlag ||
          parentTaskId
        );
        if (isSubtaskPrompt) {
          if (taskId) {
            this.taskModelStarted.set(taskId, true);
          }
          this.log(`[ZooEvent] Suppressed initial delegation prompt for subtask ${taskId || 'unknown'}`);
          return;
        }

        const modelStarted = taskId ? this.taskModelStarted.get(taskId) === true : true;
        if (!modelStarted) {
          const userText = (payload.text && String(payload.text).trim()) || '';
          if (this.isFromTelegramAndConsume(userText)) {
            this.log('[ZooEvent] Suppressed echo for initial user prompt originated from Telegram');
            return;
          }
          await this.telegramClient.sendMessage(
            this.allowedUserId,
            `${t('userPromptUiPrefix')}${payload.text}`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        const profile = this.currentTaskMode ? formatProfileName(this.currentTaskMode, '') : '';
        const prefix = profile ? t('zooCodePrefix', { profile }) : t('zooCodePrefix');
        // Relay standard text responses from agent
        await this.telegramClient.sendMessage(
          this.allowedUserId,
          `${prefix}${payload.text}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch (err) {
      this.log(`Error relaying Zoo Code event to Telegram: ${err.message}`);
    }
  }

  askKeyFor(payload, taskId = null) {
    if (payload && payload.messageId) return `id:${payload.messageId}`;
    if (payload && payload.ts) return `ts:${payload.ts}`;

    // Deterministic fingerprint fallback: without a stable messageId/ts the
    // same tool's `created`/`updated` events must still map to the same key,
    // otherwise the debounce and deduplication are defeated.
    const tool = payload && (payload.tool || payload.command || payload.name);
    const text = payload && payload.text ? String(payload.text).slice(0, 120) : '';
    const tid = taskId || (payload && payload.taskId) || '';
    if (tool || text) {
      return `fingerprint:${tid}:${tool || ''}:${text}`;
    }
    return `unknown:${Date.now()}`;
  }

  clearPendingApproval(key) {
    const timer = this.pendingApprovalTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.pendingApprovalTimers.delete(key);
    }
  }

  scheduleApprovalSend(key, payload) {
    this.clearPendingApproval(key);
    if (this.autoApprovedAskKeys.has(key)) {
      this.log(`[Telegram] SKIPPED: auto-approved key already recorded (key=${key})`);
      return;
    }
    const timer = setTimeout(() => {
      this.pendingApprovalTimers.delete(key);
      if (this.autoApprovedAskKeys.has(key)) {
        this.log(`[Telegram] SKIPPED: auto-approved before debounce fired (key=${key})`);
        return;
      }
      this.sendApprovalPrompt(key, payload).catch((err) => {
        this.log(`Error sending approval prompt: ${err.message}`);
      });
    }, APPROVAL_DEBOUNCE_MS);
    this.pendingApprovalTimers.set(key, timer);
  }

  async sendApprovalPrompt(key, payload) {
    const latest = this.latestAskState.get(key) || payload;

    if (this.autoApprovedAskKeys.has(key)) {
      this.log(`[Telegram] SKIPPED: auto-approved key already recorded (key=${key})`);
      return;
    }

    // Re-check after the debounce: a final auto-approved/auto-denied `updated`
    // event may have arrived in the meantime.
    if (latest.isAnswered === true || !!latest.autoApprovalDecision) {
      this.log(`[Telegram] SKIPPED: auto-approved during debounce (key=${key})`);
      return;
    }

    // Dedupe: only one approval prompt per Zoo Code message.
    if (this.forwardedApprovalKeys.has(key)) {
      this.log(`[Telegram] SKIPPED: already forwarded approval (key=${key})`);
      return;
    }
    this.forwardedApprovalKeys.add(key);
    if (this.forwardedApprovalKeys.size > 100) {
      const first = this.forwardedApprovalKeys.values().next().value;
      this.forwardedApprovalKeys.delete(first);
    }

    this.isExecuting = false;
    this.currentPendingAsk = latest;
    const toolName = latest.tool || latest.command || t('toolDefaultName');
    const description = latest.text || latest.partialMessage || t('toolDefaultDescription');

    const approvalMsg = t('toolAuthMessage', {
      toolName: toolName,
      description: description
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: t('btnApprove'), callback_data: 'approve' },
          { text: t('btnReject'), callback_data: 'reject' }
        ]
      ]
    };

    const sent = await this.telegramClient.sendMessage(this.allowedUserId, approvalMsg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    const sentMessageId = sent && sent.result && sent.result.message_id;
    if (sentMessageId) {
      this.approvalSentMessages.set(key, sentMessageId);
      if (this.approvalSentMessages.size > 100) {
        const firstKey = this.approvalSentMessages.keys().next().value;
        this.approvalSentMessages.delete(firstKey);
      }
    }
    this.log(`[Telegram] APPROVAL PROMPT SENT (messageId=${sentMessageId || '-'})`);
  }

  async handleZooApproval(approved) {
    this.log(`Handling Zoo approval: ${approved ? 'APPROVED' : 'REJECTED'}`);
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');
      const api = zooExt ? zooExt.exports : null;

      if (approved) {
        if (typeof api?.pressPrimaryButton === 'function') {
          await api.pressPrimaryButton();
        } else if (typeof api?.controller?.pressPrimaryButton === 'function') {
          await api.controller.pressPrimaryButton();
        } else {
          // Fallback via VS Code command
          await vscode.commands.executeCommand('zoo-code.primaryButtonClicked').then(null, () => {});
        }
      } else {
        if (typeof api?.pressSecondaryButton === 'function') {
          await api.pressSecondaryButton();
        } else if (typeof api?.controller?.pressSecondaryButton === 'function') {
          await api.controller.pressSecondaryButton();
        } else {
          // Fallback via VS Code command
          await vscode.commands.executeCommand('zoo-code.secondaryButtonClicked').then(null, () => {});
        }
      }
    } catch (err) {
      this.log(`Failed to trigger Zoo Code button action: ${err.message}`);
    }
  }

  async forwardMessageToZooCode(text, chatId) {
    this.isExecuting = true;
    this.isCurrentSubtask = false;
    try {
      const zooExt = vscode.extensions.getExtension('ZooCodeOrganization.zoo-code') ||
                     vscode.extensions.getExtension('rooveterinaryinc.roo-cline');

      if (zooExt) {
        if (!zooExt.isActive) {
          await zooExt.activate();
        }
        const api = zooExt.exports;

        const currentTask = api?.sidebarProvider?.getCurrentTask?.() ||
                            api?.sidebarProvider?.cline ||
                            api?.controller?.cline ||
                            null;
        const hasExistingChat = Boolean(this.rootTaskId || currentTask);

        // If user selected a specific chat (rootTaskId), ensure it is active in Zoo Code
        if (this.rootTaskId && (!currentTask || currentTask.taskId !== this.rootTaskId)) {
          this.log(`Ensuring selected chat ${this.rootTaskId} is active in Zoo Code before forwarding prompt`);
          await this.invokeZooCodeShowTask(this.rootTaskId);
        }

        if (hasExistingChat) {
          // Continue in existing chat via sendMessage; NEVER start a new task
          if (typeof api?.sendMessage === 'function') {
            this.trackTelegramPrompt(text);
            await api.sendMessage(text);
            await this.telegramClient.sendMessage(chatId, t('messageForwarded'));
            return;
          } else if (typeof api?.controller?.sendMessage === 'function') {
            this.trackTelegramPrompt(text);
            await api.controller.sendMessage(text);
            await this.telegramClient.sendMessage(chatId, t('messageForwarded'));
            return;
          } else if (typeof api?.sidebarProvider?.postMessageToWebview === 'function') {
            this.trackTelegramPrompt(text);
            await api.sidebarProvider.postMessageToWebview({
              type: 'invoke',
              invoke: 'sendMessage',
              text: text
            });
            await this.telegramClient.sendMessage(chatId, t('messageForwarded'));
            return;
          }
        } else {
          // No chat selected and no active task; start a new task
          if (typeof api?.startNewTask === 'function') {
            this.trackTelegramPrompt(text);
            try {
              await api.startNewTask({ text: text });
            } catch (e) {
              await api.startNewTask(text);
            }
            await this.telegramClient.sendMessage(chatId, t('taskStarted'));
            return;
          } else if (typeof api?.controller?.startNewTask === 'function') {
            this.trackTelegramPrompt(text);
            await api.controller.startNewTask(text);
            await this.telegramClient.sendMessage(chatId, t('taskStarted'));
            return;
          }
        }
      }

      // If no direct API method was available, notify user
      await this.telegramClient.sendMessage(
        chatId,
        t('apiNotice', { text: text }),
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      this.log(`Error forwarding message to Zoo Code: ${err.message}`);
      await this.telegramClient.sendMessage(chatId, t('errorForwarding', { error: err.message }));
    }
  }
}

// Extension Activation (STRICT DEFAULT-OFF)
let controller = null;

async function activate(context) {
  controller = new TelegramBridgeController(context);
  controller.init();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('visualvibe.telegram.toggle', async () => {
      if (controller) await controller.toggle();
    }),
    vscode.commands.registerCommand('visualvibe.telegram.start', async () => {
      if (controller) await controller.start();
    }),
    vscode.commands.registerCommand('visualvibe.telegram.stop', async () => {
      if (controller) await controller.stop(true);
    }),
    vscode.commands.registerCommand('visualvibe.telegram.status', () => {
      if (controller) controller.showStatus();
    })
  );

  context.subscriptions.push(controller.statusBarItem);
  context.subscriptions.push(controller.outputChannel);

  // Check ephemeral active session handover
  await controller.checkSessionHandover().catch((err) => {
    controller.log(`Handover check error: ${err.message}`);
  });
}

function deactivate() {
  if (controller) {
    controller.stop(false);
  }
}

module.exports = {
  activate,
  deactivate,
  resolveAiLang,
  formatProfileName,
  MESSAGES,
  t,
  TelegramBridgeController,
  TelegramClient,
  BridgeState,
  getWorkdirsRoot,
  scanProjects,
  getZooTasksForProject,
  saveSessionHandover,
  readSessionHandover,
  clearSessionHandover,
  SESSION_HANDOVER_PATH,
  formatTaskTimestamp
};
