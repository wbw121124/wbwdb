import { v4 as uuidv4 } from 'uuid';
import type { wbwdbManager } from '../index.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { JwtManager } from './jwt.js';
import { SessionManager } from './session.js';
import { OAuthClient } from './oauth.js';
import { ApiKeyManager } from './apikey.js';
import type {
	User, UserWithPassword, RegisterInput, AuthResult,
	TokenOptions, TokenPayload, SessionOptions, SessionPayload, SessionResult,
	Role, RoleInput, UserRole, ApiKey, ApiKeyOptions, ApiKeyResult, ApiKeyValidation,
	OAuthProvider, OAuthConfig, OAuthUrlResult, OAuthUserInfo,
	AuthContext, AuthOptions,
} from './types.js';

export class Auth {
	private db: wbwdbManager;
	private jwt: JwtManager;
	private sessions: SessionManager;
	private oauth: OAuthClient;
	private apiKeys: ApiKeyManager;

	private users: Map<string, UserWithPassword> = new Map();
	private usersByUsername: Map<string, string> = new Map();
	private usersByEmail: Map<string, string> = new Map();
	private roles: Map<string, Role> = new Map();
	private rolesByName: Map<string, string> = new Map();
	private userRoles: Map<string, UserRole> = new Map();
	private authContext: AuthContext | null = null;

	constructor(db: wbwdbManager, options?: AuthOptions) {
		this.db = db;
		this.jwt = new JwtManager(options?.jwtSecret, {
			expiresIn: options?.jwtExpiresIn,
			issuer: options?.jwtIssuer,
		});
		this.sessions = new SessionManager(options?.sessionExpiresInMs);
		this.oauth = new OAuthClient();
		this.apiKeys = new ApiKeyManager();
	}

	async init(): Promise<void> {
		await this.loadUsers();
		await this.loadRoles();
		await this.loadUserRoles();
	}

	private async loadUsers(): Promise<void> {
		const tablePath = `${this.db.rootdir}/auth/users.json`;
		try {
			const fs = await import('node:fs/promises');
			const content = await fs.readFile(tablePath, 'utf-8');
			const table = JSON.parse(content) as any;
			if (table?.rows) {
				for (const row of table.rows) {
					const r = row.row || row;
					const user: UserWithPassword = {
						id: r.id,
						username: r.username,
						email: r.email,
						passwordHash: r.passwordHash,
						isActive: r.isActive === 'true' || r.isActive === true,
						createdAt: r.createdAt,
						updatedAt: r.updatedAt,
						metadata: r.metadata || '{}',
					};
					this.users.set(user.id, user);
					this.usersByUsername.set(user.username, user.id);
					this.usersByEmail.set(user.email, user.id);
				}
			}
		} catch {
			// File doesn't exist yet
		}
	}

	private async loadRoles(): Promise<void> {
		const tablePath = `${this.db.rootdir}/auth/roles.json`;
		try {
			const fs = await import('node:fs/promises');
			const content = await fs.readFile(tablePath, 'utf-8');
			const table = JSON.parse(content) as any;
			if (table?.rows) {
				for (const row of table.rows) {
					const r = row.row || row;
					const role: Role = {
						id: r.id,
						name: r.name,
						description: r.description || '',
						permissions: r.permissions ? JSON.parse(r.permissions) : [],
						createdAt: r.createdAt,
					};
					this.roles.set(role.id, role);
					this.rolesByName.set(role.name, role.id);
				}
			}
		} catch {
			// File doesn't exist yet
		}
	}

	private async loadUserRoles(): Promise<void> {
		const tablePath = `${this.db.rootdir}/auth/user_roles.json`;
		try {
			const fs = await import('node:fs/promises');
			const content = await fs.readFile(tablePath, 'utf-8');
			const table = JSON.parse(content) as any;
			if (table?.rows) {
				for (const row of table.rows) {
					const r = row.row || row;
					const ur: UserRole = {
						id: r.id,
						userId: r.userId,
						roleId: r.roleId,
						assignedAt: r.assignedAt,
					};
					this.userRoles.set(ur.id, ur);
				}
			}
		} catch {
			// File doesn't exist yet
		}
	}

	private async saveUsers(): Promise<void> {
		const dir = `${this.db.rootdir}/auth`;
		const fs = await import('node:fs/promises');
		await fs.mkdir(dir, { recursive: true });

		const rows = Array.from(this.users.values()).map(u => ({
			id: u.id,
			row: {
				id: u.id,
				username: u.username,
				email: u.email,
				passwordHash: u.passwordHash,
				isActive: u.isActive,
				createdAt: u.createdAt,
				updatedAt: u.updatedAt,
				metadata: u.metadata,
			}
		}));
		const table = { name: '_auth_users', rows, cnt: rows.length };
		await fs.writeFile(`${dir}/users.json`, JSON.stringify(table, null, 2), 'utf-8');
	}

	private async saveRoles(): Promise<void> {
		const dir = `${this.db.rootdir}/auth`;
		const fs = await import('node:fs/promises');
		await fs.mkdir(dir, { recursive: true });

		const rows = Array.from(this.roles.values()).map(r => ({
			id: r.id,
			row: {
				id: r.id,
				name: r.name,
				description: r.description,
				permissions: JSON.stringify(r.permissions),
				createdAt: r.createdAt,
			}
		}));
		const table = { name: '_auth_roles', rows, cnt: rows.length };
		await fs.writeFile(`${dir}/roles.json`, JSON.stringify(table, null, 2), 'utf-8');
	}

	private async saveUserRoles(): Promise<void> {
		const dir = `${this.db.rootdir}/auth`;
		const fs = await import('node:fs/promises');
		await fs.mkdir(dir, { recursive: true });

		const rows = Array.from(this.userRoles.values()).map(ur => ({
			id: ur.id,
			row: {
				id: ur.id,
				userId: ur.userId,
				roleId: ur.roleId,
				assignedAt: ur.assignedAt,
			}
		}));
		const table = { name: '_auth_user_roles', rows, cnt: rows.length };
		await fs.writeFile(`${dir}/user_roles.json`, JSON.stringify(table, null, 2), 'utf-8');
	}

	private toUser(u: UserWithPassword): User {
		const { passwordHash, ...user } = u;
		return user;
	}

	private getUserRolesAndPermissions(userId: string): { roles: string[]; permissions: string[] } {
		const roleNames: string[] = [];
		const permissions = new Set<string>();

		for (const ur of this.userRoles.values()) {
			if (ur.userId === userId) {
				const role = this.roles.get(ur.roleId);
				if (role) {
					roleNames.push(role.name);
					for (const p of role.permissions) {
						permissions.add(p);
					}
				}
			}
		}

		return { roles: roleNames, permissions: Array.from(permissions) };
	}

	// ── Registration & Login ────────────────────────────

	async register(input: RegisterInput): Promise<User> {
		if (this.usersByUsername.has(input.username)) {
			throw new Error(`Username "${input.username}" already exists`);
		}
		if (this.usersByEmail.has(input.email)) {
			throw new Error(`Email "${input.email}" already exists`);
		}

		const passwordHash = await hashPassword(input.password);
		const now = new Date().toISOString();
		const user: UserWithPassword = {
			id: uuidv4(),
			username: input.username,
			email: input.email,
			passwordHash,
			isActive: true,
			createdAt: now,
			updatedAt: now,
			metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
		};

		this.users.set(user.id, user);
		this.usersByUsername.set(user.username, user.id);
		this.usersByEmail.set(user.email, user.id);

		await this.saveUsers();
		return this.toUser(user);
	}

	async login(username: string, password: string): Promise<AuthResult> {
		const userId = this.usersByUsername.get(username);
		if (!userId) throw new Error('Invalid username or password');

		const user = this.users.get(userId);
		if (!user || !user.isActive) throw new Error('Invalid username or password');

		const valid = await verifyPassword(password, user.passwordHash);
		if (!valid) throw new Error('Invalid username or password');

		const { roles, permissions } = this.getUserRolesAndPermissions(user.id);
		const token = this.jwt.sign({
			sub: user.id,
			username: user.username,
			email: user.email,
			roles,
			permissions,
		});

		const session = this.sessions.create(this.toUser(user), roles, permissions);

		return {
			user: this.toUser(user),
			token,
			sessionId: session.sessionId,
		};
	}

	async logout(sessionId: string): Promise<void> {
		this.sessions.destroy(sessionId);
	}

	// ── JWT ─────────────────────────────────────────────

	async generateToken(userId: string, options?: TokenOptions): Promise<string> {
		const user = this.users.get(userId);
		if (!user) throw new Error('User not found');
		if (!user.isActive) throw new Error('User is inactive');

		const { roles, permissions } = this.getUserRolesAndPermissions(user.id);
		return this.jwt.sign({
			sub: user.id,
			username: user.username,
			email: user.email,
			roles,
			permissions,
		}, options);
	}

	async validateToken(token: string): Promise<TokenPayload> {
		return this.jwt.verify(token);
	}

	async refreshToken(token: string, expiresIn?: string): Promise<string> {
		return this.jwt.refresh(token, expiresIn);
	}

	// ── Session ─────────────────────────────────────────

	async createSession(userId: string, options?: SessionOptions): Promise<SessionResult> {
		const user = this.users.get(userId);
		if (!user) throw new Error('User not found');
		if (!user.isActive) throw new Error('User is inactive');

		const { roles, permissions } = this.getUserRolesAndPermissions(user.id);
		return this.sessions.create(this.toUser(user), roles, permissions, options);
	}

	async validateSession(sessionId: string): Promise<SessionPayload | null> {
		return this.sessions.validate(sessionId);
	}

	async destroySession(sessionId: string): Promise<void> {
		this.sessions.destroy(sessionId);
	}

	// ── User Management ─────────────────────────────────

	async getUser(userId: string): Promise<User | null> {
		const user = this.users.get(userId);
		return user ? this.toUser(user) : null;
	}

	async updateUser(userId: string, data: Partial<Pick<User, 'email' | 'isActive' | 'metadata'>>): Promise<User> {
		const user = this.users.get(userId);
		if (!user) throw new Error('User not found');

		if (data.email && data.email !== user.email) {
			if (this.usersByEmail.has(data.email)) {
				throw new Error(`Email "${data.email}" already exists`);
			}
			this.usersByEmail.delete(user.email);
			user.email = data.email;
			this.usersByEmail.set(user.email, userId);
		}
		if (data.isActive !== undefined) user.isActive = data.isActive;
		if (data.metadata !== undefined) user.metadata = data.metadata;

		user.updatedAt = new Date().toISOString();
		this.users.set(userId, user);
		await this.saveUsers();
		return this.toUser(user);
	}

	async deleteUser(userId: string): Promise<void> {
		const user = this.users.get(userId);
		if (!user) throw new Error('User not found');

		this.users.delete(userId);
		this.usersByUsername.delete(user.username);
		this.usersByEmail.delete(user.email);

		for (const [id, ur] of this.userRoles.entries()) {
			if (ur.userId === userId) this.userRoles.delete(id);
		}

		await this.saveUsers();
		await this.saveUserRoles();
	}

	async listUsers(options?: { limit?: number; offset?: number }): Promise<User[]> {
		const all = Array.from(this.users.values()).map(u => this.toUser(u));
		const offset = options?.offset || 0;
		const limit = options?.limit || all.length;
		return all.slice(offset, offset + limit);
	}

	// ── Role Management ─────────────────────────────────

	async createRole(input: RoleInput): Promise<Role> {
		if (this.rolesByName.has(input.name)) {
			throw new Error(`Role "${input.name}" already exists`);
		}

		const role: Role = {
			id: uuidv4(),
			name: input.name,
			description: input.description || '',
			permissions: input.permissions || [],
			createdAt: new Date().toISOString(),
		};

		this.roles.set(role.id, role);
		this.rolesByName.set(role.name, role.id);
		await this.saveRoles();
		return role;
	}

	async updateRole(roleId: string, data: Partial<Pick<Role, 'description' | 'permissions'>>): Promise<Role> {
		const role = this.roles.get(roleId);
		if (!role) throw new Error('Role not found');

		if (data.description !== undefined) role.description = data.description;
		if (data.permissions !== undefined) role.permissions = data.permissions;

		this.roles.set(roleId, role);
		await this.saveRoles();
		return role;
	}

	async deleteRole(roleId: string): Promise<void> {
		const role = this.roles.get(roleId);
		if (!role) throw new Error('Role not found');

		this.roles.delete(roleId);
		this.rolesByName.delete(role.name);

		for (const [id, ur] of this.userRoles.entries()) {
			if (ur.roleId === roleId) this.userRoles.delete(id);
		}

		await this.saveRoles();
		await this.saveUserRoles();
	}

	async assignRole(userId: string, roleId: string): Promise<void> {
		if (!this.users.has(userId)) throw new Error('User not found');
		if (!this.roles.has(roleId)) throw new Error('Role not found');

		for (const ur of this.userRoles.values()) {
			if (ur.userId === userId && ur.roleId === roleId) return;
		}

		const ur: UserRole = {
			id: uuidv4(),
			userId,
			roleId,
			assignedAt: new Date().toISOString(),
		};

		this.userRoles.set(ur.id, ur);
		await this.saveUserRoles();
	}

	async removeRole(userId: string, roleId: string): Promise<void> {
		for (const [id, ur] of this.userRoles.entries()) {
			if (ur.userId === userId && ur.roleId === roleId) {
				this.userRoles.delete(id);
			}
		}
		await this.saveUserRoles();
	}

	async getUserRoles(userId: string): Promise<Role[]> {
		const result: Role[] = [];
		for (const ur of this.userRoles.values()) {
			if (ur.userId === userId) {
				const role = this.roles.get(ur.roleId);
				if (role) result.push(role);
			}
		}
		return result;
	}

	// ── Permission Management ───────────────────────────

	async checkPermission(userId: string, permission: string): Promise<boolean> {
		const { permissions } = this.getUserRolesAndPermissions(userId);
		return permissions.includes(permission) || permissions.includes('*');
	}

	async grantPermission(roleId: string, permission: string): Promise<void> {
		const role = this.roles.get(roleId);
		if (!role) throw new Error('Role not found');
		if (!role.permissions.includes(permission)) {
			role.permissions.push(permission);
			this.roles.set(roleId, role);
			await this.saveRoles();
		}
	}

	async revokePermission(roleId: string, permission: string): Promise<void> {
		const role = this.roles.get(roleId);
		if (!role) throw new Error('Role not found');
		role.permissions = role.permissions.filter(p => p !== permission);
		this.roles.set(roleId, role);
		await this.saveRoles();
	}

	// ── API Key ─────────────────────────────────────────

	async createApiKey(userId: string, options?: ApiKeyOptions): Promise<ApiKeyResult> {
		if (!this.users.has(userId)) throw new Error('User not found');
		return this.apiKeys.create(userId, options);
	}

	async revokeApiKey(keyId: string): Promise<void> {
		this.apiKeys.revoke(keyId);
	}

	async validateApiKey(key: string): Promise<ApiKeyValidation> {
		return this.apiKeys.validate(key);
	}

	async listApiKeys(userId: string): Promise<ApiKey[]> {
		return this.apiKeys.listForUser(userId);
	}

	// ── OAuth ───────────────────────────────────────────

	setOAuthConfig(provider: OAuthProvider, config: OAuthConfig): void {
		(this.oauth as any).configs.set(provider, config);
	}

	async getOAuthUrl(provider: OAuthProvider, redirectUri: string, scopes?: string[]): Promise<OAuthUrlResult> {
		return this.oauth.getAuthorizationUrl(provider, redirectUri, scopes);
	}

	async handleOAuthCallback(provider: OAuthProvider, code: string, redirectUri: string): Promise<OAuthUserInfo> {
		const tokenResult = await this.oauth.exchangeCode(provider, code, redirectUri);
		return this.oauth.getUserInfo(provider, tokenResult.accessToken);
	}

	async linkOAuth(_userId: string, provider: OAuthProvider, code: string, redirectUri: string): Promise<void> {
		await this.handleOAuthCallback(provider, code, redirectUri);
		// Store the OAuth link (simplified - in production you'd store tokens)
	}

	async loginWithOAuth(provider: OAuthProvider, code: string, redirectUri: string): Promise<AuthResult> {
		const oauthUser = await this.handleOAuthCallback(provider, code, redirectUri);

		// Try to find existing user by email
		let userId = this.usersByEmail.get(oauthUser.email);

		if (!userId) {
			// Create new user
			const now = new Date().toISOString();
			const user: UserWithPassword = {
				id: uuidv4(),
				username: oauthUser.username,
				email: oauthUser.email,
				passwordHash: '',
				isActive: true,
				createdAt: now,
				updatedAt: now,
				metadata: JSON.stringify({ provider, providerUserId: oauthUser.id }),
			};

			this.users.set(user.id, user);
			this.usersByUsername.set(user.username, user.id);
			this.usersByEmail.set(user.email, user.id);
			await this.saveUsers();
			userId = user.id;
		}

		const user = this.users.get(userId)!;
		const { roles, permissions } = this.getUserRolesAndPermissions(user.id);
		const token = this.jwt.sign({
			sub: user.id,
			username: user.username,
			email: user.email,
			roles,
			permissions,
		});

		const session = this.sessions.create(this.toUser(user), roles, permissions);

		return {
			user: this.toUser(user),
			token,
			sessionId: session.sessionId,
		};
	}

	// ── RLS Integration ─────────────────────────────────

	setCurrentUser(userId: string): void {
		const user = this.users.get(userId);
		if (!user) throw new Error('User not found');

		const { roles, permissions } = this.getUserRolesAndPermissions(userId);
		this.authContext = {
			userId: user.id,
			username: user.username,
			roles,
			permissions,
		};
	}

	setCurrentUserByToken(token: string): void {
		const payload = this.jwt.verify(token);
		this.authContext = {
			userId: payload.sub,
			username: payload.username,
			roles: payload.roles,
			permissions: payload.permissions,
		};
	}

	getCurrentUser(): AuthContext | null {
		return this.authContext;
	}

	clearCurrentUser(): void {
		this.authContext = null;
	}
}
