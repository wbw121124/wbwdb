import { SQLHintEngine } from '../lib/index.js';

// Create a mock database with tables
const dbTables = new Map();
dbTables.set('users', {
	schema: {
		map: new Map([
			['id', { t: { name: 'INTEGER' }, nullable: false, defaultVal: null }],
			['name', { t: { name: 'TEXT' }, nullable: false, defaultVal: null }],
			['email', { t: { name: 'TEXT' }, nullable: true, defaultVal: null }],
			['age', { t: { name: 'INTEGER' }, nullable: true, defaultVal: null }]
		])
	}
});
dbTables.set('orders', {
	schema: {
		map: new Map([
			['id', { t: { name: 'INTEGER' }, nullable: false, defaultVal: null }],
			['user_id', { t: { name: 'INTEGER' }, nullable: false, defaultVal: null }],
			['amount', { t: { name: 'NUMERIC' }, nullable: false, defaultVal: null }],
			['created_at', { t: { name: 'TIMESTAMP' }, nullable: true, defaultVal: null }]
		])
	}
});

const engine = new SQLHintEngine({ dbTables });

console.log('=== Testing AST-based SQL Hints ===\n');

// Test 1: SELECT with FROM - should suggest columns from users table
console.log('Test 1: SELECT * FROM users WHERE |');
let hints = engine.getSuggestions('SELECT * FROM users WHERE ', 28);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

// Test 2: SELECT column list - should suggest columns
console.log('Test 2: SELECT | FROM users');
hints = engine.getSuggestions('SELECT ', 7);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

// Test 3: INSERT INTO - should suggest columns
console.log('Test 3: INSERT INTO users (|)');
hints = engine.getSuggestions('INSERT INTO users (', 19);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

// Test 4: UPDATE SET - should suggest columns
console.log('Test 4: UPDATE users SET |');
hints = engine.getSuggestions('UPDATE users SET ', 17);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

// Test 5: JOIN - should suggest table names
console.log('Test 5: SELECT * FROM users JOIN |');
hints = engine.getSuggestions('SELECT * FROM users JOIN ', 25);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

// Test 6: ORDER BY - should suggest columns
console.log('Test 6: SELECT * FROM users ORDER BY |');
hints = engine.getSuggestions('SELECT * FROM users ORDER BY ', 30);
console.log('Hints:', hints.slice(0, 5).map(h => `${h.text} (${h.type})`));
console.log();

console.log('=== All tests completed ===');