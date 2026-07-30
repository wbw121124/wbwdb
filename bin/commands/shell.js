import * as readline from 'node:readline';
import { CliTools } from 'wbw-cli-tools-lib';
import { initDB, SQLHintEngine } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';

const SQL_KEYWORDS = [
	'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
	'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT',
	'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS',
	'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
	'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
	'ASC', 'DESC', 'TRUE', 'FALSE', 'PRIMARY', 'KEY', 'DEFAULT',
];

// [FIX] Check if SQL statement is complete (balanced parentheses, quotes, and $$ strings)
function isSQLComplete(input) {
	let parentheses = 0;
	let inString = false;
	let stringChar = null;
	let inDollarString = false;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }

		if (inDollarString) {
			// Check for closing $$
			if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
				inDollarString = false;
				i++; // skip next $
			}
			continue;
		}

		if (inString) {
			if (ch === stringChar) inString = false;
			continue;
		}

		// Check for opening $$ string
		if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
			inDollarString = true;
			i++; // skip next $
			continue;
		}

		if (ch === "'" || ch === '"') {
			inString = true;
			stringChar = ch;
			continue;
		}

		if (ch === '(') parentheses++;
		else if (ch === ')') parentheses--;
	}

	return parentheses === 0 && !inString && !inDollarString;
}

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

const sqlHintEngine = new SQLHintEngine({ dbTables: new Map() });

export async function shell(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb-shell', commandDescription: 'Interactive SQL Shell' });
	const db = await initDB(dbPath);

	const tableNames = [...db.dbTables.keys()];

	// [FIX] Multi-line SQL state
	let multiLineBuffer = '';
	let inMultiLine = false;

	cli.printBanner('WBWDB SQL Shell');
	cli.info('Type SQL statements or use meta-commands:');
	cli.print('  \\help           Show all commands');
	cli.print('  \\help <cmd>     Show help for a command');
	cli.print('  \\dt             List all tables');
	cli.print('  \\d <name>       Describe table');
	cli.print('  \\schema <name>  Show table schema as JSON');
	cli.print('  \\clear          Clear screen');
	cli.print('  \\hint <sql>     Show hint');
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
				const meta = ['\\help ', '\\help', '\\h ', '\\h', '\\?', '\\dt', '\\d ', '\\schema ', '\\clear', '\\q', '\\hint'];
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

		// clearListArea(1);
		const input = line.trim();

		// [FIX] Handle multi-line SQL input
		if (inMultiLine) {
			multiLineBuffer += '\n' + line;
			if (isSQLComplete(multiLineBuffer)) {
				inMultiLine = false;
				rl.setPrompt('wbwdb> ');
				executeQuery(db, multiLineBuffer, cli);
				multiLineBuffer = '';
			} else {
				rl.setPrompt('...> ');
			}
			rl.prompt();
			return;
		}

		if (!input) {
			rl.prompt();
			return;
		}

		if (input === '\\q' || input === '\\quit') {
			cli.success('Bye!');
			rl.close();
			return;
		}

		// [FIX] Help system
		if (input === '\\help' || input === '\\h' || input === '\\?') {
			cli.info('Available commands:');
			cli.print('');
			cli.print('  \\help           Show this help message');
			cli.print('  \\help <cmd>     Show detailed help for a command');
			cli.print('  \\dt             List all tables');
			cli.print('  \\d <name>       Describe table (columns, row count, sample data)');
			cli.print('  \\schema <name>  Show table schema as JSON');
			cli.print('  \\clear          Clear screen');
			cli.print('  \\hint <sql>     Show hint');
			cli.print('  \\q              Quit the shell');
			cli.print('');
			cli.info('SQL features:');
			cli.print('  - Multi-line SQL (auto-detect incomplete statements)');
			cli.print('  - Smart hints for keywords, tables, columns, functions');
			cli.print('  - Parameter hints for functions');
			rl.prompt();
			return;
		}

		if (input.startsWith('\\help ') || input.startsWith('\\h ')) {
			const cmd = input.split(/\s+/)[1];
			const helpTexts = {
				'dt': {
					name: '\\dt',
					syntax: '\\dt',
					description: 'List all tables in the database',
					example: '\\dt',
				},
				'd': {
					name: '\\d',
					syntax: '\\d <table_name>',
					description: 'Describe a table (columns, row count, sample data)',
					example: '\\d users',
				},
				'schema': {
					name: '\\schema',
					syntax: '\\schema <table_name>',
					description: 'Show table schema as JSON',
					example: '\\schema users',
				},
				'clear': {
					name: '\\clear',
					syntax: '\\clear',
					description: 'Clear the terminal screen',
					example: '\\clear',
				},
				'q': {
					name: '\\q',
					syntax: '\\q',
					description: 'Quit the SQL shell and save changes',
					example: '\\q',
				},
				'help': {
					name: '\\help',
					syntax: '\\help [command]',
					description: 'Show help information',
					example: '\\help \\d',
				},
				'hint': {
					name: '\\hint',
					syntax: '\\hint <sql>',
					description: 'Show hint information',
					example: '\\hint CREATE',
				},
			};

			const help = helpTexts[cmd];
			if (help) {
				cli.print('');
				cli.print(`  ${help.name} - ${help.description}`);
				cli.print('');
				cli.print('  Syntax:');
				cli.print(`    ${help.syntax}`);
				cli.print('');
				cli.print('  Example:');
				cli.print(`    ${help.example}`);
				cli.print('');
			} else {
				cli.warn(`Unknown command: ${cmd}`);
				cli.info('Available commands: \\help, \\dt, \\d, \\schema, \\clear, \\q, \\hint');
			}
			rl.prompt();
			return;
		}

		if (input === '\\clear') {
			cli.print('\x1b[2J\x1b[H');
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


		if (input.startsWith('\\hint ')) {
			const tmp = input.slice(6).trim();
			const map = new Map();
			const suggestions = sqlHintEngine.getSuggestions(tmp, tmp.length);
			for (const e of suggestions) {
				map.set(e.text, e)
			}
			for (const [u, e] of map) {
				cli.print(`${e.text}(${e.type}):${e.description}`);
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
			cli.info('Available commands: \\help, \\dt, \\d <name>, \\schema <name>, \\clear, \\q, \\hint');
			rl.prompt();
			return;
		}

		// [FIX] Check if SQL is complete or needs multi-line
		if (!isSQLComplete(input)) {
			inMultiLine = true;
			multiLineBuffer = input;
			rl.setPrompt('...> ');
			rl.prompt();
			return;
		}

		executeQuery(db, input, cli);
		rl.prompt();
	});

	rl.on('close', async () => {
		await db.save();
		// eslint-disable-next-line no-undef
		process.exit(0);
	});
}

// [FIX] Extract query execution to separate function
function executeQuery(db, sql, cli) {
	try {
		const result = db.query(sql);
		displayTable(result);
	} catch (err) {
		cli.error(err);
	}
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
