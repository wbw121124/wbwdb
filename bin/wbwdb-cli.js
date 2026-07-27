#!/usr/bin/env node

import { CliTools } from 'wbw-cli-tools-lib';
import { shell, query } from './commands/shell.js';
import { listTables, tableInfo, createTable, dropTable } from './commands/table.js';
import { listUsers, createUser, deleteUser } from './commands/user.js';
import { listRoles, createRole } from './commands/role.js';
import { initDB, initDBWithAuth } from './lib/db.js';

const cli = CliTools.create({
	commandName: 'wbwdb',
	commandDescription: 'WBWDB - File-based JSON database CLI',
});

cli.setVersion('1.0.0');
cli.addOption('-d, --db <path>', 'Database path', './data');

const program = cli.getProgram();

program
	.command('shell')
	.description('Interactive SQL shell')
	.action(async function () {
		const opts = this.opts();
		await shell(opts.db);
	});

program
	.command('query')
	.description('Execute a SQL statement')
	.argument('<sql...>', 'SQL statement')
	.action(async function (sqlParts) {
		const opts = this.opts();
		const sql = sqlParts.join(' ');
		await query(opts.db, sql);
	});

program
	.command('tables')
	.description('List all tables')
	.action(async function () {
		const opts = this.opts();
		await listTables(opts.db);
	});

program
	.command('table')
	.description('Table management')
	.argument('<action>', 'info, create, drop, or list')
	.argument('[name]', 'Table name')
	.action(async function (action, name) {
		const opts = this.opts();
		if (action === 'info' && name) {
			await tableInfo(opts.db, name);
		} else if (action === 'create') {
			await createTable(opts.db);
		} else if (action === 'drop' && name) {
			await dropTable(opts.db, name);
		} else if (action === 'list' || !action) {
			await listTables(opts.db);
		} else {
			console.log('Usage: wbwdb table <info|create|drop|list> [name]');
		}
	});

program
	.command('user')
	.description('User management')
	.argument('<action>', 'list, create, or delete')
	.argument('[name]', 'Username')
	.action(async function (action, name) {
		const opts = this.opts();
		if (action === 'list' || !action) {
			await listUsers(opts.db);
		} else if (action === 'create') {
			await createUser(opts.db);
		} else if (action === 'delete' && name) {
			await deleteUser(opts.db, name);
		} else {
			console.log('Usage: wbwdb user <list|create|delete> [username]');
		}
	});

program
	.command('role')
	.description('Role management')
	.argument('<action>', 'list or create')
	.action(async function (action) {
		const opts = this.opts();
		if (action === 'list' || !action) {
			await listRoles(opts.db);
		} else if (action === 'create') {
			await createRole(opts.db);
		} else {
			console.log('Usage: wbwdb role <list|create>');
		}
	});

cli.onAction(async (options) => {
	cli.printBanner('WBWDB');
	cli.info('File-based JSON database with SQL engine & auth');
	cli.newline();

	const action = await cli.promptSelect('Choose an action:', [
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

	switch (action) {
		case 'shell':
			await shell(dbPath);
			break;
		case 'tables':
			await listTables(dbPath);
			break;
		case 'table-info': {
			const db = await initDB(dbPath);
			const tables = [...db.dbTables.keys()];
			if (tables.length === 0) {
				cli.info('No tables found.');
				break;
			}
			const name = await cli.promptSelect('Select table:', tables);
			if (name) await tableInfo(dbPath, name);
			break;
		}
		case 'table-create':
			await createTable(dbPath);
			break;
		case 'user-list':
			await listUsers(dbPath);
			break;
		case 'user-create':
			await createUser(dbPath);
			break;
		case 'role-list':
			await listRoles(dbPath);
			break;
		case 'role-create':
			await createRole(dbPath);
			break;
	}
});

cli.parse();
