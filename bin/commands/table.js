import { CliTools } from 'wbw-cli-tools-lib';
import { initDB } from '../lib/db.js';
import { displayTable } from '../lib/display.js';

export async function listTables(dbPath) {
	const cli = CliTools.create({ commandName: 'wbwdb-tables', commandDescription: 'List tables' });
	const db = await initDB(dbPath);

	const tables = [...db.dbTables.entries()];
	if (tables.length === 0) {
		cli.info('No tables found.');
		return;
	}

	displayTable({
		columns: ['name', 'rows', 'columns'],
		rows: tables.map(([name, table]) => ({
			name,
			rows: String(table.rows.length),
			columns: Object.keys(table.schema).join(', '),
		})),
		row_count: tables.length,
	});
}

export async function tableInfo(dbPath, tableName) {
	const db = await initDB(dbPath);
	const table = db.dbTables.get(tableName);

	if (!table) {
		console.error(`Error: Table "${tableName}" not found.`);
		process.exit(1);
	}

	console.log(`Table: ${tableName}`);
	console.log(`Rows:  ${table.rows.length}`);
	console.log('\nSchema:');
	for (const [col, type] of Object.entries(table.schema)) {
		console.log(`  ${col}: ${type}`);
	}

	if (table.rows.length > 0) {
		console.log('\nData:');
		displayTable({
			columns: Object.keys(table.schema),
			rows: table.rows.slice(0, 20),
			row_count: table.rows.length,
		});
	}
}

export async function createTable(dbPath) {
	const cli = CliTools.create({ commandName: 'wbwdb-table-create', commandDescription: 'Create table' });
	const db = await initDB(dbPath);

	const name = await cli.promptInput('Table name:');
	if (!name) { cli.warn('Cancelled.'); return; }

	if (db.dbTables.has(name)) {
		cli.error(`Table "${name}" already exists.`);
		return;
	}

	const schemaStr = await cli.promptInput('Schema (JSON, e.g. {"name":"string","age":"number"}):', {
		validate: (v) => {
			try { JSON.parse(v); return true; } catch { return 'Invalid JSON'; }
		},
	});
	if (!schemaStr) { cli.warn('Cancelled.'); return; }

	const schema = JSON.parse(schemaStr);

	cli.spinnerStart('Creating table...');
	try {
		await db.createTable(name, schema);
		await db.save();
		cli.spinnerSucceed(`Table "${name}" created.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

export async function dropTable(dbPath, tableName) {
	const cli = CliTools.create({ commandName: 'wbwdb-table-drop', commandDescription: 'Drop table' });
	const db = await initDB(dbPath);

	if (!db.dbTables.has(tableName)) {
		cli.error(`Table "${tableName}" not found.`);
		return;
	}

	const ok = await cli.promptConfirm(`Drop table "${tableName}"? This cannot be undone.`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Dropping table...');
	try {
		await db.dropTable(tableName);
		await db.save();
		cli.spinnerSucceed(`Table "${tableName}" dropped.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}
