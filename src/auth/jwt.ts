import jwt from 'jsonwebtoken';
import type { TokenPayload, TokenOptions } from './types.js';

const DEFAULT_SECRET = 'wbwdb-default-secret-change-me';
const DEFAULT_EXPIRES_IN = '24h';
const DEFAULT_ISSUER = 'wbwdb';

export class JwtManager {
	private secret: string;
	private defaultOptions: {
		expiresIn: string;
		issuer: string;
	};

	constructor(secret?: string, options?: { expiresIn?: string; issuer?: string }) {
		this.secret = secret || DEFAULT_SECRET;
		this.defaultOptions = {
			expiresIn: options?.expiresIn || DEFAULT_EXPIRES_IN,
			issuer: options?.issuer || DEFAULT_ISSUER,
		};
	}

	sign(payload: Omit<TokenPayload, 'iat' | 'exp'>, options?: TokenOptions): string {
		const opts: Record<string, unknown> = {
			expiresIn: options?.expiresIn || this.defaultOptions.expiresIn,
			issuer: options?.issuer || this.defaultOptions.issuer,
		};
		if (options?.audience) opts.audience = options.audience;
		return jwt.sign(payload, this.secret, opts);
	}

	verify(token: string): TokenPayload {
		return jwt.verify(token, this.secret, {
			issuer: this.defaultOptions.issuer,
		}) as TokenPayload;
	}

	refresh(token: string, expiresIn?: string): string {
		const payload = this.verify(token);
		const newPayload = {
			sub: payload.sub,
			username: payload.username,
			email: payload.email,
			roles: payload.roles,
			permissions: payload.permissions,
		};
		return this.sign(newPayload, { expiresIn: expiresIn || this.defaultOptions.expiresIn });
	}
}
