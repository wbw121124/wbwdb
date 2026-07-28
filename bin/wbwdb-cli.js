#!/usr/bin/env node

import { CliTools } from 'wbw-cli-tools-lib';
import { registerShellCommand, shell } from './commands/shell.js';
import { registerTableCommands, listTables, tableInfo, createTable } from './commands/table.js';
import { registerUserCommands, listUsers, createUser } from './commands/user.js';
import { registerRoleCommands, listRoles, createRole } from './commands/role.js';
import { registerServerCommand, startServer } from './commands/server.js';
import { initDB } from './lib/db.js';

const cli = CliTools.create({
	commandName: 'wbwdb',
	commandDescription: 'WBWDB - File-based JSON database CLI',
});

cli.setVersion('1.0.0');
cli.addOption('-d, --db <path>', 'Database path', './data');
cli.addOption('--json', 'Output as JSON', false);

const program = cli.getProgram();

registerShellCommand(program, cli);
registerTableCommands(program, cli);
registerUserCommands(program, cli);
registerRoleCommands(program, cli);
registerServerCommand(program, cli);

program
	.command('tables')
	.description('List all tables')
	.action(async function () {
		const opts = this.parent.opts();
		await listTables(opts.db, opts, cli);
	});

cli.onAction(async (options) => {
	cli.printBanner('WBWDB');
	cli.info('File-based JSON database with SQL engine & auth');
	cli.newline();

	const action = await cli.promptSelect('Choose an action:', [
		{ value: 'server', name: 'Start API Server', description: 'Start HTTP REST API server' },
		{ value: 'shell', name: 'SQL Shell', description: 'Interactive SQL query terminal' },
		{ value: 'tables', name: 'List Tables', description: 'Show all database tables' },
		{ value: 'table-info', name: 'Table Info', description: 'View table schema and data' },
		{ value: 'table-create', name: 'Create Table', description: 'Create a new table' },
		{ value: 'user-list', name: 'List Users', description: 'Show all users' },
		{ value: 'user-create', name: 'Create User', description: 'Register a new user' },
		{ value: 'role-list', name: 'List Roles', description: 'Show all roles' },
		{ value: 'role-create', name: 'Create Role', description: 'Create a new role' },
		{ value: 'quit', name: 'Quit', description: 'Exit the CLI' },
	]);

	if (!action || action === 'quit') {
		cli.success('Bye!');
		return;
	}

	const dbPath = options.db;
	const opts = { json: options.json };

	switch (action) {
		case 'server': {
			await startServer(dbPath, options.port || 3000, options.host || '127.0.0.1', cli);
			break;
		}
		case 'shell':
			await shell(dbPath, cli);
			break;
		case 'tables':
			await listTables(dbPath, opts, cli);
			break;
		case 'table-info': {
			const db = await initDB(dbPath);
			const tables = [...db.dbTables.keys()];
			if (tables.length === 0) {
				cli.info('No tables found.');
				break;
			}
			const name = await cli.promptSelect('Select table:', tables);
			if (name) await tableInfo(dbPath, name, opts);
			break;
		}
		case 'table-create':
			await createTable(dbPath, cli);
			break;
		case 'user-list':
			await listUsers(dbPath, opts);
			break;
		case 'user-create':
			await createUser(dbPath, cli);
			break;
		case 'role-list':
			await listRoles(dbPath, opts);
			break;
		case 'role-create':
			await createRole(dbPath, cli);
			break;
	}
});

cli.parse();
