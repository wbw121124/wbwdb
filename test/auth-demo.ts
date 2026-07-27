import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wbwdbManager } from '../lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, '..', 'demo_data', 'auth_test');

// Clean up
if (fs.existsSync(testDir)) {
	fs.rmSync(testDir, { recursive: true, force: true });
}

console.log('=== Auth Module Demo ===\n');

const db = new wbwdbManager(testDir);
await db.init();

// Initialize Auth module
const auth = await db.initAuth({ jwtSecret: 'test-secret-key-123' });
console.log('[OK] Auth module initialized');

// ── User Registration & Login ──────────────────────────

console.log('\n--- User Registration ---');
const alice = await auth.register({
	username: 'alice',
	email: 'alice@example.com',
	password: 'password123',
});
console.log(`[OK] Registered: ${alice.username} (${alice.email})`);
console.log(`     ID: ${alice.id}`);

const bob = await auth.register({
	username: 'bob',
	email: 'bob@example.com',
	password: 'securepass456',
});
console.log(`[OK] Registered: ${bob.username} (${bob.email})`);

// Try duplicate registration
try {
	await auth.register({ username: 'alice', email: 'other@example.com', password: 'test' });
	console.log('[FAIL] Should have thrown');
} catch (e: any) {
	console.log(`[OK] Duplicate username rejected: ${e.message}`);
}

console.log('\n--- User Login ---');
const loginResult = await auth.login('alice', 'password123');
console.log(`[OK] Logged in: ${loginResult.user.username}`);
console.log(`     JWT Token: ${loginResult.token.substring(0, 50)}...`);
console.log(`     Session ID: ${loginResult.sessionId}`);

// Validate JWT
const payload = await auth.validateToken(loginResult.token);
console.log(`[OK] JWT validated: sub=${payload.sub}, username=${payload.username}`);

// Wrong password
try {
	await auth.login('alice', 'wrongpassword');
	console.log('[FAIL] Should have thrown');
} catch (e: any) {
	console.log(`[OK] Wrong password rejected: ${e.message}`);
}

// ── Role Management ────────────────────────────────────

console.log('\n--- Role Management ---');
const adminRole = await auth.createRole({
	name: 'admin',
	description: 'Administrator role',
	permissions: ['user:read', 'user:write', 'user:delete'],
});
console.log(`[OK] Created role: ${adminRole.name} (ID: ${adminRole.id})`);

const userRole = await auth.createRole({
	name: 'user',
	description: 'Regular user role',
	permissions: ['user:read'],
});
console.log(`[OK] Created role: ${userRole.name} (ID: ${userRole.id})`);

// Assign roles
await auth.assignRole(alice.id, adminRole.id);
await auth.assignRole(bob.id, userRole.id);
console.log(`[OK] Assigned 'admin' to alice`);
console.log(`[OK] Assigned 'user' to bob`);

// Check permissions
const aliceIsAdmin = await auth.checkPermission(alice.id, 'user:delete');
console.log(`[OK] alice can delete users: ${aliceIsAdmin}`);

const bobCanDelete = await auth.checkPermission(bob.id, 'user:delete');
console.log(`[OK] bob can delete users: ${bobCanDelete}`);

// ── JWT with Roles ─────────────────────────────────────

console.log('\n--- JWT with Roles ---');
const aliceToken = await auth.generateToken(alice.id);
const alicePayload = await auth.validateToken(aliceToken);
console.log(`[OK] Alice JWT roles: ${alicePayload.roles.join(', ')}`);
console.log(`[OK] Alice JWT permissions: ${alicePayload.permissions.join(', ')}`);

const bobToken = await auth.generateToken(bob.id);
const bobPayload = await auth.validateToken(bobToken);
console.log(`[OK] Bob JWT roles: ${bobPayload.roles.join(', ')}`);

// ── Session Management ─────────────────────────────────

console.log('\n--- Session Management ---');
const session = await auth.createSession(alice.id);
console.log(`[OK] Session created: ${session.sessionId}`);

const sessionPayload = await auth.validateSession(session.sessionId);
console.log(`[OK] Session valid: username=${sessionPayload?.username}, roles=${sessionPayload?.roles.join(', ')}`);

await auth.destroySession(session.sessionId);
const destroyedSession = await auth.validateSession(session.sessionId);
console.log(`[OK] Session destroyed: ${destroyedSession === null}`);

// ── API Key Management ─────────────────────────────────

console.log('\n--- API Key Management ---');
const apiKeyResult = await auth.createApiKey(alice.id, {
	name: 'test-api-key',
	permissions: ['user:read'],
	expiresInMs: 3600000,
});
console.log(`[OK] API Key created: ${apiKeyResult.key.substring(0, 30)}...`);
console.log(`     Key ID: ${apiKeyResult.apiKey.id}`);

const validation = await auth.validateApiKey(apiKeyResult.key);
console.log(`[OK] API Key valid: ${validation.valid}, userId: ${validation.userId}`);

// List API keys
const keys = await auth.listApiKeys(alice.id);
console.log(`[OK] Alice has ${keys.length} API key(s)`);

// ── SQL Integration with Auth ──────────────────────────

console.log('\n--- SQL with Auth Context ---');
const sql = db.getSQL();

// Create a table
sql.execute(`CREATE TABLE posts (id SERIAL, title STRING, author STRING, content STRING)`);
sql.execute(`INSERT INTO posts (title, author, content) VALUES ('Hello World', 'alice', 'My first post')`);
sql.execute(`INSERT INTO posts (title, author, content) VALUES ('Bob\\'s Post', 'bob', 'Bob wrote this')`);
console.log('[OK] Created posts table with sample data');

// Set auth context for alice
sql.setAuthContext({
	userId: alice.id,
	username: 'alice',
	roles: ['admin'],
	permissions: ['user:read', 'user:write', 'user:delete'],
});
console.log('[OK] Set auth context to alice');

// Query with auth functions
const result1 = sql.execute(`SELECT title, author, auth_username() as current_user FROM posts`);
console.log('[OK] Query with auth_username():');
for (const row of result1.rows) {
	console.log(`     ${row.title} by ${row.author} (current: ${row.current_user})`);
}

// Switch to bob
sql.setAuthContext({
	userId: bob.id,
	username: 'bob',
	roles: ['user'],
	permissions: ['user:read'],
});
console.log('[OK] Set auth context to bob');

const result2 = sql.execute(`SELECT auth_username() as user, is_authenticated() as authed`);
console.log(`[OK] Bob is authenticated: ${result2.rows[0]?.authed}`);

// Clear auth
sql.setAuthContext(null);
const result3 = sql.execute(`SELECT is_authenticated() as authed`);
console.log(`[OK] After clear, authenticated: ${result3.rows[0]?.authed}`);

// ── RLS Integration ────────────────────────────────────

console.log('\n--- RLS with Auth ---');
sql.execute(`CREATE TABLE secrets (id SERIAL, owner STRING, data STRING)`);
sql.execute(`INSERT INTO secrets (owner, data) VALUES ('alice', 'secret-key-123')`);
sql.execute(`INSERT INTO secrets (owner, data) VALUES ('bob', 'bob-secret-456')`);
sql.execute(`ALTER TABLE secrets ENABLE ROW LEVEL SECURITY`);

// Create policy: users can only see their own secrets
sql.execute(`CREATE POLICY owner_only ON secrets FOR SELECT USING (owner = current_user())`);
console.log('[OK] Created RLS policy: owner_only on secrets');

// As alice
sql.setAuthContext({
	userId: alice.id,
	username: 'alice',
	roles: ['user'],
	permissions: ['user:read'],
});
const secrets1 = sql.execute(`SELECT * FROM secrets`);
console.log(`[OK] Alice sees ${secrets1.rows.length} secret(s): ${secrets1.rows.map((r: any) => r.data).join(', ')}`);

// As bob
sql.setAuthContext({
	userId: bob.id,
	username: 'bob',
	roles: ['user'],
	permissions: ['user:read'],
});
const secrets2 = sql.execute(`SELECT * FROM secrets`);
console.log(`[OK] Bob sees ${secrets2.rows.length} secret(s): ${secrets2.rows.map((r: any) => r.data).join(', ')}`);

// ── User Management ────────────────────────────────────

console.log('\n--- User Management ---');
const users = await auth.listUsers();
console.log(`[OK] Total users: ${users.length}`);

const aliceProfile = await auth.getUser(alice.id);
console.log(`[OK] Get alice: ${aliceProfile?.username} (${aliceProfile?.email})`);

await auth.updateUser(alice.id, { metadata: JSON.stringify({ lastLogin: new Date().toISOString() }) });
console.log('[OK] Updated alice metadata');

const aliceRoles = await auth.getUserRoles(alice.id);
console.log(`[OK] Alice roles: ${aliceRoles.map(r => r.name).join(', ')}`);

// ── Cleanup ────────────────────────────────────────────

console.log('\n--- Cleanup ---');
await auth.deleteUser(bob.id);
console.log('[OK] Deleted bob');

const usersAfter = await auth.listUsers();
console.log(`[OK] Users after delete: ${usersAfter.length}`);

console.log('\n=== All Auth Demo Tests Passed! ===');
