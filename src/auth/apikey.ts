import { v4 as uuidv4 } from 'uuid';
import { hashApiKey, generateApiKey } from './crypto.js';
import type { ApiKey, ApiKeyOptions, ApiKeyResult, ApiKeyValidation } from './types.js';

export class ApiKeyManager {
	private apiKeys: Map<string, ApiKey> = new Map();

	create(userId: string, options?: ApiKeyOptions): ApiKeyResult {
		const rawKey = generateApiKey();
		const keyHash = hashApiKey(rawKey);
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

		return { key: rawKey, apiKey };
	}

	validate(key: string): ApiKeyValidation {
		const keyHash = hashApiKey(key);

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
		return count;
	}

	delete(keyId: string): boolean {
		return this.apiKeys.delete(keyId);
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
