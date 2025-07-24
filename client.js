const socket = io();

// --- DOM Elements ---
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const nameInput = document.getElementById('name-input');
const tokenInput = document.getElementById('token-input');

// --- State ---
let privilegedTokenList = [];

// --- Cookie Helper Functions ---
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// --- Page Initialization ---
window.addEventListener('load', () => {
    const savedName = getCookie('chat_username');
    const savedToken = getCookie('chat_token');
    if (savedName) nameInput.value = savedName;
    if (savedToken) tokenInput.value = savedToken;
});

nameInput.addEventListener('input', () => setCookie('chat_username', nameInput.value, 365));
tokenInput.addEventListener('input', () => setCookie('chat_token', tokenInput.value, 365));

// --- Helper Functions ---
function isCurrentUserPrivileged() {
    return privilegedTokenList.includes(tokenInput.value);
}

function applyDeletion(messageId) {
    const messageElement = document.getElementById(messageId);
    if (!messageElement) return;

    if (isCurrentUserPrivileged()) {
        messageElement.classList.add('deleted-mod-view');
        const actionBtn = messageElement.querySelector('.delete-icon');
        if (actionBtn) {
            actionBtn.textContent = '↩️';
            actionBtn.classList.remove('delete-icon');
            actionBtn.classList.add('undo-icon');
            actionBtn.onclick = () => {
                socket.emit('restore message', {
                    messageId: messageId,
                    token: tokenInput.value
                });
            };
        }
    } else {
        messageElement.remove();
    }
}

function sendMessage() {
    if (input.value.trim() === '!ping') {
        const startTime = Date.now();
        socket.emit('ping');
        addMessage({
            name: 'System',
            msg: 'Pinging...',
            badge: { icon: '⚙️', description: 'System Account - Not a user' },
            color: '#9a9a9a',
            messageId: 'ping-message',
            rawTimestamp: startTime
        });
        input.value = '';
        input.style.height = 'auto';
        return;
    }

    if (input.value.trim()) {
        socket.emit('chat message', {
            name: nameInput.value,
            msg: input.value,
            token: tokenInput.value
        });
        input.value = '';
        input.style.height = 'auto';
    }
}

function createAndDisplaySystemMessage(msg) {
    const systemMessageData = {
        name: 'System',
        msg: msg,
        badge: { icon: '⚙️', description: 'System Account - Not a user' },
        color: '#9a9a9a',
        messageId: crypto.randomUUID(),
        rawTimestamp: Date.now()
    };
    if (msg.includes('outdated')) {
        systemMessageData.isWarning = true;
    }
    addMessage(systemMessageData);
}

// --- Socket Event Listeners ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
});

socket.on('pong', () => {
    const pingMessageElement = document.getElementById('ping-message');
    if (pingMessageElement) {
        const rtt = Date.now() - pingMessageElement.dataset.timestamp;
        const content = pingMessageElement.querySelector('.message-text');
        if (content) {
            content.textContent = `Pong! Round-trip time: ${rtt}ms`;
        }
        pingMessageElement.id = `msg-${crypto.randomUUID()}`;
    }
});

socket.on('chat history', (history) => {
    const fragment = document.createDocumentFragment();
    history.forEach(data => {
        const messageElement = addMessage(data, true);
        fragment.appendChild(messageElement);
    });
    messages.appendChild(fragment);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('user stats', (stats) => {
    createAndDisplaySystemMessage(`Welcome! There are currently ${stats.active} active and ${stats.away} away users.`);
});

socket.on('registration success', (data) => {
    nameInput.value = data.username;
    tokenInput.value = data.token;
    setCookie('chat_username', data.username, 365);
    setCookie('chat_token', data.token, 365);
});

socket.on('chat message', (data) => addMessage(data));
socket.on('message deleted', (data) => applyDeletion(data.messageId));
socket.on('messages nuked', (data) => data.messageIds.forEach(id => applyDeletion(id)));

socket.on('force refresh', () => {
    location.reload(true);
});

socket.on('chat cleared', () => {
    if (!isCurrentUserPrivileged()) {
        messages.innerHTML = '';
    }
});

socket.on('connection details', (details) => {
    if (details.privilegedTokens) {
        privilegedTokenList = details.privilegedTokens;
    }
});

// --- Message Rendering ---
function addMessage(data, isHistory = false) {
    const existingMessage = document.getElementById(data.messageId);
    if (existingMessage) existingMessage.remove();

    const item = document.createElement('li');
    item.id = data.messageId;
    item.dataset.timestamp = data.rawTimestamp;

    if (data.isWarning) {
        item.classList.add('warning-message');
    }

    const timestampElement = document.createElement('span');
    timestampElement.className = 'timestamp';
    const date = new Date(data.rawTimestamp);
    timestampElement.textContent = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    item.appendChild(timestampElement);

    if (data.badge) {
        item.classList.add('verified');
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = data.badge.icon;
        badge.title = data.badge.description;

        if (data.badge.icon === '🔧') {
            badge.classList.add('wrench');
        } else if (data.badge.icon === '⚙️') {
            badge.classList.add('cog');
        } else if (data.badge.icon === '🦑') {
            badge.classList.add('squid');
            badge.addEventListener('click', () => {
                const whaleSound = new Audio('/resources/sounds/whale.mp3');
                whaleSound.play();
            });
        }
        
        if (data.name === 'System') {
             item.classList.add('system-message');
        }

        item.appendChild(badge);
    }

    const nameElement = document.createElement('span');
    nameElement.className = 'name';
    nameElement.textContent = data.name;
    if (data.color) {
        nameElement.style.color = data.color;
    }
    item.appendChild(nameElement);

    const msgElement = document.createElement('span');
    msgElement.className = 'message-text';
    msgElement.innerHTML = data.msg;
    item.appendChild(msgElement);

    if (isCurrentUserPrivileged() && data.name !== 'System') {
        const deleteButton = document.createElement('span');
        deleteButton.className = 'delete-icon';
        deleteButton.textContent = '🗑️';
        deleteButton.onclick = () => {
            socket.emit('delete message', {
                messageId: data.messageId,
                token: tokenInput.value
            });
        };
        item.appendChild(deleteButton);
    }

    if (!isHistory) {
        const isScrolledToBottom = messages.scrollHeight - messages.clientHeight <= messages.scrollTop + 1;
        let inserted = false;
        for (const existing of messages.children) {
            if (data.rawTimestamp < existing.dataset.timestamp) {
                messages.insertBefore(item, existing);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            messages.appendChild(item);
        }
        if (isScrolledToBottom) {
            messages.scrollTop = messages.scrollHeight;
        }
    }
    
    return item;
}