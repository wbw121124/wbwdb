import http from 'node:http';
import { URL } from 'node:url';
import { initDBWithAuth } from '../lib/db.js';

export function registerServerCommand(program, cli) {
	program
		.command('server')
		.description('Start HTTP API server')
		.option('-p, --port <port>', 'Port to listen on', '3000')
		.option('-H, --host <host>', 'Host to bind to', '127.0.0.1')
		.action(async function (options) {
			const opts = this.parent.opts();
			await startServer(opts.db, options.port, options.host, cli);
		});
}

export async function startServer(dbPath, port, host, parentCli) {
	const cli = parentCli;
	cli.printBanner(`WBWDB Server v1.0`);
	cli.spinnerStart(`Loading database from ${dbPath}...`);
	try {
		const { db, auth } = await initDBWithAuth(dbPath);
		cli.spinnerSucceed('Database initialized.');

		const server = http.createServer(async (req, res) => {
			// CORS 设置 - 支持配置允许的来源
			// eslint-disable-next-line no-undef
			const allowedOrigins = process.env.WBWDB_CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
			const origin = req.headers.origin;
			if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
				res.setHeader('Access-Control-Allow-Origin', origin || '*');
			}
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url, `http://${req.headers.host}`);
			const pathname = url.pathname;

			try {
				// 1. 解析 JSON Body
				let body = {};
				if (req.method === 'POST' || req.method === 'PUT') {
					body = await parseBody(req);
				}

				// 2. 鉴权中间件 (提取 AuthContext 用于 RLS)
				let authContext = null;
				const authHeader = req.headers['authorization'];
				const apiKeyHeader = req.headers['x-api-key'];

				if (authHeader && authHeader.startsWith('Bearer ')) {
					const token = authHeader.slice(7);
					try {
						const payload = await auth.validateToken(token);
						authContext = {
							userId: payload.sub,
							username: payload.username,
							roles: payload.roles,
							permissions: payload.permissions
						};
					} catch {
						// Token 无效，作为未认证用户(public)继续
					}
				} else if (apiKeyHeader) {
					const validation = await auth.validateApiKey(apiKeyHeader);
					if (validation.valid) {
						const user = await auth.getUser(validation.userId);
						authContext = {
							userId: validation.userId,
							username: user ? user.username : '',
							roles: [], // API Key 的权限在 validation.permissions 中
							permissions: validation.permissions
						};
					}
				}

				// 3. 路由分发
				if (pathname === '/api/auth/register' && req.method === 'POST') {
					const user = await auth.register(body);
					sendJSON(res, 201, { message: 'User created', user });
				}
				else if (pathname === '/api/auth/login' && req.method === 'POST') {
					if (!body.username || !body.password) throw new Error('Missing username or password');
					const result = await auth.login(body.username, body.password);
					sendJSON(res, 200, result);
				}
				else if (pathname === '/api/sql' && req.method === 'POST') {
					const { sql, params } = body;
					if (!sql) throw new Error('Missing "sql" in request body');

					// [FIX] Security: Prevent DDL statements via HTTP API (check each statement)
					const statements = sql.split(';').map(s => s.trim()).filter(s => s);
					const dangerousKeywords = ['DROP ', 'CREATE ', 'ALTER ', 'TRUNCATE ', 'GRANT ', 'REVOKE '];
					for (const stmt of statements) {
						const upperStmt = stmt.toUpperCase();
						if (dangerousKeywords.some(kw => upperStmt.startsWith(kw))) {
							throw new Error('Forbidden: DDL statements are not allowed via HTTP API.');
						}
					}

					const result = db.query(sql, params, authContext);
					sendJSON(res, 200, result);
				}
				else if (pathname === '/api/tables' && req.method === 'GET') {
					const tables = [...db.dbTables.keys()];
					sendJSON(res, 200, { tables });
				}
				else if (pathname === '/health' && req.method === 'GET') {
					sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
				}
				else {
					sendJSON(res, 404, { error: 'Not Found' });
				}
			} catch (err) {
				cli.error(`Server Error: ${err.message}`);
				const statusCode = err.message.includes('not found') || err.message.includes('Invalid') ? 400 : 500;
				sendJSON(res, statusCode, { error: err.message });
			}
		});

		server.listen(port, host, () => {
			cli.success(`WBWDB Server running at http://${host}:${port}`);
			cli.info('Available Endpoints:');
			cli.info('  POST /api/auth/register  - Register new user');
			cli.info('  POST /api/auth/login     - Login & get JWT');
			cli.info('  POST /api/sql            - Execute SQL (Supports RLS)');
			cli.info('  GET  /api/tables         - List all tables');
			cli.info('  GET  /health             - Health check');
		});
	} catch (err) {
		cli.spinnerFail('Failed to initialize database.');
		cli.error(err.message);
		// eslint-disable-next-line no-undef
		process.exit(1);
	}
}

// 辅助函数：解析 Request Body (with size limit)
function parseBody(req, maxSize = 1024 * 1024) {
	return new Promise((resolve, reject) => {
		let data = '';
		let totalSize = 0;
		req.on('data', chunk => {
			totalSize += chunk.length;
			if (totalSize > maxSize) {
				reject(new Error('Request body too large (max 1MB)'));
				return;
			}
			data += chunk;
		});
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				reject(new Error('Invalid JSON body'));
			}
		});
		req.on('error', reject);
	});
}

// 辅助函数：返回 JSON 响应
function sendJSON(res, statusCode, data) {
	res.writeHead(statusCode, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}