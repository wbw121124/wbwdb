import * as readline from 'node:readline';
import { CliTools } from 'wbw-cli-tools-lib';
import { initDB } from '../lib/db.js';
import { displayTable } from '../lib/display.js';

export async function shell(dbPath) {
	const cli = CliTools.create({ commandName: 'wbwdb-shell', commandDescription: 'Interactive SQL Shell' });
	const db = await initDB(dbPath);

	cli.printBanner('WBWDB SQL Shell');
	cli.info('Type SQL statements or use meta-commands:');
	cli.print('  \\dt        List all tables');
	cli.print('  \\d <name>  Describe table');
	cli.print('  \\q        Quit');
	cli.newline();

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: 'wbwdb> ',
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

		if (input === '\\dt') {
			const tables = db.dbTables.size;
			if (tables === 0) {
				cli.info('No tables found.');
			} else {
				for (const [name, table] of db.dbTables) {
					cli.print(`  ${name} (${table.rows.length} rows)`);
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
				console.log(`Table: ${tableName}`);
				console.log(`Rows:  ${table.rows.length}`);
				console.log(`Schema:`);
				for (const [col, type] of Object.entries(table.schema)) {
					console.log(`  ${col}: ${type}`);
				}
				if (table.rows.length > 0) {
					console.log('\nSample data:');
					displayTable({
						columns: Object.keys(table.schema),
						rows: table.rows.slice(0, 5),
						row_count: table.rows.length,
					});
				}
			}
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
		process.exit(0);
	});
}

export async function query(dbPath, sql) {
	const db = await initDB(dbPath);
	try {
		const result = db.query(sql);
		displayTable(result);
	} catch (err) {
		console.error(`Error: ${err.message}`);
		process.exit(1);
	}
}
