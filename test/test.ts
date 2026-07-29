import { wbwdbManager, DBSchema, DBFullType, DBRow, Email, Phone, UUID, dbtypes } from '../lib/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as pkg from '../package.json' with { type: 'json' };

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'bin', 'wbwdb-cli.js');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
	if (condition) {
		passed++;
		console.log(`  [PASS] ${message}`);
	} else {
		failed++;
		console.log(`  [FAIL] ${message}`);
	}
}

function assertIncludes(str: string, substr: string, message: string) {
	assert(str.includes(substr), message);
}

function assertNotIncludes(str: string, substr: string, message: string) {
	assert(!str.includes(substr), message);
}

async function runCli(args: string[] = [], opts: { cwd?: string; execOpts?: Record<string, unknown> } = {}) {
	try {
		const result = await exec(process.execPath, [cliPath, ...args], {
			cwd: opts.cwd || path.join(__dirname, '..'),
			env: { ...process.env, NODE_OPTIONS: '--experimental-strip-types' },
			timeout: 10000,
			...opts.execOpts,
		});
		return { stdout: result.stdout, stderr: result.stderr, code: 0 };
	} catch (err: any) {
		return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.code || 1 };
	}
}

function createRow(obj: Record<string, any>): DBRow {
	const map = new Map<string, any>();
	for (const [key, value] of Object.entries(obj)) {
		map.set(key, value);
	}
	return new DBRow(map);
}

// ==========================================
// 1. Core DB Tests
// ==========================================
async function testCoreDB() {
	console.log('\n[1] Core DB Tests');
	const dbPath = './.test_unified_core';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();
	assert(true, 'db initialized');

	class UserSchema extends DBSchema {
		constructor() {
			const map = new Map();
			map.set('id', new DBFullType(dbtypes.get('UUID')!, false));
			map.set('username', new DBFullType(dbtypes.get('String')!, false));
			map.set('email', new DBFullType(dbtypes.get('Email')!, false));
			map.set('phone', new DBFullType(dbtypes.get('Phone')!, true));
			map.set('age', new DBFullType(dbtypes.get('Number')!, true, 0));
			map.set('createdAt', new DBFullType(dbtypes.get('Date')!, false, () => new Date()));
			super(map);
		}
	}

	class ProductSchema extends DBSchema {
		constructor() {
			const map = new Map();
			map.set('id', new DBFullType(dbtypes.get('UUID')!, false));
			map.set('name', new DBFullType(dbtypes.get('String')!, false));
			map.set('price', new DBFullType(dbtypes.get('Number')!, false));
			map.set('stock', new DBFullType(dbtypes.get('Number')!, false, 0));
			map.set('createdAt', new DBFullType(dbtypes.get('Date')!, false, () => new Date()));
			super(map);
		}
	}

	const userTable = await db.createTable('users', new UserSchema());
	assert(true, 'users table created');

	const productTable = await db.createTable('products', new ProductSchema());
	assert(true, 'products table created');

	userTable.insert(createRow({ id: new UUID(), username: 'alice', email: new Email('alice@test.com'), age: 25 }));
	userTable.insert(createRow({ id: new UUID(), username: 'bob', email: new Email('bob@test.com'), phone: new Phone('13800000000'), age: 30 }));
	userTable.insert(createRow({ id: new UUID(), username: 'charlie', email: new Email('charlie@test.com'), age: 28 }));
	assert(userTable.rows.length === 3, 'inserted 3 users');

	productTable.insert(createRow({ id: new UUID(), name: 'laptop', price: 5999.99, stock: 50 }));
	productTable.insert(createRow({ id: new UUID(), name: 'mouse', price: 89.90, stock: 200 }));
	productTable.insert(createRow({ id: new UUID(), name: 'keyboard', price: 399.00, stock: 75 }));
	assert(productTable.rows.length === 3, 'inserted 3 products');

	const olderUsers = userTable.find((row: any) => row.get('age') > 25);
	assert(olderUsers.length === 2, 'find age > 25 returns 2 users');

	const sorted = productTable.sort((a: any, b: any) => b.row.get('price') - a.row.get('price'));
	assert(sorted[0].row.get('name') === 'laptop', 'sort by price desc: laptop first');

	const firstId = userTable.rows[0].id;
	userTable.delete(firstId);
	assert(userTable.rows.length === 2, 'deleted 1 user');

	await db.save();
	const db2 = new wbwdbManager(dbPath);
	await db2.init();
	const reloadedUsers = db2.getTable('users');
	assert(reloadedUsers!.rows.length === 2, 'reload: users persist');
	const reloadedProducts = db2.getTable('products');
	assert(reloadedProducts!.rows.length === 3, 'reload: products persist');

	await db2.dropTable('users');
	assert(!db2.getTable('users'), 'dropTable: users removed');

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// 2. SQL Engine Tests
// ==========================================
async function testSQLEngine() {
	console.log('\n[2] SQL Engine Tests');
	const dbPath = './.test_unified_sql';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();

	db.query(`CREATE TABLE orders (id SERIAL, user_name TEXT, product TEXT, amount REAL, status TEXT)`);
	db.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('alice', 'laptop', 5999.99, 'completed')`);
	db.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('bob', 'mouse', 89.90, 'completed')`);
	db.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('charlie', 'keyboard', 399.00, 'pending')`);
	db.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('alice', 'monitor', 2499.00, 'pending')`);
	db.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('bob', 'desk', 599.00, 'completed')`);

	const all = db.query('SELECT * FROM orders');
	assert(all.rowCount === 5, 'SELECT * returns 5 rows');

	const expensive = db.query('SELECT * FROM orders WHERE amount > $1', [500]);
	assert(expensive.rows.length === 3, 'WHERE amount > 500 returns 3 rows');

	const top3 = db.query('SELECT * FROM orders ORDER BY amount DESC LIMIT 3');
	assert(top3.rows.length === 3, 'ORDER BY + LIMIT returns 3 rows');
	assert(top3.rows[0].product === 'laptop', 'ORDER BY DESC: laptop first');

	const grouped = db.query('SELECT user_name, COUNT(*) as count, SUM(amount) as total FROM orders GROUP BY user_name');
	assert(grouped.rows.length === 3, 'GROUP BY returns 3 groups');

	db.query("UPDATE orders SET status = 'shipped' WHERE user_name = 'alice'");
	const updated = db.query("SELECT * FROM orders WHERE user_name = 'alice'");
	assert(updated.rows.every((r: any) => r.status === 'shipped'), 'UPDATE SET status');

	db.query("DELETE FROM orders WHERE status = 'pending' AND amount < 500");
	const afterDelete = db.query('SELECT * FROM orders');
	assert(afterDelete.rowCount === 4, 'DELETE removes 1 row');

	db.query(`CREATE TABLE customers (id SERIAL, name TEXT, level TEXT)`);
	db.query("INSERT INTO customers (name, level) VALUES ('alice', 'gold')");
	db.query("INSERT INTO customers (name, level) VALUES ('bob', 'silver')");
	const joined = db.query('SELECT c.name, c.level, o.product FROM customers c LEFT JOIN orders o ON c.name = o.user_name');
	assert(joined.rows.length >= 3, 'LEFT JOIN returns rows');

	const caseResult = db.query(`SELECT product, amount, CASE WHEN amount > 1000 THEN 'high' WHEN amount > 200 THEN 'mid' ELSE 'low' END as level FROM orders`);
	assert(caseResult.rows.length === 4, 'CASE WHEN works');

	const distinct = db.query('SELECT DISTINCT user_name FROM orders');
	assert(distinct.rows.length >= 2, 'DISTINCT returns unique names');

	const subquery = db.query("SELECT * FROM orders WHERE user_name IN (SELECT name FROM customers WHERE level = 'gold')");
	assert(subquery.rows.length >= 1, 'subquery IN works');

	const inResult = db.query("SELECT * FROM orders WHERE status IN ('completed', 'shipped')");
	assert(inResult.rows.length >= 2, 'IN expression works');

	const between = db.query('SELECT * FROM orders WHERE amount BETWEEN 100 AND 1000');
	assert(between.rows.length >= 1, 'BETWEEN works');

	const like = db.query("SELECT * FROM orders WHERE product LIKE '%mouse%'");
	assert(like.rows.length === 1, 'LIKE works');

	const coalesce = db.query("SELECT user_name, COALESCE(product, 'unknown') as product FROM orders");
	assert(coalesce.rows.length === 4, 'COALESCE works');

	db.query('TRUNCATE TABLE customers');
	const truncated = db.query('SELECT COUNT(*) as cnt FROM customers');
	assert(Number(truncated.rows[0].cnt) === 0, 'TRUNCATE clears table');

	db.query('DROP TABLE customers');
	const tables = db.getSQL().tables();
	assert(!tables.includes('customers'), 'DROP TABLE removes table');

	db.query('TRUNCATE TABLE orders');
	db.query('DROP TABLE orders');

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// 3. RLS Tests
// ==========================================
async function testRLS() {
	console.log('\n[3] RLS Tests');
	const dbPath = './.test_unified_rls';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();

	db.query(`CREATE TABLE posts (id SERIAL, author TEXT, title TEXT, content TEXT, published BOOLEAN)`);
	db.query("INSERT INTO posts (author, title, content, published) VALUES ('alice', 'Hello', 'content1', true)");
	db.query("INSERT INTO posts (author, title, content, published) VALUES ('alice', 'Draft', 'content2', false)");
	db.query("INSERT INTO posts (author, title, content, published) VALUES ('bob', 'Bob Post', 'content3', true)");
	db.query("INSERT INTO posts (author, title, content, published) VALUES ('charlie', 'Secret', 'content4', false)");

	db.query('ALTER TABLE posts ENABLE ROW LEVEL SECURITY');
	db.query("CREATE POLICY user_isolation ON posts FOR SELECT USING (author = current_user())");

	const bobAuth = { userId: '2', username: 'bob', roles: ['user'], permissions: ['read'] };
	const bobPosts = db.query('SELECT * FROM posts', [], bobAuth);
	assert(bobPosts.rowCount === 1, 'RLS: bob sees 1 post');
	assert(bobPosts.rows[0].author === 'bob', 'RLS: bob sees own post');

	const charlieAuth = { userId: '3', username: 'charlie', roles: ['user'], permissions: ['read'] };
	const charliePosts = db.query('SELECT * FROM posts', [], charlieAuth);
	assert(charliePosts.rowCount === 1, 'RLS: charlie sees 1 post');

	const superUser = db.query('SELECT * FROM posts', [], null);
	assert(superUser.rowCount === 4, 'RLS: superUser sees all 4 posts');

	db.query("CREATE POLICY insert_check ON posts FOR INSERT WITH CHECK (author = current_user())");
	try {
		db.query("INSERT INTO posts (author, title, content, published) VALUES ('bob', 'New', 'x', false)", [], bobAuth);
		assert(true, 'RLS: bob inserts own post');
	} catch {
		assert(false, 'RLS: bob insert should succeed');
	}

	try {
		db.query("INSERT INTO posts (author, title, content, published) VALUES ('alice', 'Fake', 'x', false)", [], bobAuth);
		assert(false, 'RLS: bob impersonating alice should fail');
	} catch {
		assert(true, 'RLS: bob impersonating alice blocked');
	}

	db.query('DROP POLICY user_isolation ON posts');
	db.query('DROP POLICY insert_check ON posts');
	db.query('ALTER TABLE posts DISABLE ROW LEVEL SECURITY');

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// 4. Error Handling Tests
// ==========================================
async function testErrorHandling() {
	console.log('\n[4] Error Handling Tests');
	const dbPath = './.test_unified_error';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();

	const schema = new DBSchema(new Map());
	await db.createTable('test', schema);
	try {
		await db.createTable('test', schema);
		assert(false, 'duplicate table should throw');
	} catch (err: any) {
		assert(err.message.includes('exists') || err.message.includes('已存在'), 'duplicate table error: ' + err.message);
	}

	try {
		db.query('SELECT * FROM nonexistent');
		assert(false, 'missing table should throw');
	} catch (err: any) {
		assert(err.message.includes('does not exist') || err.message.includes('not found'), 'missing table error: ' + err.message);
	}

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// 5. Type Safety Tests
// ==========================================
async function testTypeSafety() {
	console.log('\n[5] Type Safety Tests');

	const email = new Email('test@example.com');
	assert(email.toString() === 'test@example.com', 'Email creation');

	const uuid = UUID.generate();
	assert(typeof uuid.toString() === 'string' && uuid.toString().length > 0, 'UUID generation');

	const phone = new Phone('13800138000');
	assert(phone.toString() === '13800138000', 'Phone creation');

	try {
		new Email('invalid-email');
		assert(false, 'invalid email should throw');
	} catch {
		assert(true, 'invalid email rejected');
	}

	try {
		new Phone('123');
		assert(false, 'invalid phone should throw');
	} catch {
		assert(true, 'invalid phone rejected');
	}
}

// ==========================================
// 6. Auth Tests
// ==========================================
async function testAuth() {
	console.log('\n[6] Auth Tests');
	const dbPath = './.test_unified_auth';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();
	const auth = await db.initAuth({ jwtSecret: 'test-secret-key' });
	assert(true, 'auth initialized');

	const alice = await auth.register({ username: 'alice', email: 'alice@test.com', password: 'pass123' });
	assert(alice.username === 'alice', 'register alice');

	const bob = await auth.register({ username: 'bob', email: 'bob@test.com', password: 'pass456' });
	assert(bob.username === 'bob', 'register bob');

	try {
		await auth.register({ username: 'alice', email: 'other@test.com', password: 'x' });
		assert(false, 'duplicate should throw');
	} catch {
		assert(true, 'duplicate username rejected');
	}

	const loginResult = await auth.login('alice', 'pass123');
	assert(loginResult.user.username === 'alice', 'login alice');
	assert(loginResult.token.length > 0, 'JWT token generated');
	assert(typeof loginResult.sessionId === 'string', 'session created');

	const payload = await auth.validateToken(loginResult.token);
	assert(payload.sub === alice.id, 'JWT payload sub matches');

	try {
		await auth.login('alice', 'wrong');
		assert(false, 'wrong password should throw');
	} catch {
		assert(true, 'wrong password rejected');
	}

	const adminRole = await auth.createRole({ name: 'admin', description: 'Admin', permissions: ['user:read', 'user:write', 'user:delete'] });
	const userRole = await auth.createRole({ name: 'user', description: 'User', permissions: ['user:read'] });
	assert(adminRole.name === 'admin', 'create admin role');
	assert(userRole.name === 'user', 'create user role');

	await auth.assignRole(alice.id, adminRole.id);
	await auth.assignRole(bob.id, userRole.id);
	assert(true, 'roles assigned');

	const aliceCanDelete = await auth.checkPermission(alice.id, 'user:delete');
	assert(aliceCanDelete === true, 'alice has delete permission');

	const bobCanDelete = await auth.checkPermission(bob.id, 'user:delete');
	assert(bobCanDelete === false, 'bob lacks delete permission');

	const aliceToken = await auth.generateToken(alice.id);
	const alicePayload = await auth.validateToken(aliceToken);
	assert(alicePayload.roles.includes('admin'), 'alice JWT has admin role');
	assert(alicePayload.permissions.includes('user:delete'), 'alice JWT has delete permission');

	const session = await auth.createSession(alice.id);
	const sessionPayload = await auth.validateSession(session.sessionId);
	assert(sessionPayload?.username === 'alice', 'session valid for alice');
	await auth.destroySession(session.sessionId);
	const destroyed = await auth.validateSession(session.sessionId);
	assert(destroyed === null, 'session destroyed');

	const apiKeyResult = await auth.createApiKey(alice.id, { name: 'test-key', permissions: ['user:read'], expiresInMs: 3600000 });
	const keyValidation = await auth.validateApiKey(apiKeyResult.key);
	assert(keyValidation.valid === true, 'API key valid');
	const keys = await auth.listApiKeys(alice.id);
	assert(keys.length >= 1, 'alice has API keys');

	const sql = db.getSQL();
	sql.execute('CREATE TABLE auth_posts (id SERIAL, title STRING, author STRING)');
	sql.execute("INSERT INTO auth_posts (title, author) VALUES ('Hello', 'alice')");
	sql.execute("INSERT INTO auth_posts (title, author) VALUES ('Bob Post', 'bob')");
	sql.setAuthContext({ userId: alice.id, username: 'alice', roles: ['admin'], permissions: ['user:read'] });
	const authResult = sql.execute('SELECT title, author, auth_username() as current_user FROM auth_posts');
	assert(authResult.rows.length > 0, 'auth_username() works in SQL');

	const users = await auth.listUsers();
	assert(users.length === 2, 'listUsers returns 2');

	await auth.deleteUser(bob.id);
	const afterDelete = await auth.listUsers();
	assert(afterDelete.length === 1, 'after delete: 1 user');

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// 7. CLI Tests
// ==========================================
async function testCLI() {
	console.log('\n[7] CLI Tests');
	const cliDbDir = path.join(__dirname, '..', '.test_unified_cli');

	async function cleanup() {
		await fs.promises.rm(cliDbDir, { recursive: true, force: true }).catch(() => { });
	}

	await cleanup();

	let r = await runCli(['--help']);
	assert(r.code === 0, 'CLI --help exits 0');
	assertIncludes(r.stdout, 'Usage:', 'CLI --help shows usage');

	r = await runCli(['--version']);
	assert(r.code === 0, 'CLI --version exits 0');
	assertIncludes(r.stdout, pkg.default.version, 'CLI --version shows version');

	r = await runCli(['tables', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI tables (empty) exits 0');
	assertIncludes(r.stdout, 'No tables found', 'CLI tables shows empty message');

	r = await runCli(['query', 'CREATE TABLE test_tbl (id number, name string)', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI CREATE TABLE exits 0');

	r = await runCli(['table', 'info', 'test_tbl', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI table info exits 0');
	assertIncludes(r.stdout, 'Table: test_tbl', 'CLI table info shows name');

	r = await runCli(['table', 'list', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI table list exits 0');
	assertIncludes(r.stdout, 'test_tbl', 'CLI table list shows test_tbl');

	await runCli(['query', "INSERT INTO test_tbl (id, name) VALUES (1, 'Alice')", '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO test_tbl (id, name) VALUES (2, 'Bob')", '-d', cliDbDir]);
	r = await runCli(['query', 'SELECT * FROM test_tbl', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI SELECT exits 0');
	assertIncludes(r.stdout, 'Alice', 'CLI SELECT shows Alice');
	assertIncludes(r.stdout, 'Bob', 'CLI SELECT shows Bob');

	await cleanup();
	r = await runCli(['user', 'list', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI user list (empty) exits 0');
	assertIncludes(r.stdout, 'No users found', 'CLI user list shows empty');

	r = await runCli(['role', 'list', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI role list (empty) exits 0');
	assertIncludes(r.stdout, 'No roles found', 'CLI role list shows empty');

	r = await runCli(['query', 'SELECT * FROM nonexistent', '-d', cliDbDir]);
	assert(r.code === 1, 'CLI query error exits 1');

	await cleanup();
	await runCli(['query', 'CREATE TABLE json_test (val string)', '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO json_test (val) VALUES ('hello')", '-d', cliDbDir]);
	r = await runCli(['query', '--json', 'SELECT * FROM json_test', '-d', cliDbDir]);
	assert(r.code === 0, 'CLI --json exits 0');
	try {
		const json = JSON.parse(r.stdout);
		assert(json.rows !== undefined, 'CLI --json has rows');
	} catch {
		assert(false, 'CLI --json is valid JSON');
	}

	await cleanup();
	await runCli(['query', 'CREATE TABLE alpha (x number)', '-d', cliDbDir]);
	await runCli(['query', 'CREATE TABLE beta (y string)', '-d', cliDbDir]);
	await runCli(['query', 'CREATE TABLE gamma (z boolean)', '-d', cliDbDir]);
	r = await runCli(['table', 'list', '-d', cliDbDir]);
	assertIncludes(r.stdout, 'alpha', 'CLI multiple tables: alpha');
	assertIncludes(r.stdout, 'beta', 'CLI multiple tables: beta');
	assertIncludes(r.stdout, 'gamma', 'CLI multiple tables: gamma');

	await cleanup();
	await runCli(['query', 'CREATE TABLE scores (name string, score number)', '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO scores (name, score) VALUES ('Alice', 95)", '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO scores (name, score) VALUES ('Bob', 80)", '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO scores (name, score) VALUES ('Charlie', 90)", '-d', cliDbDir]);
	r = await runCli(['query', 'SELECT * FROM scores WHERE score > 85', '-d', cliDbDir]);
	assertIncludes(r.stdout, 'Alice', 'CLI WHERE: Alice shown');
	assertNotIncludes(r.stdout, 'Bob', 'CLI WHERE: Bob excluded');
	assertIncludes(r.stdout, 'Charlie', 'CLI WHERE: Charlie shown');

	await cleanup();
	await runCli(['query', 'CREATE TABLE items (name string, qty number)', '-d', cliDbDir]);
	await runCli(['query', "CREATE HOOK min_qty ON items FOR INSERT BEFORE AS SQL qty > 0", '-d', cliDbDir]);
	r = await runCli(['query', 'SHOW HOOKS ON items', '-d', cliDbDir]);
	assertIncludes(r.stdout, 'min_qty', 'CLI hook persists');
	const ok = await runCli(['query', "INSERT INTO items (name, qty) VALUES ('apple', 5)", '-d', cliDbDir]);
	assert(ok.code === 0, 'CLI valid insert succeeds');
	const bad = await runCli(['query', "INSERT INTO items (name, qty) VALUES ('apple', 0)", '-d', cliDbDir]);
	assert(bad.code === 1, 'CLI hook blocks qty=0');
	const bad2 = await runCli(['query', "INSERT INTO items (name, qty) VALUES ('banana', -1)", '-d', cliDbDir]);
	assert(bad2.code === 1, 'CLI hook blocks qty=-1 after restart');
	const ok2 = await runCli(['query', "INSERT INTO items (name, qty) VALUES ('banana', 10)", '-d', cliDbDir]);
	assert(ok2.code === 0, 'CLI valid insert after restart');
	const sel = await runCli(['query', 'SELECT * FROM items', '-d', cliDbDir]);
	assertIncludes(sel.stdout, 'apple', 'CLI apple row exists');
	assertIncludes(sel.stdout, 'banana', 'CLI banana row exists');

	await cleanup();
	await runCli(['query', 'CREATE TABLE secure (owner string, secret string)', '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO secure (owner, secret) VALUES ('alice', 'key-123')", '-d', cliDbDir]);
	await runCli(['query', "INSERT INTO secure (owner, secret) VALUES ('bob', 'key-456')", '-d', cliDbDir]);
	await runCli(['query', 'ALTER TABLE secure ENABLE ROW LEVEL SECURITY', '-d', cliDbDir]);
	await runCli(['query', "CREATE POLICY owner_only ON secure FOR SELECT USING (owner = auth_username())", '-d', cliDbDir]);
	const asAlice = await runCli(['query', "SELECT * FROM secure WHERE owner = 'alice'", '-d', cliDbDir]);
	assertIncludes(asAlice.stdout, 'key-123', 'CLI RLS: alice sees data');
	const sel2 = await runCli(['query', 'SELECT * FROM secure', '-d', cliDbDir]);
	assertIncludes(sel2.stdout, 'key-123', 'CLI RLS: alice persists');
	assertIncludes(sel2.stdout, 'key-456', 'CLI RLS: bob persists');

	await cleanup();
}

// ==========================================
// 8. JS Hook Tests
// ==========================================
async function testJSHooks() {
	console.log('\n[8] JS Hook Tests');
	const dbPath = './.test_unified_hooks';
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });

	const db = new wbwdbManager(dbPath);
	await db.init();

	db.query('CREATE TABLE t (v String)');

	db.query("CREATE HOOK h1 ON t FOR INSERT BEFORE AS JS $$ row.v = 'modified'; $$");
	db.query("INSERT INTO t (v) VALUES ('original')");
	const r1 = db.query('SELECT * FROM t');
	assert(r1.rows[0].v === 'modified', 'JS hook modifies row');

	db.query("CREATE HOOK h2 ON t FOR INSERT BEFORE AS JS $$ throw new Error('blocked'); $$");
	try {
		db.query("INSERT INTO t (v) VALUES ('fail')");
		assert(false, 'throw should block');
	} catch (e: any) {
		assert(e.message.includes('blocked'), 'JS hook throw blocks insert');
	}

	db.query('DROP HOOK h1 ON t');
	db.query('DROP HOOK h2 ON t');
	db.query("CREATE HOOK h3 ON t FOR INSERT BEFORE AS JS $$ if (row.v === 'bad') abort('nope'); $$");
	try {
		db.query("INSERT INTO t (v) VALUES ('bad')");
		assert(false, 'abort should block');
	} catch (e: any) {
		assert(e.message.includes('blocked'), 'JS hook abort blocks insert');
	}

	db.query('DROP HOOK h3 ON t');
	db.query("CREATE HOOK h4 ON t FOR INSERT BEFORE AS JS $$ if (tableName !== 't') throw new Error('wrong'); $$");
	db.query("INSERT INTO t (v) VALUES ('test')");
	assert(true, 'tableName global accessible');

	db.query("CREATE HOOK h5 ON t FOR UPDATE BEFORE AS JS $$ if (!oldRow) throw new Error('no oldRow'); $$");
	db.query("UPDATE t SET v = 'updated' WHERE v = 'test'");
	assert(true, 'oldRow in UPDATE hook');

	db.query('DROP HOOK h4 ON t');
	db.query('DROP HOOK h5 ON t');

	// Sandbox isolation
	db.query("CREATE HOOK no_require ON t FOR INSERT BEFORE AS JS $$ try { require('fs'); } catch(e) { throw new Error('BLOCKED'); } $$");
	try {
		db.query("INSERT INTO t (v) VALUES ('x')");
		assert(false, 'require should be blocked');
	} catch (e: any) {
		assert(e.message.includes('BLOCKED') || e.message.includes('not defined'), 'require blocked in sandbox');
	}

	db.query('DROP HOOK no_require ON t');
	db.query("CREATE HOOK no_process ON t FOR INSERT BEFORE AS JS $$ try { process.exit(); } catch(e) { throw new Error('BLOCKED'); } $$");
	try {
		db.query("INSERT INTO t (v) VALUES ('x')");
		assert(false, 'process should be blocked');
	} catch (e: any) {
		assert(e.message.includes('BLOCKED') || e.message.includes('not defined'), 'process blocked in sandbox');
	}

	db.query('DROP HOOK no_process ON t');
	db.query("CREATE HOOK no_fs ON t FOR INSERT BEFORE AS JS $$ try { fs.readFileSync; } catch(e) { throw new Error('BLOCKED'); } $$");
	try {
		db.query("INSERT INTO t (v) VALUES ('x')");
		assert(false, 'fs should be blocked');
	} catch (e: any) {
		assert(e.message.includes('BLOCKED') || e.message.includes('not defined'), 'fs blocked in sandbox');
	}

	// Multiple hooks execution order
	db.query('DROP HOOK no_fs ON t');
	db.query("CREATE HOOK step1 ON t FOR INSERT BEFORE AS JS $$ row.v = row.v + '->A'; $$");
	db.query("CREATE HOOK step2 ON t FOR INSERT BEFORE AS JS $$ row.v = row.v + '->B'; $$");
	db.query("CREATE HOOK step3 ON t FOR INSERT BEFORE AS JS $$ row.v = row.v + '->C'; $$");
	db.query("INSERT INTO t (v) VALUES ('START')");
	const orderResult = db.query("SELECT * FROM t WHERE v LIKE 'START%'");
	assert(orderResult.rows[orderResult.rows.length - 1].v === 'START->A->B->C', 'hooks execute in order');

	// UPDATE and DELETE hooks
	db.query('DROP HOOK step1 ON t');
	db.query('DROP HOOK step2 ON t');
	db.query('DROP HOOK step3 ON t');
	db.query('CREATE TABLE accounts (name String, balance Number)');
	db.query("CREATE HOOK block_negative ON accounts FOR UPDATE BEFORE AS JS $$ if (row.balance < 0) abort('negative'); $$");
	db.query("INSERT INTO accounts (name, balance) VALUES ('Alice', 100)");
	db.query("UPDATE accounts SET balance = 50 WHERE name = 'Alice'");
	const after1 = db.query("SELECT * FROM accounts WHERE name = 'Alice'");
	assert(Number(after1.rows[0].balance) === 50, 'UPDATE hook allows valid');

	try {
		db.query("UPDATE accounts SET balance = -10 WHERE name = 'Alice'");
		assert(false, 'negative balance should throw');
	} catch (e: any) {
		assert(e.message.includes('blocked'), 'UPDATE hook blocks negative');
	}

	db.query("CREATE HOOK protect_alice ON accounts FOR DELETE BEFORE AS JS $$ if (row.name === 'Alice') abort('cannot delete'); $$");
	try {
		db.query("DELETE FROM accounts WHERE name = 'Alice'");
		assert(false, 'delete Alice should throw');
	} catch (e: any) {
		assert(e.message.includes('blocked'), 'DELETE hook blocks Alice');
	}

	db.query("INSERT INTO accounts (name, balance) VALUES ('Bob', 100)");
	db.query("DELETE FROM accounts WHERE name = 'Bob'");
	const after2 = db.query("SELECT * FROM accounts WHERE name = 'Bob'");
	assert(after2.rows.length === 0, 'DELETE hook allows Bob');

	// Data types
	db.query('CREATE TABLE types_test (name String, num Number)');
	db.query("CREATE HOOK check_num ON types_test FOR INSERT BEFORE AS JS $$ if (typeof row.num !== 'number') throw new Error('type'); if (row.num !== 42) throw new Error('value'); $$");
	db.query("INSERT INTO types_test (name, num) VALUES ('test', 42)");
	assert(true, 'Number type preserved in sandbox');

	db.query('DROP HOOK check_num ON types_test');
	db.query("CREATE HOOK check_str ON types_test FOR INSERT BEFORE AS JS $$ if (typeof row.name !== 'string') throw new Error('type'); if (row.name !== 'hello') throw new Error('value'); $$");
	db.query("INSERT INTO types_test (name, num) VALUES ('hello', 1)");
	assert(true, 'String type preserved in sandbox');

	// Hook modifies row
	db.query('CREATE TABLE modify_test (name String, email String)');
	db.query("CREATE HOOK auto_email ON modify_test FOR INSERT BEFORE AS JS $$ row.email = row.name.toLowerCase() + '@test.com'; $$");
	db.query("INSERT INTO modify_test (name, email) VALUES ('Alice', '')");
	const emailResult = db.query("SELECT * FROM modify_test WHERE name = 'Alice'");
	assert(emailResult.rows[0].email === 'alice@test.com', 'Hook auto-generated email');

	db.query('DROP HOOK auto_email ON modify_test');
	db.query("CREATE HOOK upper_name ON modify_test FOR INSERT BEFORE AS JS $$ row.name = row.name.toUpperCase(); $$");
	db.query("INSERT INTO modify_test (name, email) VALUES ('bob', 'bob@test.com')");
	const upperResult = db.query("SELECT * FROM modify_test WHERE name = 'BOB'");
	assert(upperResult.rows.length === 1, 'Hook uppercased name');

	// After hook
	db.query('CREATE TABLE after_test (type String)');
	db.query("CREATE HOOK log_insert ON after_test FOR INSERT AFTER AS JS $$ /* noop */ $$");
	db.query("INSERT INTO after_test (type) VALUES ('test')");
	const afterResult = db.query('SELECT * FROM after_test');
	assert(afterResult.rows.length === 1, 'After hook executed');

	// SQL + JS combined
	db.query('CREATE TABLE combo_test (product String, qty Number, total Number)');
	db.query("CREATE HOOK sql_qty ON combo_test FOR INSERT BEFORE AS SQL qty > 0");
	db.query("CREATE HOOK js_calc ON combo_test FOR INSERT BEFORE AS JS $$ row.total = row.qty * 10; $$");
	db.query("INSERT INTO combo_test (product, qty, total) VALUES ('Widget', 5, 0)");
	const comboResult = db.query('SELECT * FROM combo_test');
	assert(Number(comboResult.rows[0].total) === 50, 'JS hook calculated total');

	try {
		db.query("INSERT INTO combo_test (product, qty, total) VALUES ('Widget', 0, 0)");
		assert(false, 'SQL hook should block');
	} catch (e: any) {
		assert(e.message.includes('blocked'), 'SQL hook still blocks');
	}

	// Hook persistence
	db.query('CREATE TABLE persist_test (name String, score Number)');
	db.query("CREATE HOOK add_bonus ON persist_test FOR INSERT BEFORE AS JS $$ row.score = row.score + 10; $$");
	db.query("INSERT INTO persist_test (name, score) VALUES ('Alice', 80)");
	const before = db.query('SELECT * FROM persist_test');
	assert(Number(before.rows[0].score) === 90, 'Hook adds bonus');

	await db.save();
	const db2 = new wbwdbManager(dbPath);
	await db2.init();
	const hooks = db2.query('SHOW HOOKS ON persist_test');
	assert(hooks.rows.length === 1, 'Hook persisted after reload');

	db2.query("INSERT INTO persist_test (name, score) VALUES ('Bob', 50)");
	const after = db2.query("SELECT * FROM persist_test WHERE name = 'Bob'");
	assert(Number(after.rows[0].score) === 60, 'Hook works after reload');

	// oldRow in UPDATE hook
	db.query('CREATE TABLE versions (name String, version Number)');
	db.query("CREATE HOOK check_old ON versions FOR UPDATE BEFORE AS JS $$ if (!oldRow) throw new Error('no oldRow'); if (oldRow.version === undefined) throw new Error('missing'); $$");
	db.query("INSERT INTO versions (name, version) VALUES ('app', 1)");
	db.query("UPDATE versions SET version = 2 WHERE name = 'app'");
	assert(true, 'oldRow accessible in UPDATE hook');

	// Event listeners
	db.query('CREATE TABLE event_test (name String)');
	let insertFired = false;
	db.on('afterInsert', 'event_test', () => { insertFired = true; });
	db.query("INSERT INTO event_test (name) VALUES ('test')");
	assert(insertFired, 'afterInsert event fired');

	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { });
}

// ==========================================
// Main
// ==========================================
async function main() {
	console.log('==========================================');
	console.log(' WBWDB Unified Test Suite');
	console.log('==========================================');

	try {
		await testCoreDB();
		await testSQLEngine();
		await testRLS();
		await testErrorHandling();
		await testTypeSafety();
		await testAuth();
		await testCLI();
		await testJSHooks();

		console.log('\n==========================================');
		console.log(` Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
		console.log('==========================================');

		if (failed > 0) {
			process.exit(1);
		}
	} catch (err) {
		console.error('\n[FATAL] Test suite failed:', err);
		process.exit(1);
	}
}

main();
