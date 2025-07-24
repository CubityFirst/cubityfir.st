const http = require('http');
const { Server } = require("socket.io");
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- Identity & Configuration Import ---
const { roles, prohibitedNames } = require('./identities.js');

// --- Core App Initialization ---
const server = http.createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, url);
    const ext = path.extname(filePath);

    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.mp3': 'audio/mpeg'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// --- Socket.IO Initialization ---
const io = new Server(server);

// --- Emote Discovery ---
const emoteMap = {};
const emotesDir = path.join(__dirname, 'resources', 'emotes');
try {
    const emoteFiles = fs.readdirSync(emotesDir);
    emoteFiles.forEach(file => {
        const emoteName = path.parse(file).name;
        emoteMap[emoteName] = path.join('/resources', 'emotes', file).replace(/\\/g, '/');
    });
    console.log(`Loaded ${Object.keys(emoteMap).length} emotes.`);
} catch (err) {
    console.log('No emotes directory found or no emotes loaded.');
}

// --- Data for Simulation Command ---
const SIM_USERS = ['Alex', 'Dev_Dave', 'QA_Queen', 'PixelPusher', 'SysAdminSue', 'FrontendFrank', 'BackendBetty'];
const SIM_MESSAGES = [
    'How do I get a cool badge like the admins? :smile:',
    'Okay, testing the multi-line feature.\nThis is line two!',
    'My build keeps failing, time to debug. ☕',
    'Is anyone around from the UK? It\'s pretty late here.',
    'I wonder if we could add custom themes... that would be neat.',
    'The performance on this is actually really solid.',
    'Whoa, that was a close call! :bingShy:',
    'Don\'t mind me, just a humble simulated user passing through.',
    'Has anyone tried the !stalk command yet? :pog:',
    'The custom colors for mods look great!'
];

// --- State Management ---
const messageHistory = [];
const MAX_HISTORY = 200;
const timedOutUsers = new Map();
let lastNukedMessages = [];
const activeNukes = new Set();
let registeredOnlyMode = false;
const registeredUsers = new Map();
const connectedUsers = new Map();
const usersFilePath = path.join(__dirname, 'users.json');
const mutesFilePath = path.join(__dirname, 'mutes.json');

// --- Helper Functions for User Management ---
let tokenWords = [];
try {
    const wordlistPath = path.join(__dirname, 'wordlist.json');
    const data = fs.readFileSync(wordlistPath, 'utf8');
    tokenWords = JSON.parse(data);
    console.log(`Loaded ${tokenWords.length} words for token generation.`);
} catch (err) {
    console.error('Error loading wordlist.json:', err);
    tokenWords = ['Apple', 'River', 'Forest', 'Eagle']; // Fallback
}

function generateUserToken() {
    const randomWords = Array.from({ length: 6 }, () => tokenWords[Math.floor(Math.random() * tokenWords.length)]);
    return randomWords.join('-');
}

function loadUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            const users = JSON.parse(data);
            for (const username in users) {
                const userData = users[username];
                if (!userData.originalCase) {
                    userData.originalCase = username;
                }
                registeredUsers.set(username.toLowerCase(), userData);
            }
            console.log(`Loaded ${registeredUsers.size} registered users.`);
        } else {
            fs.writeFileSync(usersFilePath, '{}');
            console.log('Created new users.json file.');
        }
    } catch (err) {
        console.error('Error loading users.json:', err);
    }
}

function saveUsers() {
    const usersObject = {};
    for (const value of registeredUsers.values()) {
        if (value && value.originalCase) {
            usersObject[value.originalCase] = value;
        }
    }
    fs.writeFile(usersFilePath, JSON.stringify(usersObject, null, 2), (err) => {
        if (err) console.error('Error saving users.json:', err);
    });
}

function loadMutes() {
    try {
        if (fs.existsSync(mutesFilePath)) {
            const data = fs.readFileSync(mutesFilePath, 'utf8');
            const mutes = JSON.parse(data);
            for (const username in mutes) {
                timedOutUsers.set(username, mutes[username]);
            }
            console.log(`Loaded ${timedOutUsers.size} persistent mutes/bans.`);
        } else {
            fs.writeFileSync(mutesFilePath, '{}');
        }
    } catch (err) {
        console.error('Error loading mutes.json:', err);
    }
}

function saveMutes() {
    const mutesObject = Object.fromEntries(timedOutUsers);
    fs.writeFile(mutesFilePath, JSON.stringify(mutesObject, null, 2), (err) => {
        if (err) console.error('Error saving mutes.json:', err);
    });
}
loadUsers();
loadMutes();

// --- Other Helper Functions ---
function parseDuration(durationStr) {
    if (!durationStr) return null;
    const match = durationStr.match(/^(\d+)(s|m|h|d|mo|y)$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];
    let milliseconds = 0;

    switch (unit) {
        case 's':
            milliseconds = value * 1000;
            break;
        case 'm':
            milliseconds = value * 60 * 1000;
            break;
        case 'h':
            milliseconds = value * 60 * 60 * 1000;
            break;
        case 'd':
            milliseconds = value * 24 * 60 * 60 * 1000;
            break;
        case 'mo':
            milliseconds = value * 30 * 24 * 60 * 60 * 1000; // Approximation
            break;
        case 'y':
            milliseconds = value * 365 * 24 * 60 * 60 * 1000; // Approximation
            break;
    }
    return milliseconds;
}

function logMessage(message) {
    const now = new Date();
    const formattedTimestamp = new Date(message.rawTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const folderName = `${year}-${month}`;
    const fileName = `${year}-${month}-${day}.log`;
    const logDir = path.join(__dirname, 'messages', folderName);
    const logFile = path.join(logDir, fileName);
    fs.mkdirSync(logDir, { recursive: true });
    const logEntry = `[${formattedTimestamp}] ${message.name}: ${message.msg}`;
    fs.appendFile(logFile, logEntry + '\n', (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
}

function createSystemMessage(msg) {
    const messagePayload = {
        name: 'System',
        msg,
        badge: { icon: '⚙️', description: 'System Account - Not a user' },
        color: '#9a9a9a',
        messageId: crypto.randomUUID(),
        rawTimestamp: Date.now()
    };
    logMessage({ ...messagePayload, msg });
    return { messagePayload, broadcast: () => io.emit('chat message', messagePayload) };
}

function parseMessage(text) {
    let sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;
    processedText = sanitizedText.replace(urlRegex, (url) => {
        let href = url;
        if (!href.startsWith('http')) {
            href = 'https://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    processedText = processedText.replace(/:(\w+):/g, (match, emoteName) => {
        if (emoteMap[emoteName]) {
            return `<img class="emote" src="${emoteMap[emoteName]}" alt="${match}" title="${match}">`;
        }
        return match;
    });
    return processedText;
}

// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    connectedUsers.set(socket.id, { name: 'Anonymous', lastMessageTime: Date.now() });
    
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
    const recentHistory = messageHistory.filter(msg => msg.rawTimestamp >= fifteenMinutesAgo);
    socket.emit('chat history', recentHistory);

    const now = Date.now();
    const uniqueUsers = new Map();
    for (const user of connectedUsers.values()) {
        const isAway = (now - user.lastMessageTime) > fifteenMinutesAgo;
        if (user.name !== 'Anonymous') {
            if (!uniqueUsers.has(user.name) || (uniqueUsers.has(user.name) && !isAway)) {
                uniqueUsers.set(user.name, isAway);
            }
        }
    }
    const activeCount = [...uniqueUsers.values()].filter(isAway => !isAway).length;
    const awayCount = uniqueUsers.size - activeCount;
    socket.emit('user stats', { active: activeCount, away: awayCount });

    const privilegedTokens = [];
    for (const user of registeredUsers.values()) {
        if (user.role && roles[user.role]?.isPrivileged) {
            privilegedTokens.push(user.token);
        }
    }
    socket.emit('connection details', { 
        privilegedTokens
    });

    socket.on('chat message', (data) => {
        if (data.name && data.name.length > 33) {
            const errorMsg = createSystemMessage('Your username cannot exceed 33 characters.').messagePayload;
            return socket.emit('chat message', errorMsg);
        }
        if (data.msg.trim().startsWith('!register ')) {
            const args = data.msg.trim().split(' ');
            const username = args[1];
            if (prohibitedNames.map(n => n.toLowerCase()).includes(username.toLowerCase())) {
                return socket.emit('chat message', createSystemMessage(`Username "${username}" is prohibited and cannot be registered.`).messagePayload);
            }
            if (!username || username.length < 3 || username.length > 33) {
                return socket.emit('chat message', createSystemMessage('Username must be 3-33 characters long.').messagePayload);
            }
            if (registeredUsers.has(username.toLowerCase())) {
                return socket.emit('chat message', createSystemMessage(`Username "${username}" is already taken.`).messagePayload);
            }
            const token = generateUserToken();
            registeredUsers.set(username.toLowerCase(), { token, role: 'user', originalCase: username });
            saveUsers();
            socket.emit('registration success', { username, token });
            const successMsg = `You have registered "${username}". Your details have been automatically filled in.\n\nIMPORTANT: Save your private token below. It will NOT be shown again!\n\n${token}`;
            socket.emit('chat message', createSystemMessage(successMsg).messagePayload);
            return;
        }
        
        let finalName = data.name || 'Anonymous';
        connectedUsers.set(socket.id, { name: finalName, lastMessageTime: Date.now() });

        if (data.msg.trim() === '!emotes') {
            const emoteList = Object.keys(emoteMap).map(name => `:${name}:`).join(' ');
            const systemMessageText = emoteList ? `Available emotes: ${emoteList}` : 'There are no emotes available.';
            socket.emit('chat message', createSystemMessage(systemMessageText).messagePayload);
            return;
        }
        if (data.msg.trim() === '!users') {
            const now = Date.now();
            const fifteenMinutes = 15 * 60 * 1000;
            const userList = new Map();
            const activeUsers = [...connectedUsers.values()].filter(user => user.name !== 'Anonymous');
            for (const u of activeUsers) {
                const isAway = (now - u.lastMessageTime) > fifteenMinutes;
                if (!userList.has(u.name) || (userList.has(u.name) && !isAway)) {
                    userList.set(u.name, isAway);
                }
            }
            if (userList.size === 0) {
                return socket.emit('chat message', createSystemMessage('No other users have spoken yet.').messagePayload);
            }
            const active = [];
            const away = [];
            for (const [name, isAway] of userList.entries()) {
                if (isAway) {
                    away.push(name);
                } else {
                    active.push(name);
                }
            }
            let message = '';
            if (active.length > 0) {
                message += `Active Users (${active.length}): ${active.sort().join(', ')}\n`;
            }
            if (away.length > 0) {
                message += `Away Users (${away.length}): ${away.sort().join(', ')}`;
            }
            socket.emit('chat message', createSystemMessage(message.trim()).messagePayload);
            return;
        }
        
        let roleInfo = roles['user'];
        let isPrivileged = false;
        const user = registeredUsers.get(finalName.toLowerCase());
        
        if (user) {
            if (data.token !== user.token) {
                return socket.emit('chat message', createSystemMessage(`Invalid token for user "${finalName}". Message not sent.`).messagePayload);
            }
            roleInfo = roles[user.role] || roles['user'];
            finalName = user.originalCase || finalName;
        } else {
            if (registeredUsers.has(finalName.toLowerCase())) {
                return socket.emit('chat message', createSystemMessage(`You must provide a valid token to use the name "${finalName}".`).messagePayload);
            }
        }
        
        if (data.msg.trim() === '!reregister') {
            if (!user) {
                return socket.emit('chat message', createSystemMessage('Only registered users can reregister their token.').messagePayload);
            }
            const newToken = generateUserToken();
            user.token = newToken;
            registeredUsers.set(finalName.toLowerCase(), user);
            saveUsers();
            socket.emit('registration success', { username: finalName, token: newToken });
            const successMsg = `You have reregistered "${finalName}". Your details have been updated.\n\nIMPORTANT: Save your new private token below. It will NOT be shown again!\n\n${newToken}`;
            socket.emit('chat message', createSystemMessage(successMsg).messagePayload);
            return;
        }

        isPrivileged = roleInfo.isPrivileged;
        
        if (!isPrivileged && timedOutUsers.has(finalName)) {
            const muteInfo = timedOutUsers.get(finalName);
            if (muteInfo.banned) {
                const reason = muteInfo.reason || 'No reason specified.';
                socket.emit('chat message', createSystemMessage(`You are currently banned indefinitely. Reason: ${reason}`).messagePayload);
                return;
            }
            if (muteInfo.expires && Date.now() < muteInfo.expires) {
                const remainingSeconds = Math.round((muteInfo.expires - Date.now()) / 1000);
                const reason = muteInfo.reason || 'No reason specified.';
                socket.emit('chat message', createSystemMessage(`You are still muted for ${remainingSeconds} seconds. Reason: ${reason}`).messagePayload);
                return;
            } else if (muteInfo.expires && Date.now() >= muteInfo.expires) {
                timedOutUsers.delete(finalName);
                saveMutes();
            }
        }

        if (isPrivileged && data.msg.startsWith('!')) {
            const [command, ...args] = data.msg.split(' ');
            if (command === '!restart') {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                createSystemMessage(`Server is shutting down in 5 seconds at the command of ${finalName}.`).broadcast();
                setTimeout(() => {
                    process.exit(0);
                }, 5000);
                return;
            }
            if (command === '!refreshall') {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                createSystemMessage(`Refresh initiated by ${finalName}. All clients will be refreshed over the next 30 seconds.`).broadcast();
                const connectedSockets = io.sockets.sockets;
                connectedSockets.forEach((socketInstance) => {
                    const delay = Math.random() * 30000;
                    setTimeout(() => {
                        socketInstance.emit('force refresh');
                    }, delay);
                });
                return;
            }
            if (command === '!regonly' && args.length >= 1) {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                const state = args[0].toLowerCase();
                if (state === 'on') {
                    registeredOnlyMode = true;
                    createSystemMessage('Chat is now in registered-only mode.').broadcast();
                } else if (state === 'off') {
                    registeredOnlyMode = false;
                    createSystemMessage('Chat has been opened to all users.').broadcast();
                } else {
                    socket.emit('chat message', createSystemMessage('Invalid usage. Use !regonly on|off').messagePayload);
                }
                return;
            }
            if (command === '!setrole' && args.length >= 2) {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                const targetUsername = args[0];
                const newRole = args[1].toLowerCase();
                const targetUser = registeredUsers.get(targetUsername.toLowerCase());
                if (!targetUser) {
                    return createSystemMessage(`Error: User "${targetUsername}" is not a registered user.`).broadcast();
                }
                if (!roles[newRole]) {
                    return createSystemMessage(`Error: "${newRole}" is not a valid role. Valid roles are: ${Object.keys(roles).join(', ')}.`).broadcast();
                }
                targetUser.role = newRole;
                registeredUsers.set(targetUsername.toLowerCase(), targetUser);
                saveUsers();
                createSystemMessage(`User ${targetUser.originalCase}'s role has been set to ${newRole} by ${finalName}.`).broadcast();
                return;
            }
            if (command === '!deluser' && args.length >= 1) {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                const targetUsername = args[0];
                const targetUserKey = targetUsername.toLowerCase();
                const targetUserData = registeredUsers.get(targetUserKey);
                if (!targetUserData) {
                    return createSystemMessage(`Error: User "${targetUsername}" not found.`).broadcast();
                }
                if (targetUserData.role === 'admin') {
                    return createSystemMessage(`Error: Admins cannot be deleted.`).broadcast();
                }
                registeredUsers.delete(targetUserKey);
                saveUsers();
                createSystemMessage(`User ${targetUsername} has been deleted by ${finalName}.`).broadcast();
                return;
            }
            if (command === '!clear') {
                messageHistory.length = 0;
                io.emit('chat cleared');
                createSystemMessage(`${finalName} has cleared the chat for non-privileged users.`).broadcast();
                return;
            }
            if (command === '!mute' && args.length >= 1) {
                const userToMute = args[0];
                let durationStr = '5m';
                let reason = args.slice(1).join(' ');
                if (args.length >= 2 && parseDuration(args[1])) {
                    durationStr = args[1];
                    reason = args.slice(2).join(' ');
                }
                const durationMs = parseDuration(durationStr);
                if (durationMs) {
                    timedOutUsers.set(userToMute, {
                        expires: Date.now() + durationMs,
                        reason: reason || 'No reason specified.'
                    });
                    saveMutes();
                    createSystemMessage(`${userToMute} has been muted for ${durationStr}. Reason: ${reason || 'N/A'}`).broadcast();
                }
                return;
            }
            if (command === '!ban' && args.length >= 1) {
                if (user.role !== 'admin') {
                    return socket.emit('chat message', createSystemMessage('You must be an Admin to use this command.').messagePayload);
                }
                const userToBan = args[0];
                const reason = args.slice(1).join(' ');
                timedOutUsers.set(userToBan, {
                    banned: true,
                    reason: reason || 'No reason specified.'
                });
                saveMutes();
                createSystemMessage(`${userToBan} has been banned indefinitely by ${finalName}. Reason: ${reason || 'N/A'}`).broadcast();
                return;
            }
            if (command === '!unmute' && args.length >= 1) {
                const userToUnmute = args[0];
                if (timedOutUsers.delete(userToUnmute)) {
                    saveMutes();
                    createSystemMessage(`${userToUnmute} has been unmuted.`).broadcast();
                } else {
                    createSystemMessage(`${userToUnmute} is not currently muted.`).broadcast();
                }
                return;
            }
            if (command === '!nuke' && args.length >= 1) {
                const wordToNuke = args[0].toLowerCase();
                const durationStr = args[1] || '5m';
                const durationMs = parseDuration(durationStr) || 5 * 60 * 1000;
                const messagesToNuke = messageHistory
                    .filter(msg => msg.originalMsg && msg.rawTimestamp >= (Date.now() - durationMs) && msg.originalMsg.toLowerCase().includes(wordToNuke));
                if (messagesToNuke.length > 0) {
                    lastNukedMessages = [...messagesToNuke];
                    const idsToDelete = messagesToNuke.map(msg => msg.messageId);
                    const usersToMute = new Set(messagesToNuke.map(msg => msg.name).filter(name => {
                        const userToTest = registeredUsers.get(name.toLowerCase());
                        return !(userToTest && roles[userToTest.role]?.isPrivileged);
                    }));
                    const tenMinutes = 10 * 60 * 1000;
                    usersToMute.forEach(u => timedOutUsers.set(u, Date.now() + tenMinutes));
                    io.emit('messages nuked', { messageIds: idsToDelete });
                    for (let i = messageHistory.length - 1; i >= 0; i--) {
                        if (idsToDelete.includes(messageHistory[i].messageId)) messageHistory.splice(i, 1);
                    }
                    activeNukes.add(wordToNuke);
                    let systemMessage = `Nuked ${idsToDelete.length} message(s). The word "${wordToNuke}" is now being filtered.`;
                    if (usersToMute.size > 0) {
                        systemMessage += ` Muted users for 10m: ${[...usersToMute].join(', ')}.`;
                    }
                    createSystemMessage(systemMessage).broadcast();
                }
                return;
            }
            if (command === '!aegis') {
                const actionsTaken = [];
                if (lastNukedMessages.length > 0) {
                    actionsTaken.push(`restored ${lastNukedMessages.length} message(s)`);
                    lastNukedMessages.forEach(msg => {
                        messageHistory.push(msg);
                        io.emit('chat message', msg);
                    });
                    lastNukedMessages = [];
                }
                if (timedOutUsers.size > 0) {
                    actionsTaken.push(`unmuted ${timedOutUsers.size} user(s)`);
                    timedOutUsers.clear();
                }
                if (activeNukes.size > 0) {
                    actionsTaken.push(`cleared ${activeNukes.size} active word filter(s)`);
                    activeNukes.clear();
                }
                if (actionsTaken.length > 0) {
                    createSystemMessage(`Aegis has been activated: ${actionsTaken.join(' and ')}`).broadcast();
                } else {
                    createSystemMessage('Aegis activated, but there was nothing to reverse.').broadcast();
                }
                return;
            }
            if (command === '!simulate') {
                const count = Math.min(parseInt(args[0], 10) || 5, 50);
                createSystemMessage(`Starting simulation of ${count} messages...`).broadcast();
                let cumulativeDelay = 0;
                for (let i = 0; i < count; i++) {
                    const randomDelay = Math.random() * 800 + 200;
                    cumulativeDelay += randomDelay;
                    setTimeout(() => {
                        const randomUser = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
                        const randomMessage = SIM_MESSAGES[Math.floor(Math.random() * SIM_MESSAGES.length)];
                        const now = new Date();
                        const parsedMessage = parseMessage(randomMessage);
                        const messagePayload = {
                            name: randomUser, msg: parsedMessage, originalMsg: randomMessage,
                            badge: null, color: null, messageId: crypto.randomUUID(),
                            rawTimestamp: now.getTime()
                        };
                        logMessage({ ...messagePayload, msg: randomMessage, timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
                        messageHistory.push(messagePayload);
                        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
                        io.emit('chat message', messagePayload);
                    }, cumulativeDelay);
                }
                return;
            }
            if (command === '!stalk' && args.length >= 1) {
                const targetUser = args[0];
                const userHistory = messageHistory
                    .filter(msg => msg.name.toLowerCase() === targetUser.toLowerCase())
                    .slice(-10);
                if (userHistory.length === 0) {
                    createSystemMessage(`No recent messages found for user "${targetUser}".`).broadcast();
                } else {
                    const report = userHistory
                        .map(msg => `[${new Date(msg.rawTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${msg.originalMsg}`)
                        .join('\n');
                    createSystemMessage(`Last ${userHistory.length} messages from ${targetUser}:\n${report}`).broadcast();
                }
                return;
            }
        }
        if (!isPrivileged) {
            for (const nukedWord of activeNukes) {
                if (data.msg.toLowerCase().includes(nukedWord)) {
                    const tenMinutes = 10 * 60 * 1000;
                    timedOutUsers.set(finalName, Date.now() + tenMinutes);
                    createSystemMessage(`A message from ${finalName} was blocked due to a word filter. User has been muted for 10m.`).broadcast();
                    return;
                }
            }
        }
        const parsedMessage = parseMessage(data.msg);
        const messagePayload = {
            name: finalName,
            msg: parsedMessage,
            originalMsg: data.msg,
            badge: roleInfo.badge,
            color: roleInfo.color,
            messageId: crypto.randomUUID(),
            rawTimestamp: Date.now()
        };
        logMessage({ ...messagePayload, msg: data.msg, timestamp: new Date(messagePayload.rawTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        messageHistory.push(messagePayload);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
        io.emit('chat message', messagePayload);
    });
    socket.on('ping', () => {
        socket.emit('pong');
    });
    socket.on('delete message', (data) => {
        const user = [...registeredUsers.values()].find(u => u.token === data.token);
        if (user && roles[user.role]?.isPrivileged) {
            io.emit('message deleted', { messageId: data.messageId });
        }
    });
    socket.on('restore message', (data) => {
        const user = [...registeredUsers.values()].find(u => u.token === data.token);
        if (user && roles[user.role]?.isPrivileged) {
            const messageToRestore = messageHistory.find(msg => msg.messageId === data.messageId);
            if (messageToRestore) {
                io.emit('chat message', messageToRestore);
            }
        }
    });
    socket.on('disconnect', () => {
        connectedUsers.delete(socket.id);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT} 🚀`));