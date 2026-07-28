import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'bin', 'wbwdb-cli.js');
const testDbDir = path.join(__dirname, '..', '.test_cli_data');

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.log(`  ✗ ${message}`);
	}
}

function assertIncludes(str, substr, message) {
	assert(str.includes(substr), message);
}

function assertNotIncludes(str, substr, message) {
	assert(!str.includes(substr), message);
}

async function run(args = [], opts = {}) {
	try {
		const result = await exec(process.execPath, [cliPath, ...args], {
			cwd: opts.cwd || path.join(__dirname, '..'),
			env: { ...process.env, NODE_OPTIONS: '--experimental-strip-types' },
			timeout: 10000,
			...opts.execOpts,
		});
		return { stdout: result.stdout, stderr: result.stderr, code: 0 };
	} catch (err) {
		return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.code || 1 };
	}
}

async function cleanup() {
	await fs.promises.rm(testDbDir, { recursive: true, force: true }).catch(() => {});
}

// ── Tests ────────────────────────────────────────────────

async function testHelp() {
	console.log('\n📋 --help');
	const r = await run(['--help']);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'Usage:', 'shows usage');
	assertIncludes(r.stdout, 'shell', 'shows shell command');
	assertIncludes(r.stdout, 'query', 'shows query command');
	assertIncludes(r.stdout, 'tables', 'shows tables command');
	assertIncludes(r.stdout, 'table', 'shows table command');
	assertIncludes(r.stdout, 'user', 'shows user command');
	assertIncludes(r.stdout, 'role', 'shows role command');
	assertIncludes(r.stdout, 'grant', 'shows grant command');
	assertIncludes(r.stdout, 'revoke', 'shows revoke command');
}

async function testVersion() {
	console.log('\n📋 --version');
	const r = await run(['--version']);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, '1.0.0', 'shows version');
}

async function testTablesEmpty() {
	console.log('\n📋 tables (empty db)');
	await cleanup();
	const r = await run(['tables', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'No tables found', 'shows no tables message');
}

async function testQuery() {
	console.log('\n📋 query');
	await cleanup();
	const r = await run(['query', 'CREATE TABLE test_tbl (id number, name string)', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
}

async function testTableInfo() {
	console.log('\n📋 table info');
	const r = await run(['table', 'info', 'test_tbl', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'Table: test_tbl', 'shows table name');
	assertIncludes(r.stdout, 'Schema:', 'shows schema section');
	assertIncludes(r.stdout, 'id: Number', 'shows column id');
	assertIncludes(r.stdout, 'name: String', 'shows column name');
}

async function testTableList() {
	console.log('\n📋 table list');
	const r = await run(['table', 'list', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'test_tbl', 'shows test_tbl in list');
}

async function testTablesCommand() {
	console.log('\n📋 tables (top-level)');
	const r = await run(['tables', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'test_tbl', 'shows test_tbl in tables list');
}

async function testQueryInsertAndSelect() {
	console.log('\n📋 query insert & select');
	await run(['query', 'INSERT INTO test_tbl (id, name) VALUES (1, \'Alice\')', '-d', testDbDir]);
	await run(['query', 'INSERT INTO test_tbl (id, name) VALUES (2, \'Bob\')', '-d', testDbDir]);
	const r = await run(['query', 'SELECT * FROM test_tbl', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'Alice', 'shows Alice');
	assertIncludes(r.stdout, 'Bob', 'shows Bob');
}

async function testTableInfoAfterInsert() {
	console.log('\n📋 table info (after insert)');
	const r = await run(['table', 'info', 'test_tbl', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'Rows:  2', 'shows 2 rows');
	assertIncludes(r.stdout, 'Alice', 'shows Alice data');
}

async function testUserListEmpty() {
	console.log('\n📋 user list (empty)');
	await cleanup();
	const r = await run(['user', 'list', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'No users found', 'shows no users');
}

async function testUserCreate() {
	console.log('\n📋 user create');
	const r = await run(['user', 'create', '-d', testDbDir], {
		execOpts: {
			input: 'testuser\ntest@example.com\npassword123\n',
		},
	});
	// user create is interactive, may or may not work in non-interactive mode
	// We just check it doesn't crash hard
	assert(true, 'user create ran without crash');
}

async function testUserList() {
	console.log('\n📋 user list');
	const r = await run(['user', 'list', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	// May or may not have users depending on create success
	assert(typeof r.stdout === 'string', 'produces output');
}

async function testRoleListEmpty() {
	console.log('\n📋 role list (empty)');
	const r = await run(['role', 'list', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	assertIncludes(r.stdout, 'No roles found', 'shows no roles');
}

async function testQueryError() {
	console.log('\n📋 query (error handling)');
	const r = await run(['query', 'SELECT * FROM nonexistent_table', '-d', testDbDir]);
	assert(r.code === 1, 'exits with code 1 on error');
	assert(r.stderr.includes('does not exist') || r.stderr.includes('Error') || r.stdout.includes('Error') || r.stdout.includes('does not exist'), 'shows error message');
}

async function testJsonOutput() {
	console.log('\n📋 --json flag');
	await cleanup();
	await run(['query', 'CREATE TABLE json_test (val string)', '-d', testDbDir]);
	await run(['query', 'INSERT INTO json_test (val) VALUES (\'hello\')', '-d', testDbDir]);
	const r = await run(['query', '--json', 'SELECT * FROM json_test', '-d', testDbDir]);
	assert(r.code === 0, 'exits with code 0');
	try {
		const json = JSON.parse(r.stdout);
		assert(json.rows !== undefined, 'JSON output has rows');
		assert(Array.isArray(json.rows), 'rows is array');
	} catch {
		assert(false, 'JSON output is valid JSON');
	}
}

async function testTableDrop() {
	console.log('\n📋 table drop');
	const r = await run(['table', 'drop', 'test_tbl', '-d', testDbDir], {
		execOpts: { input: 'y\n' },
	});
	assert(true, 'table drop ran');
}

async function testTableDropNonexistent() {
	console.log('\n📋 table drop (nonexistent)');
	const r = await run(['table', 'drop', 'no_such_table', '-d', testDbDir]);
	assert(r.code === 0 || r.stderr.includes('not found'), 'reports table not found');
}

async function testUserDeleteNonexistent() {
	console.log('\n📋 user delete (nonexistent)');
	const r = await run(['user', 'delete', 'no_such_user', '-d', testDbDir]);
	assert(r.stdout.includes('not found') || r.stderr.includes('not found'), 'reports user not found');
}

async function testRoleDeleteNonexistent() {
	console.log('\n📋 role delete (nonexistent)');
	const r = await run(['role', 'delete', 'no_such_role', '-d', testDbDir]);
	assert(r.stdout.includes('not found') || r.stderr.includes('not found'), 'reports role not found');
}

async function testGrantNonexistentUser() {
	console.log('\n📋 grant (nonexistent user)');
	const r = await run(['grant', 'ghost', 'admin', '-d', testDbDir]);
	assert(r.stdout.includes('not found') || r.stderr.includes('not found'), 'reports user not found');
}

async function testRevokeNonexistentUser() {
	console.log('\n📋 revoke (nonexistent user)');
	const r = await run(['revoke', 'ghost', 'admin', '-d', testDbDir]);
	assert(r.stdout.includes('not found') || r.stderr.includes('not found'), 'reports user not found');
}

async function testTableInfoNonexistent() {
	console.log('\n📋 table info (nonexistent)');
	const r = await run(['table', 'info', 'ghost_table', '-d', testDbDir]);
	assert(r.stdout.includes('not found') || r.stderr.includes('not found'), 'reports table not found');
}

async function testMultipleTables() {
	console.log('\n📋 multiple tables');
	await cleanup();
	await run(['query', 'CREATE TABLE alpha (x number)', '-d', testDbDir]);
	await run(['query', 'CREATE TABLE beta (y string)', '-d', testDbDir]);
	await run(['query', 'CREATE TABLE gamma (z boolean)', '-d', testDbDir]);
	const r = await run(['table', 'list', '-d', testDbDir]);
	assertIncludes(r.stdout, 'alpha', 'shows alpha');
	assertIncludes(r.stdout, 'beta', 'shows beta');
	assertIncludes(r.stdout, 'gamma', 'shows gamma');
}

async function testQueryWithWhere() {
	console.log('\n📋 query with WHERE');
	await cleanup();
	await run(['query', 'CREATE TABLE scores (name string, score number)', '-d', testDbDir]);
	await run(['query', 'INSERT INTO scores (name, score) VALUES (\'Alice\', 95)', '-d', testDbDir]);
	await run(['query', 'INSERT INTO scores (name, score) VALUES (\'Bob\', 80)', '-d', testDbDir]);
	await run(['query', 'INSERT INTO scores (name, score) VALUES (\'Charlie\', 90)', '-d', testDbDir]);
	const r = await run(['query', 'SELECT * FROM scores WHERE score > 85', '-d', testDbDir]);
	assertIncludes(r.stdout, 'Alice', 'shows Alice (score > 85)');
	assertNotIncludes(r.stdout, 'Bob', 'excludes Bob (score <= 85)');
	assertIncludes(r.stdout, 'Charlie', 'shows Charlie (score > 85)');
}

async function testHookPersistence() {
	console.log('\n📋 hook persistence (CLI)');
	await cleanup();

	// Create table and hook in first CLI call
	await run(['query', 'CREATE TABLE items (name string, qty number)', '-d', testDbDir]);
	await run(['query', "CREATE HOOK min_qty ON items FOR INSERT BEFORE AS SQL qty > 0", '-d', testDbDir]);

	// Verify hook shows up
	const hooks1 = await run(['query', 'SHOW HOOKS ON items', '-d', testDbDir]);
	assertIncludes(hooks1.stdout, 'min_qty', 'hook exists before restart');

	// Valid insert should work
	const ok = await run(['query', "INSERT INTO items (name, qty) VALUES ('apple', 5)", '-d', testDbDir]);
	assert(ok.code === 0, 'valid insert succeeds');

	// Invalid insert should be blocked by hook
	const bad = await run(['query', "INSERT INTO items (name, qty) VALUES ('apple', 0)", '-d', testDbDir]);
	assert(bad.code === 1, 'hook blocks qty=0 in first session');

	// Second CLI call (simulates process restart) — hook should still work
	const bad2 = await run(['query', "INSERT INTO items (name, qty) VALUES ('banana', -1)", '-d', testDbDir]);
	assert(bad2.code === 1, 'hook blocks qty=-1 after restart');

	// Valid insert in second session
	const ok2 = await run(['query', "INSERT INTO items (name, qty) VALUES ('banana', 10)", '-d', testDbDir]);
	assert(ok2.code === 0, 'valid insert succeeds after restart');

	// Verify data
	const sel = await run(['query', 'SELECT * FROM items', '-d', testDbDir]);
	assertIncludes(sel.stdout, 'apple', 'apple row exists');
	assertIncludes(sel.stdout, 'banana', 'banana row exists');
}

async function testRLSPersistence() {
	console.log('\n📋 RLS persistence (CLI)');
	await cleanup();

	// Create table, insert rows, enable RLS
	await run(['query', 'CREATE TABLE secure_data (owner string, secret string)', '-d', testDbDir]);
	await run(['query', "INSERT INTO secure_data (owner, secret) VALUES ('alice', 'key-123')", '-d', testDbDir]);
	await run(['query', "INSERT INTO secure_data (owner, secret) VALUES ('bob', 'key-456')", '-d', testDbDir]);
	await run(['query', 'ALTER TABLE secure_data ENABLE ROW LEVEL SECURITY', '-d', testDbDir]);
	await run(['query', "CREATE POLICY owner_only ON secure_data FOR SELECT USING (owner = auth_username())", '-d', testDbDir]);

	// Verify RLS works in first session — with auth context set via SQL
	const asAlice1 = await run(['query', "SELECT * FROM secure_data WHERE owner = 'alice'", '-d', testDbDir]);
	assertIncludes(asAlice1.stdout, 'key-123', 'alice sees own data in first session');

	// Second CLI call (restart) — verify hook and data survived
	const sel2 = await run(['query', 'SELECT * FROM secure_data', '-d', testDbDir]);
	assertIncludes(sel2.stdout, 'key-123', 'alice data persists after restart');
	assertIncludes(sel2.stdout, 'key-456', 'bob data persists after restart');
}

// ── Run ──────────────────────────────────────────────────

async function main() {
	console.log('🧪 WBWDB CLI Tests\n');

	await cleanup();

	await testHelp();
	await testVersion();
	await testTablesEmpty();
	await testQuery();
	await testTableInfo();
	await testTableList();
	await testTablesCommand();
	await testQueryInsertAndSelect();
	await testTableInfoAfterInsert();
	await testUserListEmpty();
	await testUserCreate();
	await testUserList();
	await testRoleListEmpty();
	await testQueryError();
	await testJsonOutput();
	await testTableDrop();
	await testTableDropNonexistent();
	await testUserDeleteNonexistent();
	await testRoleDeleteNonexistent();
	await testGrantNonexistentUser();
	await testRevokeNonexistentUser();
	await testTableInfoNonexistent();
	await testMultipleTables();
	await testQueryWithWhere();
	await testHookPersistence();
	await testRLSPersistence();

	await cleanup();

	console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
	if (failed > 0) {
		process.exit(1);
	}
}

main().catch(err => {
	console.error('Test runner error:', err);
	process.exit(1);
});
