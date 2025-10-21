// 🤖 Bot WhatsApp pro Cameroun (version améliorée)
// Remplacez Bot.js par ce fichier et lancez : node Bot.js

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const SESSION_FOLDER = path.join(__dirname, 'session'); // dossier de session

// === CONFIG ===
// Remplace ton numéro propriétaire (format international sans + ni espaces), ex: 237690123456
const OWNER_NUMBER = '237652492874';
const OWNER = `${OWNER_NUMBER}@s.whatsapp.net`;

// Si tu veux forcer pairing code au lieu du QR, laisse true.
// Sinon le code essaiera pairing, et si erreur -> affichera QR fallback.
const TRY_PAIRING_CODE = true;

// Paramètres de reconnexion
const BASE_RETRY_MS = 5000;    // 5s
const MAX_RETRY_MS = 60_000;   // 1 min

let socketInstance = null;     // référence au socket courant
let restarting = false;        // empêche démarrages concurrents

async function startBot() {
  if (restarting) return;
  restarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,       // si pairing code échoue, on verra QR dans le terminal
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 0
    });

    socketInstance = sock;
    restarting = false;

    // sauvegarde automatique des creds
    sock.ev.on('creds.update', saveCreds);

    // si la session n'est pas enregistrée, essayer le pairing code si activé
    if (!state.creds || !state.creds.registered) {
      if (TRY_PAIRING_CODE && typeof sock.requestPairingCode === 'function') {
        try {
          const phone = OWNER_NUMBER; // num sans +, ex 237690123456
          console.log('🔎 Tentative de pairing code (connexion sans QR) — patientes un instant...');
          const code = await sock.requestPairingCode(phone);
          console.log('─────────────────────────────────────────');
          console.log('PAIRING CODE (colle/entre ce code dans WhatsApp → Appareils liés → Lier un appareil) :');
          console.log(`>>> ${code} <<<`);
          console.log('─────────────────────────────────────────');
          console.log('Si tu ne trouves pas l’option sur ton téléphone, scanne le QR affiché dans le terminal.');
        } catch (err) {
          console.warn('⚠️ Pairing code indisponible / échoué, affichage du QR en fallback. Erreur:', err?.message || err);
        }
      } else {
        console.log('ℹ️ Pas de pairing code supporté par ta version de Baileys — scanne le QR affiché dans le terminal.');
      }
    }

    // ---- Messages entrants (commandes)
    let isMuted = false;

    sock.ev.on('messages.upsert', async (msgUpdate) => {
      try {
        const message = msgUpdate.messages && msgUpdate.messages[0];
        if (!message || !message.message) return;

        const from = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const text =
          (message.message.conversation) ||
          (message.message.extendedTextMessage && message.message.extendedTextMessage.text) ||
          '';

        const cmdRaw = text.trim();
        const cmd = cmdRaw.toLowerCase();

        // si muet, ignorer sauf !unmute envoyé par OWNER
        if (isMuted && !(cmd === '!unmute' && sender === OWNER) && sender !== OWNER) return;

        // commandes publiques
        if (cmd === 'salut') {
          await sock.sendMessage(from, { text: '👋 Salut ! Le bot est là.' });
          return;
        }

        if (cmd === '!info') {
          await sock.sendMessage(from, {
            text: '📌 *Bot 237 Officiel*\nCréé par Rodrigue 😎\nGère le groupe, blagues camerounaises et salut local 💪'
          });
          return;
        }

        if (cmd === '!aide' || cmd === '!menu') {
          const menu = `
📋 MENU DU BOT 237 🇨🇲

💬 Commandes disponibles :
1️⃣ !menu / !aide — Voir ce menu
2️⃣ !blague — Rire un peu 😅
3️⃣ !info — Infos du bot ℹ️

⚙️ Commandes réservées au propriétaire (auth requise) :
4️⃣ !kick [numéro] — Expulser un membre 🚫
5️⃣ !mute — Mode silencieux 🔇
6️⃣ !unmute — Activer le bot 🔊
`;
          await sock.sendMessage(from, { text: menu });

          if (fs.existsSync(path.join(__dirname, 'aide.mp3'))) {
            const audioBuffer = fs.readFileSync(path.join(__dirname, 'aide.mp3'));
            await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mp4', ptt: true });
          } else {
            await sock.sendMessage(from, { text: '🔊 Vocal d’aide non trouvé (aide.mp3 manquant).' });
          }
          return;
        }

        if (cmd === '!blague') {
          const blagues = [
            "😂 Un gars a dit à sa copine : 'tu brilles comme le soleil'... Elle a répondu 'donc tu ne peux pas me regarder longtemps hein ?' 😭",
            "🤣 Le ndolé sans viande, c’est juste une salade amère !",
            "😅 Un Camerounais a mis son téléphone dans le riz après qu’il soit tombé... dans la soupe ! 🍲📱",
            "😂 À l’école : 'Pourquoi tu es en retard ?' – 'Madame, j’attendais que le sommeil finisse !' 😴",
            "🤣 Si ton mot de passe c’est '1234', sache que même ton petit frère peut te hacker 😂"
          ];
          const r = blagues[Math.floor(Math.random() * blagues.length)];
          await sock.sendMessage(from, { text: r });
          return;
        }

        // commandes propriétaires (vérifier sender === OWNER)
        if (cmd === '!mute') {
          if (sender !== OWNER) return;
          isMuted = true;
          await sock.sendMessage(from, { text: '🔇 Le bot est maintenant en mode silencieux.' });
          return;
        }

        if (cmd === '!unmute') {
          if (sender !== OWNER) return;
          isMuted = false;
          await sock.sendMessage(from, { text: '🔊 Le bot est à nouveau actif.' });
          return;
        }

        if (cmd.startsWith('!kick')) {
          if (sender !== OWNER) return;
          const parts = cmdRaw.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await sock.sendMessage(from, { text: '⚠️ Usage : !kick 2376XXXXXXXX' });
            return;
          }
          const number = parts[1].replace(/[^0-9]/g, '');
          if (!number) {
            await sock.sendMessage(from, { text: '⚠️ Numéro invalide.' });
            return;
          }
          const jid = `${number}@s.whatsapp.net`;
          try {
            await sock.groupParticipantsUpdate(from, [jid], 'remove');
            await sock.sendMessage(from, { text: `🚫 ${number} a été expulsé du groupe.` });
          } catch (e) {
            console.error('Kick error:', e);
            await sock.sendMessage(from, { text: '❌ Erreur : impossible d’expulser ce membre (le bot doit être admin).' });
          }
          return;
        }

        // autres commandes possibles...
      } catch (err) {
        console.error('messages.upsert error:', err);
      }
    });

    // bienvenue automatique
    sock.ev.on('group-participants.update', async (update) => {
      try {
        const groupId = update.id;
        for (const participant of update.participants) {
          if (update.action === 'add') {
            await sock.sendMessage(groupId, {
              text: `🎉 Bienvenue @${participant.split('@')[0]} !`,
              mentions: [participant]
            });
          }
        }
      } catch (err) {
        console.error('group-participants.update error:', err);
      }
    });

    // gestion connexion / reconnexion robuste
    sock.ev.on('connection.update', async (update) => {
      try {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
          console.log('✅ Bot connecté à WhatsApp !');
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          console.warn('⚠️ Connexion fermée. statusCode:', code);

          // si la session est invalidée (logged out / 401), supprimer session et prévenir
          const loggedOut = code === DisconnectReason.loggedOut || code === 401;
          if (loggedOut) {
            console.error('❌ Session invalide (logged out). Supprime le dossier "session" et reconnecte-toi via QR/pairing.');
            // supprimer session pour forcer ré-auth (utilisateur devra rescan)
            try {
              if (fs.existsSync(SESSION_FOLDER)) {
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
                console.log('ℹ️ Dossier session supprimé.');
              }
            } catch (e) {
              console.error('Erreur suppression session:', e);
            }
            return;
          }

          // sinon on tente une reconnexion progressive
          let delay = BASE_RETRY_MS;
          console.log(`⏳ Tentative de reconnexion dans ${delay / 1000}s...`);
          setTimeout(async () => {
            // stop current socket before restart
            try { sock.ev.removeAllListeners(); } catch(e){/*ignore*/ }
            try { sock.end(); } catch(e){/*ignore*/ }
            // relancer startBot (avec garde pour ne pas lancer plusieurs fois)
            try {
              await startBotWithBackoff();
            } catch (e) {
              console.error('Erreur lors du redémarrage du bot:', e);
            }
          }, delay);
        }
      } catch (e) {
        console.error('connection.update handler error:', e);
      }
    });

  } catch (err) {
    restarting = false;
    console.error('startBot error:', err);
    // si startBot échoue, on attend puis on réessaie
    setTimeout(() => startBotWithBackoff(), BASE_RETRY_MS);
  }
}

// wrapper avec backoff pour éviter multi-instanciations rapides
let backoffAttempts = 0;
async function startBotWithBackoff() {
  if (restarting) return;
  restarting = true;
  const wait = Math.min(BASE_RETRY_MS * Math.pow(2, backoffAttempts), MAX_RETRY_MS);
  if (backoffAttempts > 0) console.log(`🔁 Backoff: attente ${wait/1000}s avant prochaine tentative...`);
  await new Promise(resolve => setTimeout(resolve, wait));
  backoffAttempts++;
  try {
    await startBot();
    backoffAttempts = 0; // reset on success
  } catch (e) {
    console.error('Erreur startBotWithBackoff:', e);
    // relancer plus tard
    setTimeout(() => startBotWithBackoff(), Math.min(wait * 2, MAX_RETRY_MS));
  } finally {
    restarting = false;
  }
}

// start
startBotWithBackoff().catch(e => console.error('Fatal start error:', e));
