// 🦾 Bot WhatsApp pro Cameroun 🇨🇲
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');

async function startBot() {
    console.log('⏳ Démarrage du bot...');

    // Gestion de l'authentification multi-fichiers
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({ auth: state });

    // Sauvegarde automatique des credentials
    sock.ev.on('creds.update', saveCreds);

    // 🔑 Ton numéro WhatsApp (propriétaire du bot)
    const OWNER = "237652492874@s.whatsapp.net"; // Remplace par ton numéro complet

    // 🔕 Mode silencieux
    let isMuted = false;

    // 📨 Gestion des messages entrants
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

            const cmd = text.trim().toLowerCase();

            if (isMuted && !(cmd === '!unmute' && sender === OWNER) && sender !== OWNER) return;

            // ✅ Commande : !aide
            if (cmd === '!aide') {
                const menu = `
📋 MENU DU BOT 🦾🇨🇲

💬 Commandes disponibles :
1️⃣ !menu — Voir toutes les commandes
2️⃣ !aide — Écouter le vocal d'aide 🎧
3️⃣ !blague — Rire un peu 😅
4️⃣ !info — Infos du groupe ℹ️

🛡️ Commandes réservées au propriétaire 👊 :
5️⃣ !kick [numéro] — Expulser un membre 🧍‍♂️
6️⃣ !mute — Mode silencieux 🔕
7️⃣ !unmute — Activer le bot 🎧
`;
                await sock.sendMessage(from, { text: menu });

                if (fs.existsSync('./aide.mp3')) {
                    const audioBuffer = fs.readFileSync('./aide.mp3');
                    await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mp4', ptt: true });
                } else {
                    await sock.sendMessage(from, { text: '🎧 Vocal d’aide non trouvé (aide.mp3 manquant).' });
                }
            }

            // ✅ Commande : !info
            if (cmd === '!info') {
                await sock.sendMessage(from, {
                    text: "📌 *Bot 237 Officiel*\nCréé par Rodrigue 😎\nGère le groupe, blagues camerounaises et salut local 💪"
                });
            }

            // ✅ Commande : !blague
            if (cmd === '!blague') {
                const blagues = [
                    "😂 Un gars a dit à sa copine : 'tu brilles comme le soleil'... Elle a répondu 'donc tu ne peux pas me regarder longtemps hein ?' 😅",
                    "🤑 Le ndolé sans viande, c’est juste une salade amère !",
                    "😅 À l’école : 'Pourquoi tu es en retard ?' – 'Madame, j’attendais que le sommeil finisse avant de me lever !'",
                    "🤑 Si ton mot de passe c’est '1234', sache que même ton petit frère peut te hacker 😅"
                ];
                const random = blagues[Math.floor(Math.random() * blagues.length)];
                await sock.sendMessage(from, { text: random });
            }

            // ✅ Commande : !mute / !unmute (propriétaire)
            if (cmd === '!mute' && sender === OWNER) {
                isMuted = true;
                await sock.sendMessage(from, { text: '🔕 Le bot est maintenant en mode silencieux.' });
            }
            if (cmd === '!unmute' && sender === OWNER) {
                isMuted = false;
                await sock.sendMessage(from, { text: '🎧 Le bot est à nouveau actif.' });
            }

            // ✅ Commande : !kick (propriétaire)
            if (cmd.startsWith('!kick') && sender === OWNER) {
                const parts = text.split(' ').filter(Boolean);
                if (parts.length < 2) {
                    await sock.sendMessage(from, { text: '❌ Usage : !kick 2376XXXXXXXX' });
                    return;
                }
                const number = parts[1].replace(/[^0-9]/g, '');
                if (!number) {
                    await sock.sendMessage(from, { text: '❌ Numéro invalide.' });
                    return;
                }
                const jid = `${number}@s.whatsapp.net`;
                try {
                    await sock.groupParticipantsUpdate(from, [jid], 'remove');
                    await sock.sendMessage(from, { text: `🧍‍♂️ ${number} a été expulsé du groupe.` });
                } catch (e) {
                    console.error('Kick error:', e);
                    await sock.sendMessage(from, { text: '❌ Impossible d’expulser ce membre. Le bot doit être admin.' });
                }
            }

        } catch (err) {
            console.error('messages.upsert error:', err);
        }
    });

    // 👋 Bienvenue automatique
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const groupId = update.id;
            for (const participant of update.participants) {
                if (update.action === 'add') {
                    await sock.sendMessage(groupId, { text: `Bienvenue @${participant.split('@')[0]} ! 🎉`, mentions: [participant] });
                }
            }
        } catch (err) {
            console.error('group-participants.update error:', err);
        }
    });

    // 🔄 Gestion de la connexion et pairing code
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) console.log('🔑 Ton pairing code / QR code :', qr);
        if (connection === 'open') console.log('✅ Bot connecté à WhatsApp !');
        if (connection === 'close') {
            console.log('❌ Déconnecté, tentative de reconnexion...');
            if (lastDisconnect?.error) console.error('Dernière erreur :', lastDisconnect.error);
            setTimeout(() => startBot().catch(e => console.error('Reconnection failed:', e)), 5000);
        }
    });
}

// Démarrage du bot
startBot().catch((e) => console.error('startBot error:', e));
