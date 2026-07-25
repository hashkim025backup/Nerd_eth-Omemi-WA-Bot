// Memory storage for group settings and warnings
const warnings = {};
const maxWarns = {};

module.exports = {
    name: 'statuswarn',
    category: 'group',
    description: 'Manages status mention warnings and group limits',

    async handleStatusMention(sock, m) {
        try {
            const chatId = m.key?.remoteJid;
            if (!chatId || !chatId.endsWith('@g.us')) return;

            // Detect if message is a status mention notification
            const isStatusMention = 
                m.message?.groupMentionMessage || 
                m.messageContextInfo?.groupMention ||
                m.messageStubType === 68 || 
                m.messageStubType === 69 ||
                (m.message?.protocolMessage && m.message?.protocolMessage?.type === 0);

            if (!isStatusMention) return;

            // Check if bot is Admin
            const groupMetadata = await sock.groupMetadata(chatId);
            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isBotAdmin = groupMetadata.participants.some(
                p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin')
            );

            if (!isBotAdmin) return;

            const sender = m.key.participant || m.participant || m.participantJid;
            if (!sender) return;

            // Delete status mention notification
            await sock.sendMessage(chatId, { delete: m.key });

            // Initialize warnings for this group (Default limit: 3)
            if (!warnings[chatId]) warnings[chatId] = {};
            if (!maxWarns[chatId]) maxWarns[chatId] = 3;

            // Increase user warning count
            warnings[chatId][sender] = (warnings[chatId][sender] || 0) + 1;
            const currentWarns = warnings[chatId][sender];
            const limit = maxWarns[chatId];

            // Send warning message
            const warnText = `@${sender.split('@')[0]} warned for status mention, message deleted.\nwarning ${currentWarns}/${limit}`;
            await sock.sendMessage(chatId, { text: warnText, mentions: [sender] });

            // Kick user if they reach the limit
            if (currentWarns >= limit) {
                await sock.sendMessage(chatId, { 
                    text: `@${sender.split('@')[0]} reached maximum warnings (${limit}/${limit}) and has been removed.`,
                    mentions: [sender]
                });
                
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                warnings[chatId][sender] = 0;
            }

        } catch (error) {
            console.error('Error in statuswarn:', error);
        }
    },

    async setWarnLimit(sock, chatId, newLimit) {
        if (!newLimit || isNaN(newLimit)) return 'Please provide a valid number. Example: .setwarn 3';
        maxWarns[chatId] = parseInt(newLimit);
        return `Maximum warning limit updated to ${newLimit} for this group.`;
    }
};
