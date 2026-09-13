"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryOtpStore = createInMemoryOtpStore;
/**
 * In-memory OtpStore — for demos and app tests ONLY (codes vanish on restart
 * and it is single-process). Production apps implement OtpStore on their own
 * table; see docs/INTEGRATION.md for Prisma and raw-SQL recipes.
 */
const crypto_1 = __importDefault(require("crypto"));
function createInMemoryOtpStore() {
    const records = [];
    return {
        async create(data) {
            const record = {
                id: crypto_1.default.randomUUID(),
                channel: data.channel,
                destination: data.destination,
                codeHash: data.codeHash,
                attempts: 0,
                expiresAt: data.expiresAt,
                consumedAt: null,
                createdAt: new Date(),
            };
            records.push(record);
            return record;
        },
        async findLatest(channel, destination) {
            for (let i = records.length - 1; i >= 0; i--) {
                const r = records[i];
                if (r.channel === channel && r.destination === destination)
                    return r;
            }
            return null;
        },
        async incrementAttempts(id) {
            const r = records.find((x) => x.id === id);
            if (r)
                r.attempts += 1;
        },
        async consume(id) {
            const r = records.find((x) => x.id === id);
            if (r)
                r.consumedAt = new Date();
        },
        size: () => records.length,
    };
}
//# sourceMappingURL=memory.js.map