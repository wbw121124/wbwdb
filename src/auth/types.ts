// ── Auth Types ──────────────────────────────────────────

export interface User {
	id: string;
	username: string;
	email: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	metadata: string;
}

export interface UserWithPassword extends User {
	passwordHash: string;
}

export interface RegisterInput {
	username: string;
	email: string;
	password: string;
	metadata?: Record<string, unknown>;
}

export interface AuthResult {
	user: User;
	token: string;
	refreshToken?: string;
	sessionId?: string;
}

export interface TokenOptions {
	expiresIn?: string;
	issuer?: string;
	audience?: string;
}

export interface TokenPayload {
	sub: string;
	username: string;
	email: string;
	roles: string[];
	permissions: string[];
	iat: number;
	exp: number;
	iss?: string;
	aud?: string;
}

export interface SessionResult {
	user: User;
	sessionId: string;
	expiresAt: string;
}

export interface SessionOptions {
	expiresInMs?: number;
}

export interface SessionPayload {
	sessionId: string;
	userId: string;
	username: string;
	roles: string[];
	permissions: string[];
	expiresAt: string;
}

export interface Role {
	id: string;
	name: string;
	description: string;
	permissions: string[];
	createdAt: string;
}

export interface RoleInput {
	name: string;
	description?: string;
	permissions?: string[];
}

export interface UserRole {
	id: string;
	userId: string;
	roleId: string;
	assignedAt: string;
}

export interface ApiKey {
	id: string;
	userId: string;
	keyHash: string;
	name: string;
	permissions: string[];
	expiresAt: string | null;
	createdAt: string;
	lastUsedAt: string | null;
	isActive: boolean;
}

export interface ApiKeyOptions {
	name?: string;
	permissions?: string[];
	expiresInMs?: number;
}

export interface ApiKeyResult {
	key: string;
	apiKey: ApiKey;
}

export interface ApiKeyValidation {
	valid: boolean;
	userId: string;
	permissions: string[];
	apiKeyId?: string;
}

export interface OAuthToken {
	id: string;
	userId: string;
	provider: OAuthProvider;
	providerUserId: string;
	accessTokenHash: string;
	refreshTokenHash: string | null;
	expiresAt: string | null;
}

export type OAuthProvider = 'google' | 'github' | 'wechat' | 'qq';

export interface OAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scopes?: string[];
}

export interface OAuthUserInfo {
	id: string;
	username: string;
	email: string;
	displayName?: string;
	avatar?: string;
	provider: OAuthProvider;
}

export interface OAuthUrlResult {
	url: string;
	state: string;
}

export interface AuthContext {
	userId: string;
	username: string;
	roles: string[];
	permissions: string[];
}

export interface AuthOptions {
	jwtSecret: string;
	jwtExpiresIn?: string;
	jwtIssuer?: string;
	sessionExpiresInMs?: number;
	bcryptSaltRounds?: number;
}

export const AUTH_TABLE_PREFIX = '_auth_';
