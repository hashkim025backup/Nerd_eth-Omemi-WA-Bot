// Memory storage for group settings and warnings
const warnings = {};
const maxWarns = {};

module.exports = {
    name: 'statuswarn',
    category: 'group',
    description: 'Manages status mention warnings and group limits',

    // 1. THIS RUNS AUTOMATICALLY ON EVERY MESSAGE
    async handleStatusMention(conn, mek) {
        try {
            const chatId = mek.key.remoteJid;
            if (!chatId.endsWith('@g.us')) return;

            // Detect if message is a status mention notification
            const isStatusMention = mek.message?.groupMentionMessage || 
                                    mek.messageContextInfo?.groupMention ||
                                    (mek.message?.protocolMessage && mek.message?.protocolMessage?.type === 0);

            if (!isStatusMention) return;

            // Check if bot is Admin
            const groupMetadata = await conn.groupMetadata(chatId);
            const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';
            const isBotAdmin = groupMetadata.participants.some(
                p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin')
            );

            if (!isBotAdmin) return;

            const sender = mek.key.participant || mek.participant;

            // Delete status mention notification
            await conn.sendMessage(chatId, { delete: mek.key });

            // Initialize warnings for this group (Default limit: 3)
            if (!warnings[chatId]) warnings[chatId] = {};
            if (!maxWarns[chatId]) maxWarns[chatId] = 3;

            // Add +1 warning to user
            warnings[chatId][sender] = (warnings[chatId][sender] || 0) + 1;
            const currentWarns = warnings[chatId][sender];
            const limit = maxWarns[chatId];

            // Send warning message
            const warnText = `@${sender.split('@')[0]} warned for status mention, message deleted.\nwarning ${currentWarns}/${limit}`;
            await conn.sendMessage(chatId, { text: warnText, mentions: [sender] });

            // Remove user if max warnings reached
            if (currentWarns >= limit) {
                await conn.sendMessage(chatId, { 
                    text: `@${sender.split('@')[0]} reached maximum warnings (${limit}/${limit}) and has been removed.`,
                    mentions: [sender]
                });
                
                await conn.groupParticipantsUpdate(chatId, [sender], 'remove');
                warnings[chatId][sender] = 0; // Reset after removal
            }

        } catch (error) {
            console.error('Error in status handler:', error);
        }
    },

    // 2. ADMIN COMMAND TO CHANGE MAX WARNS (Usage: .setwarn 5)
    async setWarnLimit(conn, chatId, newLimit) {
        if (!newLimit || isNaN(newLimit)) return 'Please provide a valid number. Example: .setwarn 3';
        maxWarns[chatId] = parseInt(newLimit);
        return `Maximum warning limit updated to ${newLimit} for this group.`;
    },

    // 3. ADMIN COMMAND TO RESET A USER'S WARNS (Usage: .resetwarn @user)
    async resetUserWarns(conn, chatId, targetUser) {
        if (!targetUser) return 'Please mention or reply to the user to reset.';
        if (warnings[chatId]) warnings[chatId][targetUser] = 0;
        return `Warnings reset to 0 for @${targetUser.split('@')[0]}.`;
    }
};
