import { wbwdbMannager, DBSchema, DBFullType, DBRow, Email, Phone, UUID, dbtypes, DBRowWithID } from '../lib/index.js';
import * as fs from 'node:fs';

/**
 * 用户表结构定义
 */
class UserSchema extends DBSchema {
	constructor() {
		const map = new Map();

		// 定义用户表的字段
		map.set('id', new DBFullType(dbtypes.get('UUID')!, false));
		map.set('username', new DBFullType(dbtypes.get('String')!, false));
		map.set('email', new DBFullType(dbtypes.get('Email')!, false));
		map.set('phone', new DBFullType(dbtypes.get('Phone')!, true)); // 可选字段
		map.set('age', new DBFullType(dbtypes.get('Number')!, true, 0));
		map.set('createdAt', new DBFullType(dbtypes.get('Date')!, false, () => new Date()));

		super(map);
	}
}

/**
 * 产品表结构定义
 */
class ProductSchema extends DBSchema {
	constructor() {
		const map = new Map();

		map.set('id', new DBFullType(dbtypes.get('UUID')!, false));
		map.set('name', new DBFullType(dbtypes.get('String')!, false));
		map.set('price', new DBFullType(dbtypes.get('Number')!, false));
		map.set('stock', new DBFullType(dbtypes.get('Number')!, false, 0));
		map.set('createdAt', new DBFullType(dbtypes.get('Date')!, false, () => new Date()));

		super(map);
	}
}

/**
 * 辅助函数：创建 DBRow 从对象
 */
function createRow(obj: Record<string, any>): DBRow {
	const map = new Map<string, any>();
	for (const [key, value] of Object.entries(obj)) {
		map.set(key, value);
	}
	return new DBRow(map);
}

/**
 * 主 Demo 函数
 */
async function main() {
	console.log('🚀 开始 wbwdb 数据库演示...\n');
	const dbPath = './demo_data';

	// 0. 删除原来的数据库实例
	await fs.promises.rm(dbPath, { recursive: true, force: true }).catch(() => { /* 忽略错误 */ });

	// 1. 创建数据库实例
	const db = new wbwdbMannager(dbPath);

	// 2. 初始化数据库
	console.log('📁 初始化数据库...');
	await db.init();
	console.log('✅ 数据库初始化完成\n');

	// 3. 创建用户表
	console.log('📊 创建用户表...');
	const userSchema = new UserSchema();
	const userTable = await db.createTable('users', userSchema);
	console.log('✅ 用户表创建成功\n');

	// 4. 创建产品表
	console.log('📊 创建产品表...');
	const productSchema = new ProductSchema();
	const productTable = await db.createTable('products', productSchema);
	console.log('✅ 产品表创建成功\n');

	// 5. 插入用户数据
	console.log('👤 插入用户数据...');

	// 使用辅助函数创建行
	const user1Row = createRow({
		id: new UUID(),
		username: '张三',
		email: new Email('zhangsan@example.com'),
		phone: new Phone('13800138000'),
		age: 25
	});
	userTable.insert(user1Row);

	const user2Row = createRow({
		id: new UUID(),
		username: '李四',
		email: new Email('lisi@example.com'),
		phone: new Phone('13900139000'),
		age: 30
	});
	userTable.insert(user2Row);

	const user3Row = createRow({
		id: new UUID(),
		username: '王五',
		email: new Email('wangwu@example.com'),
		age: 28 // 没有 phone 字段，使用默认值
	});
	userTable.insert(user3Row);

	console.log(`✅ 插入了 ${userTable.rows.length} 条用户数据\n`);

	// 6. 插入产品数据
	console.log('📦 插入产品数据...');

	const product1Row = createRow({
		id: new UUID(),
		name: '笔记本电脑',
		price: 5999.99,
		stock: 50
	});
	productTable.insert(product1Row);

	const product2Row = createRow({
		id: new UUID(),
		name: '无线鼠标',
		price: 89.90,
		stock: 200
	});
	productTable.insert(product2Row);

	const product3Row = createRow({
		id: new UUID(),
		name: '机械键盘',
		price: 399.00,
		stock: 75
	});
	productTable.insert(product3Row);

	console.log(`✅ 插入了 ${productTable.rows.length} 条产品数据\n`);

	// 7. 查询数据 - 查找所有用户
	console.log('🔍 查询所有用户:');
	userTable.rows.forEach((row: { row: { get: (arg0: string) => { (): any; new(): any; toString: { (): any; new(): any; }; }; }; }) => {
		console.log(`  ID: ${row.row.get('id')?.toString()}`);
		console.log(`  用户名: ${row.row.get('username')}`);
		console.log(`  邮箱: ${row.row.get('email')?.toString()}`);
		console.log(`  电话: ${row.row.get('phone')?.toString() || '未设置'}`);
		console.log(`  年龄: ${row.row.get('age')}`);
		console.log('  ---');
	});
	console.log();

	// 8. 查询数据 - 查找年龄大于25岁的用户
	console.log('🔍 查询年龄 > 25 的用户:');
	const olderUsers = userTable.find((row: any) => {
		return row.get('age') > 25;
	});
	olderUsers.forEach((row: any) => {
		console.log(`  ${row.row.get('username')} - 年龄: ${row.row.get('age')}`);
	});
	console.log();

	// 9. 查询数据 - 查找所有产品
	console.log('🔍 查询所有产品:');
	productTable.rows.forEach((row: { row: { get: (arg0: string) => { (): any; new(): any; toString: { (): any; new(): any; }; }; }; }) => {
		console.log(`  ID: ${row.row.get('id')?.toString()}`);
		console.log(`  名称: ${row.row.get('name')}`);
		console.log(`  价格: ¥${row.row.get('price')}`);
		console.log(`  库存: ${row.row.get('stock')}`);
		console.log('  ---');
	});
	console.log();

	// 10. 排序 - 按价格降序
	console.log('🔽 按价格降序排列产品:');
	const sortedProducts = productTable.sort((a: any, b: any) => {
		return b.row.get('price') - a.row.get('price');
	});
	sortedProducts.forEach((row: any) => {
		console.log(`  ${row.row.get('name')} - ¥${row.row.get('price')}`);
	});
	console.log();

	// 11. 删除数据
	console.log('🗑️ 删除一个用户 (ID: ...)');
	if (userTable.rows.length > 0) {
		const firstUserId = userTable.rows[0].id;
		userTable.delete(firstUserId);
		console.log(`✅ 删除了用户 ID: ${firstUserId}`);
		console.log(`📊 剩余用户数: ${userTable.rows.length}\n`);
	}

	// 12. 保存数据到磁盘
	console.log('💾 保存数据到磁盘...');
	await db.save();
	console.log('✅ 数据保存完成\n');

	// 13. 演示数据持久化 - 重新加载数据库
	console.log('🔄 重新加载数据库...');
	const db2 = new wbwdbMannager(dbPath);
	await db2.init();
	console.log('✅ 数据库重新加载完成');

	// 14. 验证数据
	console.log('📊 验证重新加载的数据:');
	const reloadedUserTable = db2.getTable('users');
	if (reloadedUserTable) {
		console.log(`  用户表行数: ${reloadedUserTable.rows.length}`);
		reloadedUserTable.rows.forEach((row: DBRowWithID) => {
			console.log(`    ${row.get('username')} - ${row.get('email')?.toString()}`);
		});
	}

	const reloadedProductTable = db2.getTable('products');
	if (reloadedProductTable) {
		console.log(`  产品表行数: ${reloadedProductTable.rows.length}`);
		reloadedProductTable.rows.forEach((row: DBRowWithID) => {
			console.log(`    ${row.get('name')} - ¥${row.get('price')}`);
		});
	}
	console.log();

	// 15. 删除表
	console.log('🗑️ 删除用户表...');
	await db2.dropTable('users');
	console.log('✅ 用户表已删除\n');

	// console.log('🗑️ 删除产品表...');
	// await db2.dropTable('products');
	// console.log('✅ 产品表已删除\n');

	// // 16. 清理测试数据（可选）
	// console.log('🧹 清理测试数据...');
	// try {
	// 	await fs.promises.rm(dbPath, { recursive: true, force: true });
	// 	console.log('✅ 测试数据已清理\n');
	// } catch (err) {
	// 	console.log('⚠️ 无法清理测试数据，请手动删除');
	// }

	console.log('🎉 Demo 运行完成！');
}

/**
 * 演示错误处理
 */
async function errorHandlingDemo() {
	console.log('\n📝 错误处理演示:');

	const db = new wbwdbMannager('./demo_error');
	await db.init();

	try {
		// 尝试创建重复的表
		const schema = new DBSchema(new Map());
		await db.createTable('test', schema);
		await db.createTable('test', schema); // 这会抛出错误
	} catch (err: any) {
		console.log(`  ❌ 预期的错误: ${err.message}`);
	}

	// 清理
	await fs.promises.rm('./demo_error', { recursive: true, force: true });
}

/**
 * 演示类型安全
 */
function typeSafetyDemo() {
	console.log('\n🔒 类型安全演示:');

	// 创建 Email 实例
	const email = new Email('test@example.com');
	console.log(`  Email: ${email.toString()}`);

	// 创建 UUID
	const uuid = UUID.generate();
	console.log(`  UUID: ${uuid.toString()}`);

	// 创建 Phone
	const phone = new Phone('13800138000');
	console.log(`  Phone: ${phone.toString()}`);

	// 验证错误
	try {
		const invalidEmail = new Email('invalid-email');
		console.log(`  这个不应该显示: ${invalidEmail}`);
	} catch (err: any) {
		console.log(`  ✅ 正确捕获无效邮箱错误: ${err.message}`);
	}

	try {
		const invalidPhone = new Phone('123');
		console.log(`  这个不应该显示: ${invalidPhone}`);
	} catch (err: any) {
		console.log(`  ✅ 正确捕获无效电话号码错误: ${err.message}`);
	}
}

// 运行主程序
main()
	.then(() => {
		// 运行额外的演示
		return errorHandlingDemo();
	})
	.then(() => {
		typeSafetyDemo();
	})
	.catch((err) => {
		console.error('❌ 发生错误:', err);
	});