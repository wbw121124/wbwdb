import { wbwdbManager, DBSchema, DBFullType, DBRow, Email, Phone, UUID, dbtypes, DBRowWithID } from '../lib/index.js';
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
	const db = new wbwdbManager(dbPath);

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
	const db2 = new wbwdbManager(dbPath);
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

	// ==========================================
	// SQL 引擎演示
	// ==========================================
	console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('🚀 SQL 引擎演示');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const sqlDb = new wbwdbManager('./demo_sql');
	await sqlDb.init();

	// 创建表
	console.log('📊 使用 SQL 创建 orders 表...');
	sqlDb.query(`CREATE TABLE orders (
		id SERIAL,
		user_name TEXT,
		product TEXT,
		amount REAL,
		status TEXT
	)`);
	console.log('✅ orders 表创建成功\n');

	// 插入数据
	console.log('📦 使用 SQL 插入数据...');
	sqlDb.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('张三', '笔记本电脑', 5999.99, 'completed')`);
	sqlDb.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('李四', '无线鼠标', 89.90, 'completed')`);
	sqlDb.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('王五', '机械键盘', 399.00, 'pending')`);
	sqlDb.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('张三', '显示器', 2499.00, 'pending')`);
	sqlDb.query(`INSERT INTO orders (user_name, product, amount, status) VALUES ('李四', '键盘', 599.00, 'completed')`);
	console.log('✅ 插入了 5 条订单数据\n');

	// SELECT 查询
	console.log('🔍 SELECT * FROM orders:');
	const allOrders = sqlDb.query('SELECT * FROM orders');
	console.log(`  返回 ${allOrders.rowCount} 行`);
	allOrders.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  [${r.id}] ${r.user_name} - ${r.product} - ¥${r.amount} (${r.status})`);
	});
	console.log();

	// WHERE 条件查询
	console.log('🔍 SELECT * FROM orders WHERE amount > $1:');
	const expensive = sqlDb.query('SELECT * FROM orders WHERE amount > $1', [500]);
	console.log(`  找到 ${expensive.rows.length} 行`);
	expensive.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name} - ${r.product} - ¥${r.amount}`);
	});
	console.log();
	console.log();

	// ORDER BY + LIMIT
	console.log('🔍 SELECT * FROM orders ORDER BY amount DESC LIMIT 3:');
	const top3 = sqlDb.query('SELECT * FROM orders ORDER BY amount DESC LIMIT 3');
	top3.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.product} - ¥${r.amount}`);
	});
	console.log();

	// GROUP BY + 聚合函数
	console.log('🔍 SELECT user_name, COUNT(*) as count, SUM(amount) as total FROM orders GROUP BY user_name:');
	const grouped = sqlDb.query('SELECT user_name, COUNT(*) as count, SUM(amount) as total FROM orders GROUP BY user_name');
	grouped.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name}: ${r.count} 单, 总计 ¥${r.total}`);
	});
	console.log();

	// UPDATE
	console.log('🔄 UPDATE orders SET status = \'shipped\' WHERE user_name = \'张三\':');
	sqlDb.query("UPDATE orders SET status = 'shipped' WHERE user_name = '张三'");
	const updated = sqlDb.query("SELECT * FROM orders WHERE user_name = '张三'");
	updated.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.product} - ${r.status}`);
	});
	console.log();

	// DELETE
	console.log('🗑️ DELETE FROM orders WHERE status = \'pending\' AND amount < 500:');
	sqlDb.query("DELETE FROM orders WHERE status = 'pending' AND amount < 500");
	console.log(`  删除了 ${sqlDb.query("SELECT * FROM orders").rowCount} 条订单\n`);

	// JOIN 查询
	console.log('🔗 JOIN 查询...');
	sqlDb.query(`CREATE TABLE customers (
		id SERIAL,
		name TEXT,
		level TEXT
	)`);
	sqlDb.query("INSERT INTO customers (name, level) VALUES ('张三', 'gold')");
	sqlDb.query("INSERT INTO customers (name, level) VALUES ('李四', 'silver')");
	sqlDb.query("INSERT INTO customers (name, level) VALUES ('王五', 'bronze')");

	console.log('🔍 SELECT c.name, c.level, o.product FROM customers c LEFT JOIN orders o ON c.name = o.user_name:');
	const joined = sqlDb.query('SELECT c.name, c.level, o.product FROM customers c LEFT JOIN orders o ON c.name = o.user_name');
	joined.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r['c.name']} (${r['c.level']}) - ${r['o.product'] || '(无订单)'}`);
	});
	console.log();

	// CASE WHEN
	console.log('🔍 CASE WHEN 条件表达式:');
	const caseResult = sqlDb.query(`SELECT user_name, product, amount,
		CASE WHEN amount > 1000 THEN '高' WHEN amount > 200 THEN '中' ELSE '低' END as price_level
		FROM orders`);
	caseResult.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.product} - ¥${r.amount} - 价格等级: ${r.price_level}`);
	});
	console.log();

	// DISTINCT
	console.log('🔍 SELECT DISTINCT user_name FROM orders:');
	const distinct = sqlDb.query('SELECT DISTINCT user_name FROM orders');
	distinct.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name}`);
	});
	console.log();

	// 子查询
	console.log('🔍 子查询: SELECT * FROM orders WHERE user_name IN (SELECT name FROM customers WHERE level = \'gold\'):');
	const subquery = sqlDb.query("SELECT * FROM orders WHERE user_name IN (SELECT name FROM customers WHERE level = 'gold')");
	subquery.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name} - ${r.product}`);
	});
	console.log();

	// IN 表达式
	console.log('🔍 IN 表达式: SELECT * FROM orders WHERE status IN (\'completed\', \'shipped\'):');
	const inResult = sqlDb.query("SELECT * FROM orders WHERE status IN ('completed', 'shipped')");
	inResult.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name} - ${r.product} - ${r.status}`);
	});
	console.log();

	// BETWEEN
	console.log('🔍 BETWEEN 表达式: SELECT * FROM orders WHERE amount BETWEEN 100 AND 1000:');
	const betweenResult = sqlDb.query('SELECT * FROM orders WHERE amount BETWEEN 100 AND 1000');
	betweenResult.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.product} - ¥${r.amount}`);
	});
	console.log();

	// LIKE
	console.log('🔍 LIKE 模糊查询: SELECT * FROM orders WHERE product LIKE \'%键盘%\':');
	const likeResult = sqlDb.query("SELECT * FROM orders WHERE product LIKE '%键盘%'");
	likeResult.rows.forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.product} - ¥${r.amount}`);
	});
	console.log();

	// COALESCE
	console.log('🔍 COALESCE 空值处理:');
	const coalesceResult = sqlDb.query('SELECT user_name, COALESCE(product, \'未知产品\') as product FROM orders');
	coalesceResult.rows.slice(0, 3).forEach((r: Record<string, unknown>) => {
		console.log(`  ${r.user_name} - ${r.product}`);
	});
	console.log();

	// TRUNCATE
	console.log('🗑️ TRUNCATE TABLE customers:');
	sqlDb.query('TRUNCATE TABLE customers');
	console.log(`  customers 剩余: ${sqlDb.query('SELECT COUNT(*) as cnt FROM customers').rows[0].cnt} 行\n`);

	// DROP TABLE
	console.log('🗑️ DROP TABLE customers:');
	sqlDb.query('DROP TABLE customers');
	console.log(`  当前表: ${sqlDb.getSQL().tables().join(', ')}\n`);

	// ==========================================
	// RLS 行级安全演示
	// ==========================================
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('🔒 RLS 行级安全演示');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const rlsDb = new wbwdbManager('./demo_rls');
	await rlsDb.init();

	// 创建用户表和文章表
	console.log('📊 创建 rls_users 和 rls_posts 表...');
	rlsDb.query(`CREATE TABLE rls_users (
		id SERIAL,
		username TEXT,
		is_admin BOOLEAN
	)`);
	rlsDb.query(`CREATE TABLE rls_posts (
		id SERIAL,
		author TEXT,
		title TEXT,
		content TEXT,
		published BOOLEAN
	)`);
	console.log('✅ 表创建成功\n');

	// 插入数据
	console.log('📦 插入数据...');
	rlsDb.query("INSERT INTO rls_users (username, is_admin) VALUES ('alice', true)");
	rlsDb.query("INSERT INTO rls_users (username, is_admin) VALUES ('bob', false)");
	rlsDb.query("INSERT INTO rls_users (username, is_admin) VALUES ('charlie', false)");

	rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('alice', 'Hello World', 'Alice 的第一篇文章', true)");
	rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('alice', 'Draft', '草稿内容', false)");
	rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('bob', 'Bob 的文章', 'Bob 的公开文章', true)");
	rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('charlie', '私密日记', '只有自己能看到', false)");
	console.log('✅ 数据插入完成\n');

	// 启用 RLS
	console.log('🔒 启用 RLS...');
	rlsDb.query('ALTER TABLE rls_posts ENABLE ROW LEVEL SECURITY');
	console.log('✅ RLS 已启用\n');

	// 创建策略: 所有用户只能看到自己发布的文章
	console.log('📋 创建策略: 用户只能查看自己发布的文章...');
	rlsDb.query(`CREATE POLICY user_isolation ON rls_posts
		FOR SELECT
		USING (author = current_user())`);
	console.log('✅ 策略创建成功\n');

	// 模拟 bob 用户查询
	console.log('👤 模拟 bob 用户 (SET ROLE bob):');
	rlsDb.query("SET ROLE bob");
	const bobPosts = rlsDb.query('SELECT * FROM rls_posts');
	console.log(`  bob 能看到的文章: ${bobPosts.rowCount} 篇`);
	bobPosts.rows.forEach((r: Record<string, unknown>) => {
		console.log(`    - ${r.title} (by ${r.author})`);
	});
	console.log();

	// 模拟 charlie 用户查询
	console.log('👤 模拟 charlie 用户 (SET ROLE charlie):');
	rlsDb.query("SET ROLE charlie");
	const charliePosts = rlsDb.query('SELECT * FROM rls_posts');
	console.log(`  charlie 能看到的文章: ${charliePosts.rowCount} 篇`);
	charliePosts.rows.forEach((r: Record<string, unknown>) => {
		console.log(`    - ${r.title} (by ${r.author})`);
	});
	console.log();

	// 超级用户可以看到所有文章
	console.log('👑 超级用户 (SET ROLE public):');
	rlsDb.query("SET ROLE public");
	const allPosts = rlsDb.query('SELECT * FROM rls_posts');
	console.log(`  超级用户能看到的文章: ${allPosts.rowCount} 篇`);
	allPosts.rows.forEach((r: Record<string, unknown>) => {
		console.log(`    - ${r.title} (by ${r.author})`);
	});
	console.log();

	// INSERT RLS: WITH CHECK 策略
	console.log('📋 创建 INSERT 策略: 用户只能插入自己作为作者的文章...');
	rlsDb.query(`CREATE POLICY insert_author_check ON rls_posts
		FOR INSERT
		WITH CHECK (author = current_user())`);
	console.log('✅ INSERT 策略创建成功\n');

	// 尝试插入文章 (作为 bob)
	console.log('👤 模拟 bob 尝试插入文章...');
	rlsDb.query("SET ROLE bob");
	try {
		rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('bob', 'Bob 的新文章', '内容', false)");
		console.log('  ✅ 插入成功 (author = bob)');
	} catch (err: any) {
		console.log(`  ❌ 插入失败: ${err.message}`);
	}

	try {
		rlsDb.query("INSERT INTO rls_posts (author, title, content, published) VALUES ('alice', '冒充alice', '内容', false)");
		console.log('  ✅ 插入成功');
	} catch (err: any) {
		console.log(`  ❌ 插入失败: ${err.message}`);
	}
	console.log();

	// DROP POLICY
	console.log('📋 删除策略...');
	rlsDb.query('DROP POLICY user_isolation ON rls_posts');
	rlsDb.query('DROP POLICY insert_author_check ON rls_posts');
	console.log('✅ 策略已删除\n');

	// 禁用 RLS
	console.log('🔓 禁用 RLS...');
	rlsDb.query('ALTER TABLE rls_posts DISABLE ROW LEVEL SECURITY');
	console.log('✅ RLS 已禁用\n');

	// 清理
	await fs.promises.rm('./demo_sql', { recursive: true, force: true }).catch(() => {});
	await fs.promises.rm('./demo_rls', { recursive: true, force: true }).catch(() => {});
	console.log('🧹 演示数据已清理');
}

/**
 * 演示错误处理
 */
async function errorHandlingDemo() {
	console.log('\n📝 错误处理演示:');

	const db = new wbwdbManager('./demo_error');
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