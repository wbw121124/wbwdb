import { v4 as uuidv4 } from 'uuid';
import { hashToken, generateToken } from './crypto.js';
import type { SessionPayload, SessionResult, SessionOptions, User } from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class SessionManager {
	private sessions: Map<string, SessionPayload> = new Map();
	private defaultExpiresInMs: number;
	private storagePath: string | null = null;

	constructor(defaultExpiresInMs?: number, storagePath?: string) {
		this.defaultExpiresInMs = defaultExpiresInMs || 7 * 24 * 60 * 60 * 1000;
		this.storagePath = storagePath || null;
	}

	async init(): Promise<void> {
		if (!this.storagePath) return;
		try {
			await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
			const content = await fs.readFile(this.storagePath, 'utf-8');
			const data = JSON.parse(content);
			if (Array.isArray(data)) {
				for (const item of data) {
					this.sessions.set(item.sessionId, item);
				}
			}
		} catch (_e) {
			// File doesn't exist or is invalid, start fresh
		}
	}

	async save(): Promise<void> {
		if (!this.storagePath) return;
		const data = Array.from(this.sessions.values());
		await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
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
		// [FIX] Better async error handling
		this.save().catch(err => {
			console.error('Failed to save session:', err.message);
		});
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
			this.save().catch(err => {
				console.error('Failed to save session after expiry:', err.message);
			});
			return null;
		}
		return payload;
	}

	destroy(sessionId: string): boolean {
		const result = this.sessions.delete(sessionId);
		if (result) {
			this.save().catch(err => {
				console.error('Failed to save session after destroy:', err.message);
			});
		}
		return result;
	}

	destroyAllForUser(userId: string): number {
		let count = 0;
		for (const [id, payload] of this.sessions.entries()) {
			if (payload.userId === userId) {
				this.sessions.delete(id);
				count++;
			}
		}
		if (count > 0) {
			this.save().catch(err => {
				console.error('Failed to save sessions after destroyAll:', err.message);
			});
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
		if (count > 0) {
			this.save().catch(err => {
				console.error('Failed to save sessions after clean:', err.message);
			});
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
