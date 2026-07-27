import { CliTools } from 'wbw-cli-tools-lib';
import { initDBWithAuth } from '../lib/db.js';
import { displayTable } from '../lib/display.js';

export async function listUsers(dbPath) {
	const { auth } = await initDBWithAuth(dbPath);
	const users = await auth.listUsers();

	if (users.length === 0) {
		console.log('No users found.');
		return;
	}

	displayTable({
		columns: ['id', 'username', 'email', 'active', 'createdAt'],
		rows: users.map(u => ({
			id: u.id,
			username: u.username,
			email: u.email,
			active: String(u.isActive),
			createdAt: u.createdAt,
		})),
		row_count: users.length,
	});
}

export async function createUser(dbPath) {
	const cli = CliTools.create({ commandName: 'wbwdb-user-create', commandDescription: 'Create user' });
	const { auth } = await initDBWithAuth(dbPath);

	const username = await cli.promptInput('Username:', { required: true });
	if (!username) { cli.warn('Cancelled.'); return; }

	const email = await cli.promptInput('Email:', { required: true });
	if (!email) { cli.warn('Cancelled.'); return; }

	const password = await cli.promptPassword('Password:', { minLength: 6 });
	if (!password) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Creating user...');
	try {
		const user = await auth.register({ username, email, password });
		cli.spinnerSucceed(`User "${user.username}" created (id: ${user.id}).`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

export async function deleteUser(dbPath, username) {
	const cli = CliTools.create({ commandName: 'wbwdb-user-delete', commandDescription: 'Delete user' });
	const { auth } = await initDBWithAuth(dbPath);

	const users = await auth.listUsers();
	const user = users.find(u => u.username === username);

	if (!user) {
		cli.error(`User "${username}" not found.`);
		return;
	}

	const ok = await cli.promptConfirm(`Delete user "${username}"? This cannot be undone.`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Deleting user...');
	try {
		await auth.deleteUser(user.id);
		cli.spinnerSucceed(`User "${username}" deleted.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}
