import * as readline from 'node:readline';
import { CliTools } from 'wbw-cli-tools-lib';
import { initDB } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';

const SQL_KEYWORDS = [
	'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
	'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT',
	'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS',
	'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
	'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
	'ASC', 'DESC', 'TRUE', 'FALSE', 'PRIMARY', 'KEY', 'DEFAULT',
];

export function registerShellCommand(parent, cli) {
	parent
		.command('shell')
		.alias('sh')
		.description('Interactive SQL shell')
		.action(async function () {
			const opts = this.parent.opts();
			await shell(opts.db, cli);
		});

	parent
		.command('query')
		.alias('q')
		.argument('<sql...>', 'SQL statement')
		.description('Execute a SQL statement')
		.action(async function (sqlParts) {
			const opts = this.parent.opts();
			const sql = sqlParts.join(' ');
			await query(opts.db, sql, opts, cli);
		});
}

export async function shell(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb-shell', commandDescription: 'Interactive SQL Shell' });
	const db = await initDB(dbPath);

	const tableNames = [...db.dbTables.keys()];

	cli.printBanner('WBWDB SQL Shell');
	cli.info('Type SQL statements or use meta-commands:');
	cli.print('  \\dt             List all tables');
	cli.print('  \\d <name>       Describe table');
	cli.print('  \\schema <name>  Show table schema as JSON');
	cli.print('  \\clear           Clear screen');
	cli.print('  \\q              Quit');
	cli.newline();

	const rl = readline.createInterface({
		// eslint-disable-next-line no-undef
		input: process.stdin,
		// eslint-disable-next-line no-undef
		output: process.stdout,
		prompt: 'wbwdb> ',
		completer: (line) => {
			const trimmed = line.trimStart();
			const hits = [];

			if (trimmed.startsWith('\\d ')) {
				const prefix = trimmed.slice(3);
				for (const name of tableNames) {
					if (name.startsWith(prefix)) hits.push(`\\d ${name}`);
				}
			} else if (trimmed.startsWith('\\')) {
				const meta = ['\\dt', '\\d ', '\\schema ', '\\clear', '\\q'];
				for (const m of meta) {
					if (m.startsWith(trimmed)) hits.push(m);
				}
			} else {
				const upper = trimmed.toUpperCase();
				for (const kw of SQL_KEYWORDS) {
					if (kw.startsWith(upper)) hits.push(line.slice(0, line.trimStart().length - trimmed.length) + kw);
				}
				for (const name of tableNames) {
					if (name.toUpperCase().startsWith(upper)) hits.push(line.slice(0, line.trimStart().length - trimmed.length) + name);
				}
			}

			return [hits.length ? hits : [line], line];
		},
	});

	rl.prompt();

	rl.on('line', (line) => {
		const input = line.trim();
		if (!input) {
			rl.prompt();
			return;
		}

		if (input === '\\q' || input === '\\quit') {
			cli.success('Bye!');
			rl.close();
			return;
		}

		if (input === '\\clear') {
			// eslint-disable-next-line no-undef
			process.stdout.write('\x1Bc');
			rl.prompt();
			return;
		}

		if (input === '\\dt') {
			const tables = db.dbTables.size;
			if (tables === 0) {
				cli.info('No tables found.');
			} else {
				for (const [name, table] of db.dbTables) {
					const cols = [...table.schema.map.keys()].join(', ');
					cli.print(`  ${name} (${table.rows.length} rows) [${cols}]`);
				}
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\d ')) {
			const tableName = input.slice(3).trim();
			const table = db.dbTables.get(tableName);
			if (!table) {
				cli.error(`Table "${tableName}" not found.`);
			} else {
				cli.print(`Table: ${tableName}`);
				cli.print(`Rows:  ${table.rows.length}`);
				cli.print('Schema:');
				for (const [col, type] of table.schema.map.entries()) {
					cli.print(`  ${col}: ${type.t.name}`);
				}
				if (table.rows.length > 0) {
					cli.print('\nSample data:');
					displayTable({
						columns: [...table.schema.map.keys()],
						rows: table.rows.slice(0, 5).map(r => Object.fromEntries(r.row)),
						row_count: table.rows.length,
					});
				}
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\schema ')) {
			const tableName = input.slice(8).trim();
			const table = db.dbTables.get(tableName);
			if (!table) {
				cli.error(`Table "${tableName}" not found.`);
			} else {
				displayJSON({ table: tableName, schema: Object.fromEntries([...table.schema.map.entries()].map(([k, v]) => [k, v.t.name])) });
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\')) {
			cli.error(`Unknown command: ${input}`);
			cli.info('Available commands: \\dt, \\d <name>, \\schema <name>, \\clear, \\q');
			rl.prompt();
			return;
		}

		try {
			const result = db.query(input);
			displayTable(result);
	} catch (err) {
		cli.error(err.message);
	}
	rl.prompt();
});

rl.on('close', () => {
	// eslint-disable-next-line no-undef
	process.exit(0);
});
}

export async function query(dbPath, sql, opts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
	const db = await initDB(dbPath);
	try {
		const result = db.query(sql);
		await db.save();
		if (opts?.json) {
			displayJSON(result);
		} else {
			displayTable(result);
		}
	} catch (err) {
		if (opts?.json) {
			displayJSON({ error: err.message });
		} else {
			cli.error(err.message);
		}
		// eslint-disable-next-line no-undef
		process.exit(1);
	}
}
