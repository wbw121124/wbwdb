import * as fs from 'node:fs';
import * as types from './types.js';
import { WBWDBSQL, type QueryResult } from './sql/index.js';
import { Auth } from './auth/index.js';
import type { AuthOptions } from './auth/types.js';

/**
 * wbwdb 数据库管理器
 * @public
 * @example
 * ```typescript
 * const db = new wbwdbManager('./data');
 * await db.init();
 * ```
 * @remarks
 * 文件夹结构为
 * ```
 * dbroot/
 *  ├─ index.json                     // 索引表
 *  ├─ table/(table name)/data.json   // 数据
 * ```
 */
export class wbwdbManager {
	/** 数据库路径 */
	path: string;
	/** 根目录路径 */
	rootdir: string | null = null;
	/** 数据表 */
	dbTables: Map<string, types.DBTable> = new Map();
	/** 索引数据 */
	private indexData: { tables: string[] } = { tables: [] };
	/** SQL 引擎 */
	private sql: WBWDBSQL | null = null;
	/** Auth 认证模块 */
	auth: Auth | null = null;
	/** API 事件监听器 */
	private listeners: Map<string, Set<Function>> = new Map();

	/**
	 * 创建数据库管理器实例
	 * @param path - 数据库存储路径
	 */
	constructor(path: string) {
		this.path = path;
	}

	/**
	 * 初始化 Auth 认证模块
	 * @param options - Auth 配置选项
	 * @returns Auth 实例
	 */
	async initAuth(options?: AuthOptions): Promise<Auth> {
		if (!this.rootdir) {
			throw new Error('Database not initialized. Call init() first.');
		}
		this.auth = new Auth(this, options);
		await this.auth.init();
		return this.auth;
	}

	/**
	 * 初始化（加载）数据库
	 * @returns Promise<void>
	 * @throws {Error} 当创建目录失败时抛出错误
	 * @public
	 */
	init = async (): Promise<void> => {
		const rootPath = this.path + '/dbroot';
		await fs.promises.mkdir(rootPath, { recursive: true });
		this.rootdir = rootPath;

		// 读取或创建索引文件 index.json
		const indexPath = rootPath + '/index.json';
		try {
			const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
			const parsed = JSON.parse(indexContent);
			if (!parsed || !Array.isArray(parsed.tables)) {
				throw new Error('Invalid index.json format: missing "tables" array');
			}
			this.indexData = parsed;
			// 加载所有已存在的表
			for (const tableName of this.indexData.tables) {
				await this.loadTable(tableName);
			}
		} catch (err: any) {
			if (err.code === 'ENOENT') {
				// 文件不存在，创建默认索引
				this.indexData = { tables: [] };
				await this.saveIndex();
			} else {
				throw err;
			}
		}
	}

	/**
	 * 加载指定的数据表
	 * @param tableName - 表名
	 * @private
	 */
	private async loadTable(tableName: string): Promise<void> {
		const tablePath = `${this.rootdir}/table/${tableName}/data.json`;
		try {
			const content = await fs.promises.readFile(tablePath, 'utf-8');
			const table = types.importDBTableFromString(content);
			this.dbTables.set(tableName, table);
		} catch (err: any) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}
	}

	/**
	 * 保存索引文件
	 * @private
	 */
	private async saveIndex(): Promise<void> {
		this.indexData.tables = [...this.dbTables.keys()];
		const indexPath = `${this.rootdir}/index.json`;
		await fs.promises.writeFile(indexPath, JSON.stringify(this.indexData, null, 2), 'utf-8');
	}

	/**
	 * 创建新表
	 * @param name - 表名
	 * @param schema - 表结构
	 * @returns 创建的表实例
	 * @public
	 */
	async createTable(name: string, schema: types.DBSchema): Promise<types.DBTable> {
		if (this.dbTables.has(name)) {
			throw new Error(`表 "${name}" 已存在`);
		}

		const table = new types.DBTable(name, schema, 0);
		this.dbTables.set(name, table);

		// 更新索引
		if (!this.indexData.tables.includes(name)) {
			this.indexData.tables.push(name);
			await this.saveIndex();
		}

		// 创建表数据目录和文件
		const tableDir = `${this.rootdir}/table/${name}`;
		await fs.promises.mkdir(tableDir, { recursive: true });
		await this.saveTable(name);

		return table;
	}

	/**
	 * 保存指定的表
	 * @param name - 表名
	 * @private
	 */
	private async saveTable(name: string): Promise<void> {
		const table = this.dbTables.get(name);
		if (!table) {
			throw new Error(`表 "${name}" 不存在`);
		}

		const tableDir = `${this.rootdir}/table/${name}`;
		await fs.promises.mkdir(tableDir, { recursive: true });
		const tablePath = `${tableDir}/data.json`;
		await fs.promises.writeFile(tablePath, table.toString(), 'utf-8');
	}

	/**
	 * 保存数据库
	 * @returns Promise<void>
	 * @public
	 */
	async save(): Promise<void> {
		// 保存所有表
		for (const [name] of this.dbTables) {
			await this.saveTable(name);
		}
		// 保存索引
		await this.saveIndex();
	}

	/**
	 * 刷新数据库（重新从磁盘加载）
	 * @returns Promise<void>
	 * @public
	 */
	async refresh(): Promise<void> {
		// 清空内存中的表
		this.dbTables.clear();

		// 重新加载索引
		const indexPath = `${this.rootdir}/index.json`;
		try {
			const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
			const parsed = JSON.parse(indexContent);
			if (!parsed || !Array.isArray(parsed.tables)) {
				throw new Error('Invalid index.json format: missing "tables" array');
			}
			this.indexData = parsed;
			// 加载所有表
			for (const tableName of this.indexData.tables) {
				await this.loadTable(tableName);
			}
		} catch (err: any) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}
	}

	/**
	 * 获取表
	 * @param name - 表名
	 * @returns 表实例或 undefined
	 * @public
	 */
	getTable(name: string): types.DBTable | undefined {
		return this.dbTables.get(name);
	}

	/**
	 * 删除表
	 * @param name - 表名
	 * @returns Promise<void>
	 * @public
	 */
	async dropTable(name: string): Promise<void> {
		if (!this.dbTables.has(name)) {
			throw new Error(`表 "${name}" 不存在`);
		}

		this.dbTables.delete(name);

		// 更新索引
		this.indexData.tables = this.indexData.tables.filter(t => t !== name);
		await this.saveIndex();

		// 删除表数据文件
		const tablePath = `${this.rootdir}/table/${name}`;
		try {
			await fs.promises.rm(tablePath, { recursive: true, force: true });
		} catch (err: any) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}
	}

	/**
	 * 执行 SQL 查询
	 * @param sql - SQL 语句
	 * @param params - 参数化查询的参数
	 * @returns 查询结果
	 * @public
	 * @example
	 * ```typescript
	 * const result = db.query("SELECT * FROM users WHERE age > $1", [25]);
	 * console.log(result.rows);
	 * ```
	 */
	query(sql: string, params?: unknown[]): QueryResult {
		if (!this.sql) {
			this.sql = new WBWDBSQL(this.dbTables);
		}
		const trimmed = sql.trim().toUpperCase();
		// Emit before events for DML statements
		if (trimmed.startsWith('INSERT')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('beforeInsert', tableName);
		} else if (trimmed.startsWith('UPDATE')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('beforeUpdate', tableName);
		} else if (trimmed.startsWith('DELETE')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('beforeDelete', tableName);
		}

		const result = this.sql.execute(sql, params);

		// Emit after events for DML statements
		if (trimmed.startsWith('INSERT')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('afterInsert', tableName, result);
		} else if (trimmed.startsWith('UPDATE')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('afterUpdate', tableName, result);
		} else if (trimmed.startsWith('DELETE')) {
			const tableName = this.extractTableName(sql);
			if (tableName) this.emit('afterDelete', tableName, result);
		}

		return result;
	}

	private extractTableName(sql: string): string | null {
		const upper = sql.trim().toUpperCase();
		let keyword: string;
		if (upper.startsWith('INSERT')) keyword = 'INTO';
		else if (upper.startsWith('UPDATE')) keyword = 'UPDATE';
		else if (upper.startsWith('DELETE')) keyword = 'FROM';
		else return null;
		const idx = upper.indexOf(keyword);
		if (idx === -1) return null;
		const rest = sql.trim().slice(idx + keyword.length).trim();
		const match = rest.match(/^(\w+)/);
		return match ? match[1] : null;
	}

	/**
	 * 获取 SQL 引擎实例
	 * @public
	 */
	getSQL(): WBWDBSQL {
		if (!this.sql) {
			this.sql = new WBWDBSQL(this.dbTables);
		}
		return this.sql;
	}

	// ── Event Listeners ────────────────────────────────

	/**
	 * 注册事件监听器
	 * @param event - 事件名 (beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete, afterDelete)
	 * @param table - 表名 (可选，不传则所有表触发)
	 * @param fn - 回调函数
	 */
	on(event: string, table: string, fn: Function): void;
	on(event: string, fn: Function): void;
	on(event: string, tableOrFn: string | Function, fn?: Function): void {
		const table = typeof tableOrFn === 'string' ? tableOrFn : '*';
		const callback = typeof tableOrFn === 'function' ? tableOrFn : fn;
		if (!callback) return;
		const key = `${event}:${table}`;
		if (!this.listeners.has(key)) this.listeners.set(key, new Set());
		this.listeners.get(key)!.add(callback);
		// Also register on wildcard key
		const wildcardKey = `${event}:*`;
		if (!this.listeners.has(wildcardKey)) this.listeners.set(wildcardKey, new Set());
		this.listeners.get(wildcardKey)!.add(callback);
	}

	/**
	 * 移除事件监听器
	 */
	off(event: string, table: string, fn: Function): void;
	off(event: string, fn: Function): void;
	off(event: string, tableOrFn: string | Function, fn?: Function): void {
		const table = typeof tableOrFn === 'string' ? tableOrFn : '*';
		const callback = typeof tableOrFn === 'function' ? tableOrFn : fn;
		if (!callback) return;
		const key = `${event}:${table}`;
		this.listeners.get(key)?.delete(callback);
		const wildcardKey = `${event}:*`;
		this.listeners.get(wildcardKey)?.delete(callback);
	}

	/**
	 * 触发事件
	 */
	emit(event: string, tableName: string, ...args: unknown[]): void {
		const specificKey = `${event}:${tableName}`;
		const wildcardKey = `${event}:*`;
		const specific = this.listeners.get(specificKey);
		const wildcard = this.listeners.get(wildcardKey);
		if (specific) {
			for (const fn of specific) {
				try { fn(...args); } catch (err) {
					if (event.startsWith('before')) throw err;
					console.error(`Event ${event} listener error:`, err);
				}
			}
		}
		if (wildcard) {
			for (const fn of wildcard) {
				try { fn(...args); } catch (err) {
					if (event.startsWith('before')) throw err;
					console.error(`Event ${event} listener error:`, err);
				}
			}
		}
	}
};

export * from './types.js';
export { WBWDBSQL, Parser, SQLExecutor, TableStore } from './sql/index.js';
export type { QueryResult, Row, SQLNode } from './sql/index.js';
export { Auth } from './auth/index.js';
export type {
	AuthOptions, User, RegisterInput, AuthResult,
	TokenOptions, TokenPayload, SessionResult, SessionOptions, SessionPayload,
	Role, RoleInput, ApiKey, ApiKeyOptions, ApiKeyResult, ApiKeyValidation,
	OAuthProvider, OAuthConfig, OAuthUrlResult, OAuthUserInfo,
	AuthContext,
} from './auth/types.js';
