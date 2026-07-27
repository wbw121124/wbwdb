import { v4 as uuidv4 } from 'uuid';
import { hashToken, generateToken } from './crypto.js';
import type { SessionPayload, SessionResult, SessionOptions, User } from './types.js';

export class SessionManager {
	private sessions: Map<string, SessionPayload> = new Map();
	private defaultExpiresInMs: number;

	constructor(defaultExpiresInMs?: number) {
		this.defaultExpiresInMs = defaultExpiresInMs || 7 * 24 * 60 * 60 * 1000;
	}

	create(user: User, roles: string[], permissions: string[], options?: SessionOptions): SessionResult {
		const sessionId = uuidv4();
		const expiresInMs = options?.expiresInMs || this.defaultExpiresInMs;
		const expiresAt = new Date(Date.now() + expiresInMs).toISOString();

		const payload: SessionPayload = {
			sessionId,
			userId: user.id,
			username: user.username,
			roles,
			permissions,
			expiresAt,
		};

		this.sessions.set(sessionId, payload);

		return {
			user,
			sessionId,
			expiresAt,
		};
	}

	validate(sessionId: string): SessionPayload | null {
		const payload = this.sessions.get(sessionId);
		if (!payload) return null;

		if (new Date(payload.expiresAt) < new Date()) {
			this.sessions.delete(sessionId);
			return null;
		}

		return payload;
	}

	destroy(sessionId: string): boolean {
		return this.sessions.delete(sessionId);
	}

	destroyAllForUser(userId: string): number {
		let count = 0;
		for (const [id, payload] of this.sessions.entries()) {
			if (payload.userId === userId) {
				this.sessions.delete(id);
				count++;
			}
		}
		return count;
	}

	clean(): number {
		let count = 0;
		const now = new Date();
		for (const [id, payload] of this.sessions.entries()) {
			if (new Date(payload.expiresAt) < now) {
				this.sessions.delete(id);
				count++;
			}
		}
		return count;
	}

	getToken(): string {
		return generateToken();
	}

	hashToken(token: string): string {
		return hashToken(token);
	}
}
