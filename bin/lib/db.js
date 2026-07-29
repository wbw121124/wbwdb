// bin/lib/db.js
import { wbwdbManager, hashApiKey } from '../../lib/index.js';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

/**
 * 初始化基础数据库管理器
 * @param {string} dbPath - 数据库根路径
 * @returns {Promise<wbwdbManager>}
 */
export async function initDB(dbPath) {
	// 确保路径存在
	await fs.mkdir(dbPath, { recursive: true });

	const db = new wbwdbManager(dbPath);
	await db.init();
	return db;
}

const myRandom = function () {
	const array = new Uint32Array(1);
	const randomNum = crypto.getRandomValues(array)[0];
	return randomNum;
}

/**
 * 初始化带有 Auth 功能的数据库管理器
 * @param {string} dbPath - 数据库根路径
 * @param {object} authOptions - Auth 配置选项 (可选)
 * @returns {Promise<{ db: wbwdbManager, auth: import('../../src/auth/index.js').Auth }>}
 */
export async function initDBWithAuth(dbPath, authOptions = {}) {
	const db = await initDB(dbPath);

	// 初始化 Auth 模块
	// 注意：Auth 模块依赖于 db.rootdir 已经设置好
	if (!db.auth) {
		// eslint-disable-next-line no-undef
		const jwtSecret = authOptions.jwtSecret || process.env.WBWDB_JWT_SECRET || hashApiKey(dbPath + `${new Date()}_${Math.random()}_${myRandom()}`);
		await db.initAuth({ ...authOptions, jwtSecret });
	}

	return {
		db,
		auth: db.auth
	};
}