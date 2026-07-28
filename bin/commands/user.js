import { CliTools } from 'wbw-cli-tools-lib';
import { initDBWithAuth } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';

function getRootOpts(command) {
	let c = command;
	while (c.parent) c = c.parent;
	return c.opts();
}

export function registerUserCommands(parent, cli) {
	const cmd = parent.command('user').description('User management');

	cmd
		.command('list')
		.alias('ls')
		.description('List all users')
		.action(async function () {
			const opts = getRootOpts(this);
			await listUsers(opts.db, opts);
		});

	cmd
		.command('info')
		.argument('<name>', 'Username')
		.description('Show user details')
		.action(async function (name) {
			const opts = getRootOpts(this);
			await userInfo(opts.db, name, opts);
		});

	cmd
		.command('create')
		.description('Create a new user')
		.action(async function () {
			const opts = getRootOpts(this);
			await createUser(opts.db, cli);
		});

	cmd
		.command('update')
		.argument('<name>', 'Username')
		.description('Update user properties')
		.option('--email <email>', 'New email')
		.option('--active <bool>', 'Set active status (true/false)')
		.action(async function (name) {
			const opts = getRootOpts(this);
			const updateOpts = this.opts();
			await updateUser(opts.db, name, updateOpts, cli);
		});

	cmd
		.command('delete')
		.alias('rm')
		.argument('<name>', 'Username')
		.description('Delete a user')
		.action(async function (name) {
			const opts = getRootOpts(this);
			await deleteUser(opts.db, name, cli);
		});

	cmd
		.command('login')
		.description('Authenticate and get JWT token')
		.action(async function () {
			const opts = getRootOpts(this);
			await loginUser(opts.db, opts, cli);
		});
}

export async function listUsers(dbPath, opts) {
	const { auth } = await initDBWithAuth(dbPath);
	const users = await auth.listUsers();

	if (users.length === 0) {
		if (opts?.json) {
			displayJSON([]);
		} else {
			console.log('No users found.');
		}
		return;
	}

	const data = users.map(u => ({
		id: u.id,
		username: u.username,
		email: u.email,
		active: u.isActive,
		createdAt: u.createdAt,
	}));

	if (opts?.json) {
		displayJSON(data);
	} else {
		displayTable({
			columns: ['id', 'username', 'email', 'active', 'createdAt'],
			rows: data.map(u => ({ ...u, active: String(u.active) })),
			row_count: data.length,
		});
	}
}

export async function userInfo(dbPath, username, opts) {
	const { auth } = await initDBWithAuth(dbPath);
	const users = await auth.listUsers();
	const user = users.find(u => u.username === username);

	if (!user) {
		const cli = CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
		cli.error(`User "${username}" not found.`);
		return;
	}

	const roles = await auth.getUserRoles(user.id);
	const data = {
		...user,
		roles: roles.map(r => r.name),
	};

	if (opts?.json) {
		displayJSON(data);
	} else {
		console.log(`User: ${user.username}`);
		console.log(`  ID:       ${user.id}`);
		console.log(`  Email:    ${user.email}`);
		console.log(`  Active:   ${user.isActive}`);
		console.log(`  Created:  ${user.createdAt}`);
		console.log(`  Updated:  ${user.updatedAt}`);
		if (roles.length > 0) {
			console.log(`  Roles:    ${roles.map(r => r.name).join(', ')}`);
		}
	}
}

export async function createUser(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb' });
	const { auth } = await initDBWithAuth(dbPath);

	// 1. 基础信息输入
	const username = await cli.promptInput('Username:', { required: true });
	if (!username) { cli.warn('Cancelled.'); return; }

	const email = await cli.promptInput('Email:', { required: true });
	if (!email) { cli.warn('Cancelled.'); return; }

	// 2. 更安全的密码输入 (隐藏字符)
	const password = await cli.promptPassword('Password:', {
		minLength: 6,
		message: 'Password must be at least 6 characters.'
	});
	if (!password) { cli.warn('Cancelled.'); return; }

	// 3. 二次确认
	const confirmPass = await cli.promptPassword('Confirm Password:');
	if (password !== confirmPass) {
		cli.error('Passwords do not match.');
		return;
	}

	// 4. 操作确认
	const ok = await cli.promptConfirm(`Create user "${username}"?`);
	if (!ok) { cli.warn('Cancelled.'); return; }

	// 5. Spinner 加载反馈
	cli.spinnerStart('Registering user...');
	try {
		const user = await auth.register({ username, email, password });
		cli.spinnerSucceed(`User "${user.username}" created successfully!`);
	} catch (err) {
		cli.spinnerFail('Registration failed.');
		cli.error(err.message);
	}
}

export async function updateUser(dbPath, username, updateOpts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Update user' });
	const { auth } = await initDBWithAuth(dbPath);

	const users = await auth.listUsers();
	const user = users.find(u => u.username === username);

	if (!user) {
		cli.error(`User "${username}" not found.`);
		return;
	}

	const updateData = {};

	if (updateOpts.email) {
		updateData.email = updateOpts.email;
	}

	if (updateOpts.active !== undefined) {
		updateData.isActive = updateOpts.active === 'true';
	}

	if (Object.keys(updateData).length === 0) {
		const email = await cli.promptInput(`Email [${user.email}]:`);
		if (email) updateData.email = email;

		const active = await cli.promptSelect('Active status:', [
			{ value: true, name: 'Active' },
			{ value: false, name: 'Inactive' },
		]);
		if (active !== undefined) updateData.isActive = active;
	}

	if (Object.keys(updateData).length === 0) {
		cli.warn('No changes to make.');
		return;
	}

	cli.spinnerStart('Updating user...');
	try {
		await auth.updateUser(user.id, updateData);
		cli.spinnerSucceed(`User "${username}" updated.`);
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}

export async function deleteUser(dbPath, username, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Delete user' });
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

export async function loginUser(dbPath, opts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: 'Login' });
	const { auth } = await initDBWithAuth(dbPath);

	const username = await cli.promptInput('Username:', { required: true });
	if (!username) { cli.warn('Cancelled.'); return; }

	const password = await cli.promptPassword('Password:');
	if (!password) { cli.warn('Cancelled.'); return; }

	cli.spinnerStart('Authenticating...');
	try {
		const result = await auth.login(username, password);
		cli.spinnerSucceed('Logged in.');

		if (opts?.json) {
			displayJSON({
				user: result.user,
				token: result.token,
				sessionId: result.sessionId,
			});
		} else {
			console.log(`  User:      ${result.user.username}`);
			console.log(`  ID:        ${result.user.id}`);
			console.log(`  Token:     ${result.token}`);
			if (result.sessionId) {
				console.log(`  Session:   ${result.sessionId}`);
			}
		}
	} catch (err) {
		cli.spinnerFail(err.message);
	}
}
