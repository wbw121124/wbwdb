import { CliTools } from 'wbw-cli-tools-lib';
import { initDBWithAuth } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';

function getRootOpts(command) {
	let c = command;
	while (c.parent) c = c.parent;
	return c.opts();
}

export function registerRoleCommands(parent, cli) {
	const cmd = parent.command('role').description('Role management');

	cmd
		.command('list')
		.alias('ls')
		.description('List all roles')
		.action(async function () {
			const opts = getRootOpts(this);
			await listRoles(opts.db, opts);
		});

	cmd
		.command('create')
		.description('Create a new role')
		.action(async function () {
			const opts = getRootOpts(this);
			await createRole(opts.db, cli);
		});

	cmd
		.command('update')
		.argument('<name>', 'Role name')
		.description('Update role properties')
		.option('--description <desc>', 'New description')
		.option('--permissions <perms>', 'Comma-separated permissions')
		.action(async function (name) {
			const opts = getRootOpts(this);
			const updateOpts = this.opts();
			await updateRole(opts.db, name, updateOpts, cli);
		});

	cmd
		.command('delete')
		.alias('rm')
		.argument('<name>', 'Role name')
		.description('Delete a role')
		.action(async function (name) {
			const opts = getRootOpts(this);
			await deleteRole(opts.db, name, cli);
		});

	parent
		.command('grant')
		.argument('<username>', 'Username')
		.argument('<role>', 'Role name')
		.description('Assign a role to a user')
		.action(async function (username, roleName) {
			const opts = getRootOpts(this);
			await assignRole(opts.db, username, roleName, cli);
		});

	parent
		.command('revoke')
		.argument('<username>', 'Username')
		.argument('<role>', 'Role name')
		.description('Remove a role from a user')
		.action(async function (username, roleName) {
			const opts = getRootOpts(this);
			await removeRole(opts.db, username, roleName, cli);
		});
}

async function getRoleList(auth) {
	const roleMap = new Map();

	try {
		const users = await auth.listUsers();
		for (const user of users) {
			const userRoles = await auth.getUserRoles(user.id);
			for (const role of userRoles) {
				if (!roleMap.has(role.id)) {
					roleMap.set(role.id, role);
				}
			}
		}
	} catch {}

	return [...roleMap.values()];
}

export async function listRoles(dbPath, opts) {
	const { auth } = await initDBWithAuth(dbPath);
	const roles = await getRoleList(auth);

	if (roles.length === 0) {
		if (opts?.json) {
			displayJSON([]);
		} else {
			console.log('No roles found.');
		}
		return;
	}

	const data = roles.map(r => ({
		id: r.id,
		name: r.name,
		description: r.description || '',
		permissions: Array.isArray(r.permissions) ? r.permissions.join(', ') : String(r.permissions),
	}));

	if (opts?.json) {
		displayJSON(data);
	} else {
		displayTable({
			columns: ['id', 'name', 'description', 'permissions'],
			rows: data,
			row_count: data.length,
		});
	}
}

export async function createRole(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Create role' });
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

async function updateRole(dbPath, roleName, updateOpts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Update role' });
	const { auth } = await initDBWithAuth(dbPath);

	const roles = await getRoleList(auth);
	const role = roles.find(r => r.name === roleName);

	if (!role) {
		cli.error(`Role "${roleName}" not found.`);
		return;
	}

	const updateData = {};

	if (updateOpts.description) {
		updateData.description = updateOpts.description;
	}

	if (updateOpts.permissions) {
		updateData.permissions = updateOpts.permissions.split(',').map(p => p.trim()).filter(Boolean);
	}

	if (Object.keys(updateData).length === 0) {
		const desc = await cli.promptInput(`Description [${role.description}]:`);
		if (desc !== undefined && desc !== '') updateData.description = desc;

		const permsStr = await cli.promptInput(`Permissions [${role.permissions.join(', ')}]:`);
		if (permsStr !== undefined && permsStr !== '') {
			updateData.permissions = permsStr.split(',').map(p => p.trim()).filter(Boolean);
		}
	}

	if (Object.keys(updateData).length === 0) {
		cli.warn('No changes to make.');
		return;
	}

	cli.spinnerStart('Updating role...');
	try {
		await auth.updateRole(role.id, updateData);
		cli.spinnerSucceed(`Role "${roleName}" updated.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

async function deleteRole(dbPath, roleName, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Delete role' });
	const { auth } = await initDBWithAuth(dbPath);

	const roles = await getRoleList(auth);
	const role = roles.find(r => r.name === roleName);

	if (!role) {
		cli.error(`Role "${roleName}" not found.`);
		return;
	}

	const ok = await cli.promptConfirm(`Delete role "${roleName}"? This cannot be undone.`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Deleting role...');
	try {
		await auth.deleteRole(role.id);
		cli.spinnerSucceed(`Role "${roleName}" deleted.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

async function assignRole(dbPath, username, roleName, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Assign role' });
	const { auth } = await initDBWithAuth(dbPath);

	const users = await auth.listUsers();
	const user = users.find(u => u.username === username);
	if (!user) {
		cli.error(`User "${username}" not found.`);
		return;
	}

	const roles = await getRoleList(auth);
	const role = roles.find(r => r.name === roleName);
	if (!role) {
		cli.error(`Role "${roleName}" not found.`);
		return;
	}

	cli.spinnerStart('Assigning role...');
	try {
		await auth.assignRole(user.id, role.id);
		cli.spinnerSucceed(`Role "${roleName}" assigned to "${username}".`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

async function removeRole(dbPath, username, roleName, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Remove role' });
	const { auth } = await initDBWithAuth(dbPath);

	const users = await auth.listUsers();
	const user = users.find(u => u.username === username);
	if (!user) {
		cli.error(`User "${username}" not found.`);
		return;
	}

	const roles = await getRoleList(auth);
	const role = roles.find(r => r.name === roleName);
	if (!role) {
		cli.error(`Role "${roleName}" not found.`);
		return;
	}

	const ok = await cli.promptConfirm(`Remove role "${roleName}" from "${username}"?`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Removing role...');
	try {
		await auth.removeRole(user.id, role.id);
		cli.spinnerSucceed(`Role "${roleName}" removed from "${username}".`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}
