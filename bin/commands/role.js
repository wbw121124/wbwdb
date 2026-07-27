import { CliTools } from 'wbw-cli-tools-lib';
import { initDBWithAuth } from '../lib/db.js';
import { displayTable } from '../lib/display.js';

export async function listRoles(dbPath) {
	const { auth } = await initDBWithAuth(dbPath);

	const result = await auth.query?.('SELECT * FROM _auth_roles') || null;
	let roles = [];

	if (result && result.rows) {
		roles = result.rows;
	} else {
		const users = await auth.listUsers();
		for (const user of users) {
			const userRoles = await auth.getUserRoles(user.id);
			for (const role of userRoles) {
				if (!roles.find(r => r.id === role.id)) {
					roles.push(role);
				}
			}
		}
	}

	if (roles.length === 0) {
		console.log('No roles found.');
		return;
	}

	displayTable({
		columns: ['id', 'name', 'description', 'permissions'],
		rows: roles.map(r => ({
			id: r.id,
			name: r.name,
			description: r.description || '',
			permissions: Array.isArray(r.permissions) ? r.permissions.join(', ') : String(r.permissions),
		})),
		row_count: roles.length,
	});
}

export async function createRole(dbPath) {
	const cli = CliTools.create({ commandName: 'wbwdb-role-create', commandDescription: 'Create role' });
	const { auth } = await initDBWithAuth(dbPath);

	const name = await cli.promptInput('Role name:', { required: true });
	if (!name) { cli.warn('Cancelled.'); return; }

	const description = await cli.promptInput('Description (optional):') || '';

	const permsStr = await cli.promptInput('Permissions (comma-separated, e.g. read,write,admin):') || '';
	const permissions = permsStr ? permsStr.split(',').map(p => p.trim()).filter(Boolean) : [];

	cli.spinnerStart('Creating role...');
	try {
		const role = await auth.createRole({ name, description, permissions });
		cli.spinnerSucceed(`Role "${role.name}" created (id: ${role.id}).`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}
