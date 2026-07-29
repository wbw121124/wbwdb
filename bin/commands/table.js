import { CliTools } from 'wbw-cli-tools-lib';
import { initDB } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';
import { DBSchema, escapeJsonString } from '../../lib/index.js'

function getRootOpts(command) {
	let c = command;
	while (c.parent) c = c.parent;
	return c.opts();
}

export function registerTableCommands(parent, cli) {
	const cmd = parent.command('table').description('Table management');

	cmd
		.command('list')
		.alias('ls')
		.description('List all tables')
		.action(async function () {
			const opts = getRootOpts(this);
			await listTables(opts.db, opts, cli);
		});

	cmd
		.command('info')
		.argument('[name]', 'Table name')
		.description('Show table schema and data')
		.action(async function (name) {
			const opts = getRootOpts(this);
			if (!name) {
				const db = await initDB(opts.db);
				const tables = [...db.dbTables.keys()];
				if (tables.length === 0) {
					cli.info('No tables found.');
					return;
				}
				name = await cli.promptSelect('Select table:', tables);
				if (!name) return;
			}
			await tableInfo(opts.db, name, opts);
		});

	cmd
		.command('create')
		.description('Create a new table')
		.action(async function () {
			const opts = getRootOpts(this);
			await createTable(opts.db, cli);
		});

	cmd
		.command('drop')
		.argument('<name>', 'Table name')
		.description('Drop a table')
		.action(async function (name) {
			const opts = getRootOpts(this);
			await dropTable(opts.db, name, cli);
		});
}

export async function listTables(dbPath, opts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
	const db = await initDB(dbPath);
	const tables = [...db.dbTables.entries()];

	if (tables.length === 0) {
		if (opts?.json) {
			displayJSON({ tables: [] });
		} else {
			cli.info('No tables found.');
		}
		return;
	}

	const data = tables.map(([name, table]) => ({
		name,
		rows: table.rows.length,
		columns: [...table.schema.map.keys()],
	}));

	if (opts?.json) {
		displayJSON(data);
	} else {
		displayTable({
			columns: ['name', 'rows', 'columns'],
			rows: data.map(r => ({ ...r, columns: r.columns.join(', ') })),
			row_count: data.length,
		});
	}
}

export async function tableInfo(dbPath, tableName, opts) {
	const db = await initDB(dbPath);
	const table = db.dbTables.get(tableName);

	if (!table) {
		const cli = CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
		cli.error(`Table "${tableName}" not found.`);
		return;
	}

	const data = {
		name: tableName,
		rows: table.rows.length,
		schema: Object.fromEntries([...table.schema.map.entries()].map(([k, v]) => [k, v.t.name])),
		data: table.rows.slice(0, 20).map(r => Object.fromEntries(r.row)),
	};

	if (opts?.json) {
		displayJSON(data);
	} else {
		const cli = CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
		cli.print(`Table: ${tableName}`);
		cli.print(`Rows:  ${table.rows.length}`);
		cli.print('\nSchema:');
		for (const [col, type] of table.schema.map.entries()) {
			cli.print(`  ${col}: ${type.t.name}`);
		}
		if (table.rows.length > 0) {
			cli.print('\nData:');
			displayTable({
				columns: [...table.schema.map.keys()],
				rows: table.rows.slice(0, 20).map(r => Object.fromEntries(r.row)),
				row_count: table.rows.length,
			});
		}
	}
}

export async function createTable(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Create table' });
	const db = await initDB(dbPath);

	const name = await cli.promptInput('Table name:');
	if (!name) { cli.warn('Cancelled.'); return; }

	if (db.dbTables.has(name)) {
		cli.error(`Table "${name}" already exists.`);
		return;
	}

	const schema = new Map();
	cli.info('Define columns (enter empty name to finish):');

	while (true) {
		const colName = await cli.promptInput(`  Column name (empty to finish):`);
		if (!colName) break;

		if (schema.has(colName)) {
			cli.warn(`Column "${colName}" already defined.`);
			continue;
		}

		const colType = await cli.promptSelect(`  Type for "${colName}":`, [
			{ value: 'String', name: 'string' },
			{ value: 'Number', name: 'number' },
			{ value: 'Boolean', name: 'boolean' },
			{ value: 'Email', name: 'email' },
			{ value: 'Phone', name: 'phone' },
			{ value: 'UUID', name: 'uuid' },
		]);
		if (!colType) break;

		schema.set(colName, colType);
		cli.success(`  ${colName}: ${colType}`);
	}

	const a = [];
	for (const [key, value] of schema.entries())
		a.push(`"${escapeJsonString(key)}":"${escapeJsonString(value)}"`);
	cli.info(`Schema: {${a.join(',')}}`);
	const ok = await cli.promptConfirm(`Create table "${name}"?`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Creating table...');
	try {
		await db.createTable(name, DBSchema.fromStrMap(schema));
		await db.save();
		cli.spinnerSucceed(`Table "${name}" created.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

export async function dropTable(dbPath, tableName, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb' });
	const db = await initDB(dbPath);

	if (!db.dbTables.has(tableName)) {
		cli.error(`Table "${tableName}" not found.`);
		return;
	}

	// 1. 危险操作前的红色警告与确认
	cli.warn(`You are about to delete table "${tableName}". This action cannot be undone.`);
	const ok = await cli.promptConfirm('Are you absolutely sure?');

	if (!ok) {
		cli.info('Operation cancelled by user.');
		return;
	}

	// 2. Spinner 模拟处理过程
	cli.spinnerStart(`Dropping table "${tableName}"...`);

	try {
		await db.dropTable(tableName);
		await db.save();
		// 3. 成功后的绿色提示
		cli.spinnerSucceed(`Table "${tableName}" has been permanently deleted.`);
	} catch (err) {
		cli.spinnerFail('Failed to drop table.');
		cli.error(err.message);
	}
}