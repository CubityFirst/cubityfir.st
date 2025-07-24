// identities.js

// --- Color Presets (for future use) ---
const colorPresets = {
    "Vivid Cerulean": "#0096db",
    "Fiery Rose": "#ff5964",
    "Goldenrod": "#e8be02",
    "Emerald": "#00a76eff",
    "Royal Purple": "#8338ec",
    "Perilous Pink": "#ff00bfff",
    "Rainbow": "Rainbow"
};

// --- Prohibited Usernames ---
// These names cannot be registered by users.
const prohibitedNames = [
    'CubityFirst',
    'System',
    'Guest',
    'User',
    'Anonymous',
    'Admin',
    'Moderator',
    'Technician',
    'Bot'
];

// --- Role Definitions ---
// Defines the properties for each user role.
const roles = {
    admin: {
        isPrivileged: true,
        badge: { icon: '🔧', description: 'Administrator' },
        color: colorPresets["Rainbow"]
    },
    moderator: {
        isPrivileged: true,
        badge: { icon: '⭐', description: 'Moderator' },
        color: colorPresets["Vivid Cerulean"]
    },
    friend: {
        isPrivileged: false,
        badge: { icon: '✨', description: 'Friend' },
        color: colorPresets["Emerald"]
    },
    squid: {
        isPrivileged: false,
        badge: { icon: '🦑', description: 'Squid' },
        color: colorPresets["Perilous Pink"]
    },
    user: {
        isPrivileged: false,
        badge: null,
        color: null
    }
};

// Export the definitions for the server to use
module.exports = {
    roles,
    colorPresets,
    prohibitedNames
};