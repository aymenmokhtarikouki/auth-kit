import type { AuthUser, RotatingSessionStore, StaticSessionStore, UserStore } from './types';
export declare function createInMemoryUserStore<P = unknown>(): UserStore<P> & {
    all(): AuthUser<P>[];
};
export declare function createInMemoryRotatingSessionStore(): RotatingSessionStore;
export declare function createInMemoryStaticSessionStore(): StaticSessionStore;
//# sourceMappingURL=memory.d.ts.map