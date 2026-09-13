"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryUserStore = createInMemoryUserStore;
exports.createInMemoryRotatingSessionStore = createInMemoryRotatingSessionStore;
exports.createInMemoryStaticSessionStore = createInMemoryStaticSessionStore;
/** In-memory stores — demos and tests only. Production apps map their own tables. */
const crypto_1 = __importDefault(require("crypto"));
function createInMemoryUserStore() {
    const rows = [];
    const links = new Map(); // `${provider}:${subject}` → userId
    const passwords = new Map();
    return {
        async findById(id) {
            return rows.find((u) => u.id === id) ?? null;
        },
        async findByEmail(email) {
            return rows.find((u) => u.email === email) ?? null;
        },
        async findByPhone(phone) {
            return rows.find((u) => u.phone === phone) ?? null;
        },
        async findByProvider(provider, subject) {
            const userId = links.get(`${provider}:${subject}`);
            return userId ? (await this.findById(userId)) : null;
        },
        async create(data) {
            const user = {
                id: crypto_1.default.randomUUID(),
                email: data.email ?? null,
                phone: data.phone ?? null,
                profile: (data.profile ?? {}),
            };
            rows.push(user);
            return user;
        },
        async linkProvider(userId, provider, subject) {
            links.set(`${provider}:${subject}`, userId);
        },
        async updateContact(userId, patch) {
            const user = rows.find((u) => u.id === userId);
            if (!user)
                throw new Error('not found');
            if (patch.email)
                user.email = patch.email;
            if (patch.phone)
                user.phone = patch.phone;
            return user;
        },
        async getPasswordHash(userId) {
            return passwords.get(userId) ?? null;
        },
        async setPasswordHash(userId, hash) {
            passwords.set(userId, hash);
        },
        all: () => rows,
    };
}
function createInMemoryRotatingSessionStore() {
    const active = new Map();
    return {
        async add(userId, jti, expiresAt) {
            active.set(jti, { userId, expiresAt });
        },
        async isActive(jti) {
            const entry = active.get(jti);
            return !!entry && entry.expiresAt.getTime() > Date.now();
        },
        async revoke(jti) {
            active.delete(jti);
        },
        async revokeAllForUser(userId) {
            for (const [jti, entry] of active)
                if (entry.userId === userId)
                    active.delete(jti);
        },
    };
}
function createInMemoryStaticSessionStore() {
    const tokens = new Map();
    return {
        async set(userId, token) {
            tokens.set(userId, token);
        },
        async get(userId) {
            return tokens.get(userId) ?? null;
        },
    };
}
//# sourceMappingURL=memory.js.map