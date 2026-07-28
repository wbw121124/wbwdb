import { wbwdbManager } from '../lib/index.js';
import * as fs from 'node:fs';

const testDir = '../.test_hook_data';

async function cleanup() {
	await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
}

async function testBasicHook() {
	console.log('\n--- Test: Basic Hook ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');

	// BEFORE INSERT JS hook
	db.query("CREATE HOOK validate_name ON users FOR INSERT BEFORE AS JS $$ if (!row.name || row.name.length < 2) throw new Error('Name too short'); $$");
	console.log('✓ CREATE HOOK (JS BEFORE)');

	// BEFORE INSERT SQL hook
	db.query("CREATE HOOK require_age ON users FOR INSERT BEFORE AS SQL age > 0");
	console.log('✓ CREATE HOOK (SQL BEFORE)');

	// AFTER INSERT hook
	db.query("CREATE HOOK log_insert ON users FOR INSERT AFTER AS JS $$ console.log('Inserted:', row.name); $$");
	console.log('✓ CREATE HOOK (AFTER)');

	// Show hooks
	const hooks = db.query('SHOW HOOKS ON users');
	console.log('Hooks:', hooks.rows.length, '(expected 3)');
	console.assert(hooks.rows.length === 3, 'Should have 3 hooks');

	// Insert should pass
	db.query("INSERT INTO users (name, age) VALUES ('Alice', 30)");
	console.log('✓ INSERT passed hooks');

	// Insert with short name should fail
	try {
		db.query("INSERT INTO users (name, age) VALUES ('A', 30)");
		console.log('✗ Should have thrown');
		process.exit(1);
	} catch (err) {
		console.log('✓ Hook blocked short name:', err.message);
	}

	// Insert with age <= 0 should fail
	try {
		db.query("INSERT INTO users (name, age) VALUES ('Bob', 0)");
		console.log('✗ Should have thrown');
		process.exit(1);
	} catch (err) {
		console.log('✓ SQL Hook blocked age <= 0:', err.message);
	}
}

async function testPersistence() {
	console.log('\n--- Test: Persistence ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');
	db.query("CREATE HOOK my_hook ON users FOR INSERT BEFORE AS JS $$ row.name = row.name || '_modified'; $$");

	// Save and reload
	await db.save();

	const db2 = new wbwdbManager(testDir);
	await db2.init();
	const hooks = db2.query('SHOW HOOKS ON users');
	console.log('Hooks after reload:', hooks.rows.length, '(expected 1)');
	console.assert(hooks.rows.length === 1, 'Should have 1 hook after reload');
	console.assert(hooks.rows[0].name === 'my_hook', 'Hook name should match');
}

async function testDropHook() {
	console.log('\n--- Test: Drop Hook ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String)');
	db.query("CREATE HOOK h1 ON users FOR INSERT BEFORE AS JS $$ $$");
	db.query("CREATE HOOK h2 ON users FOR INSERT BEFORE AS JS $$ $$");

	let hooks = db.query('SHOW HOOKS ON users');
	console.assert(hooks.rows.length === 2, 'Should have 2 hooks');

	db.query('DROP HOOK h1 ON users');
	hooks = db.query('SHOW HOOKS ON users');
	console.log('After drop:', hooks.rows.length, '(expected 1)');
	console.assert(hooks.rows.length === 1, 'Should have 1 hook');
	console.assert(hooks.rows[0].name === 'h2', 'Remaining hook should be h2');
}

async function testRLSPersistence() {
	console.log('\n--- Test: RLS Persistence ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');
	db.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
	db.query("CREATE POLICY user_isolation ON users FOR ALL USING (true)");

	await db.save();

	const db2 = new wbwdbManager(testDir);
	await db2.init();
	const table = db2.getTable('users');
	console.log('RLS enabled:', table.rlsEnabled, '(expected true)');
	console.log('RLS forced:', table.rlsForced, '(expected false)');
	console.log('Policies:', table.policies.length, '(expected 1)');
	console.assert(table.rlsEnabled === true, 'RLS should be enabled');
	console.assert(table.policies.length === 1, 'Should have 1 policy');
	console.assert(table.policies[0].name === 'user_isolation', 'Policy name should match');
}

async function testHookModifyRow() {
	console.log('\n--- Test: Hook Modify Row ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');
	db.query("CREATE HOOK transform ON users FOR INSERT BEFORE AS JS $$ row.name = row.name.toUpperCase(); $$");

	db.query("INSERT INTO users (name, age) VALUES ('alice', 30)");
	const result = db.query("SELECT * FROM users");
	console.log('Modified name:', result.rows[0].name, '(expected ALICE)');
	console.assert(result.rows[0].name === 'ALICE', 'Name should be uppercased');
}

async function testHookPersistenceExecution() {
	console.log('\n--- Test: Hook Persistence (Execution) ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');

	// JS BEFORE hook: block short names
	db.query("CREATE HOOK validate_name ON users FOR INSERT BEFORE AS JS $$ if (!row.name || row.name.length < 2) throw new Error('Name too short'); $$");

	// SQL BEFORE hook: block age <= 0
	db.query("CREATE HOOK require_age ON users FOR INSERT BEFORE AS SQL age > 0");

	// JS BEFORE hook: modify row
	db.query("CREATE HOOK upper_name ON users FOR INSERT BEFORE AS JS $$ row.name = row.name.toUpperCase(); $$");

	// Verify hooks work before save
	db.query("INSERT INTO users (name, age) VALUES ('alice', 30)");
	const before = db.query("SELECT * FROM users");
	console.assert(before.rows[0].name === 'ALICE', 'Before save: name should be uppercased');

	// Save and reload into new instance
	await db.save();
	const db2 = new wbwdbManager(testDir);
	await db2.init();

	// Verify all 3 hooks survived
	const hooks = db2.query('SHOW HOOKS ON users');
	console.assert(hooks.rows.length === 3, 'Reloaded: should have 3 hooks, got ' + hooks.rows.length);
	console.log('✓ Hooks survived reload:', hooks.rows.length);

	// Verify JS hook modifies row after reload
	db2.query("INSERT INTO users (name, age) VALUES ('bob', 25)");
	const rows = db2.query("SELECT * FROM users WHERE name = 'BOB'");
	console.assert(rows.rows.length === 1 && rows.rows[0].name === 'BOB', 'Reloaded: JS hook should modify row');
	console.log('✓ JS hook modifies row after reload');

	// Verify JS hook still blocks short names after reload
	try {
		db2.query("INSERT INTO users (name, age) VALUES ('X', 10)");
		console.assert(false, 'Should have thrown');
	} catch (err) {
		console.log('✓ JS hook blocks short name after reload:', err.message);
	}

	// Verify SQL hook still blocks after reload
	try {
		db2.query("INSERT INTO users (name, age) VALUES ('Charlie', -1)");
		console.assert(false, 'Should have thrown');
	} catch (err) {
		console.log('✓ SQL hook blocks invalid data after reload:', err.message);
	}

	// Verify valid insert still works
	db2.query("INSERT INTO users (name, age) VALUES ('Dave', 50)");
	const final = db2.query("SELECT * FROM users WHERE name = 'DAVE'");
	console.assert(final.rows.length === 1, 'Reloaded: valid insert should succeed');
	console.log('✓ Valid insert works after reload');
}

async function testRLSPersistenceExecution() {
	console.log('\n--- Test: RLS Persistence (Execution) ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE secrets (owner String, data String)');
	db.query("INSERT INTO secrets (owner, data) VALUES ('alice', 'alice-secret')");
	db.query("INSERT INTO secrets (owner, data) VALUES ('bob', 'bob-secret')");

	// Enable RLS and create policy
	db.query('ALTER TABLE secrets ENABLE ROW LEVEL SECURITY');
	db.query("CREATE POLICY owner_isolation ON secrets FOR SELECT USING (owner = auth_username())");

	// Set auth and verify RLS works before save
	db.getSQL().setAuthContext({ userId: '1', username: 'alice', roles: [], permissions: [] });
	const before = db.query("SELECT * FROM secrets");
	console.assert(before.rows.length === 1 && before.rows[0].data === 'alice-secret', 'Before save: alice should see own row');

	// Save and reload
	await db.save();
	const db2 = new wbwdbManager(testDir);
	await db2.init();

	// Verify RLS metadata survived
	const table = db2.getTable('secrets');
	console.assert(table.rlsEnabled === true, 'Reloaded: RLS should be enabled');
	console.assert(table.policies.length === 1, 'Reloaded: should have 1 policy');
	console.assert(table.policies[0].name === 'owner_isolation', 'Reloaded: policy name should match');
	console.log('✓ RLS metadata survived reload');

	// Set auth to alice and verify RLS still filters
	db2.getSQL().setAuthContext({ userId: '1', username: 'alice', roles: [], permissions: [] });
	const aliceRows = db2.query("SELECT * FROM secrets");
	console.assert(aliceRows.rows.length === 1, 'Reloaded: alice should see 1 row');
	console.assert(aliceRows.rows[0].data === 'alice-secret', 'Reloaded: alice should see own data');
	console.log('✓ RLS filters correctly for alice after reload');

	// Switch to bob
	db2.getSQL().setAuthContext({ userId: '2', username: 'bob', roles: [], permissions: [] });
	const bobRows = db2.query("SELECT * FROM secrets");
	console.assert(bobRows.rows.length === 1, 'Reloaded: bob should see 1 row');
	console.assert(bobRows.rows[0].data === 'bob-secret', 'Reloaded: bob should see own data');
	console.log('✓ RLS filters correctly for bob after reload');

	// Clear auth — superUser=true, so all rows visible regardless of FORCE
	db2.getSQL().setAuthContext(null);
	const noAuthRows = db2.query("SELECT * FROM secrets");
	console.assert(noAuthRows.rows.length === 2, 'Reloaded: no auth (superUser) should see all 2 rows');
	console.log('✓ No auth context → superUser → all rows visible');

	// Verify FORCE RLS still blocks non-owner with auth
	db2.query('ALTER TABLE secrets FORCE ROW LEVEL SECURITY');
	db2.getSQL().setAuthContext({ userId: '1', username: 'alice', roles: [], permissions: [] });
	const aliceForced = db2.query("SELECT * FROM secrets");
	console.assert(aliceForced.rows.length === 1, 'FORCE: alice still sees own row');
	console.assert(aliceForced.rows[0].data === 'alice-secret', 'FORCE: alice sees correct data');

	db2.getSQL().setAuthContext({ userId: '2', username: 'bob', roles: [], permissions: [] });
	const bobForced = db2.query("SELECT * FROM secrets");
	console.assert(bobForced.rows.length === 1, 'FORCE: bob still sees own row');
	console.log('✓ FORCE RLS enforces per-user isolation with auth');
}

async function testEventListeners() {
	console.log('\n--- Test: Event Listeners ---');
	await cleanup();
	const db = new wbwdbManager(testDir);
	await db.init();

	db.query('CREATE TABLE users (name String, age Number)');

	let insertFired = false;
	db.on('afterInsert', 'users', (result) => {
		insertFired = true;
		console.log('  afterInsert fired, rows:', result.rowCount);
	});

	db.query("INSERT INTO users (name, age) VALUES ('Alice', 30)");
	console.log('Event listener fired:', insertFired, '(expected true)');
	console.assert(insertFired === true, 'afterInsert should have fired');
}

async function main() {
	try {
		await testBasicHook();
		await testPersistence();
		await testDropHook();
		await testRLSPersistence();
		await testHookModifyRow();
		await testHookPersistenceExecution();
		await testRLSPersistenceExecution();
		await testEventListeners();
		console.log('\n✅ All hook/RLS tests passed!');
		await cleanup();
	} catch (err) {
		console.error('\n❌ Test failed:', err);
		process.exit(1);
	}
}

main();
