import { v4 as uuidv4 } from 'uuid';
import { hashApiKey, generateApiKey } from './crypto.js';
import type { ApiKey, ApiKeyOptions, ApiKeyResult, ApiKeyValidation } from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class ApiKeyManager {
	private apiKeys: Map<string, ApiKey> = new Map();
	private storagePath: string | null = null;

	constructor(storagePath?: string) {
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
					this.apiKeys.set(item.id, item);
				}
			}
		} catch (_e) {
			// Start fresh
		}
	}

	async save(): Promise<void> {
		if (!this.storagePath) return;
		const data = Array.from(this.apiKeys.values());
		await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
	}


	async create(userId: string, options?: ApiKeyOptions): Promise<ApiKeyResult> {
		const rawKey = generateApiKey();
		const keyHash = await hashApiKey(rawKey);
		const id = uuidv4();

		const apiKey: ApiKey = {
			id,
			userId,
			keyHash,
			name: options?.name || 'default',
			permissions: options?.permissions || [],
			expiresAt: options?.expiresInMs ? new Date(Date.now() + options.expiresInMs).toISOString() : null,
			createdAt: new Date().toISOString(),
			lastUsedAt: null,
			isActive: true,
		};

		this.apiKeys.set(id, apiKey);
		// [FIX] Better async error handling
		this.save().catch(err => {
			console.error('Failed to save API key:', err.message);
		});

		return { key: rawKey, apiKey };
	}

	async validate(key: string): Promise<ApiKeyValidation> {
		const keyHash = await hashApiKey(key);

		for (const apiKey of this.apiKeys.values()) {
			if (apiKey.keyHash === keyHash && apiKey.isActive) {
				if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
					return { valid: false, userId: '', permissions: [] };
				}

				apiKey.lastUsedAt = new Date().toISOString();

				return {
					valid: true,
					userId: apiKey.userId,
					permissions: apiKey.permissions,
					apiKeyId: apiKey.id,
				};
			}
		}

		return { valid: false, userId: '', permissions: [] };
	}

	revoke(keyId: string): boolean {
		const apiKey = this.apiKeys.get(keyId);
		if (!apiKey) return false;

		apiKey.isActive = false;
		this.apiKeys.set(keyId, apiKey);
		this.save().catch(err => {
			console.error('Failed to save API key after revoke:', err.message);
		});
		return true;
	}

	revokeAllForUser(userId: string): number {
		let count = 0;
		for (const [id, apiKey] of this.apiKeys.entries()) {
			if (apiKey.userId === userId && apiKey.isActive) {
				apiKey.isActive = false;
				this.apiKeys.set(id, apiKey);
				count++;
			}
		}
		if (count > 0) {
			this.save().catch(err => {
				console.error('Failed to save API keys after revokeAll:', err.message);
			});
		}
		return count;
	}

	delete(keyId: string): boolean {
		const result = this.apiKeys.delete(keyId);
		if (result) {
			this.save().catch(err => {
				console.error('Failed to save API key after delete:', err.message);
			});
		}
		return result;
	}

	listForUser(userId: string): ApiKey[] {
		const result: ApiKey[] = [];
		for (const apiKey of this.apiKeys.values()) {
			if (apiKey.userId === userId) {
				result.push(apiKey);
			}
		}
		return result;
	}
}
