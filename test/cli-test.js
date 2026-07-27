import { wbwdbManager } from '../lib/index.js';

const db = new wbwdbManager('./data');
await db.init();
try {
	const result = db.query('CREATE TABLE users (name string, age number)');
	console.log('CREATE OK:', result);
} catch(e) {
	console.error('CREATE ERR:', e.message);
}

try {
	const r2 = db.query("INSERT INTO users VALUES ('Alice', 25), ('Bob', 30), ('Charlie', 35)");
	console.log('INSERT OK:', r2);
} catch(e) {
	console.error('INSERT ERR:', e.message);
}

try {
	const r3 = db.query('SELECT * FROM users');
	console.log('SELECT OK:', r3);
} catch(e) {
	console.error('SELECT ERR:', e.message);
}

await db.save();
console.log('Saved.');
