# WBWDB

基于文件的 JSON 数据库，内置 SQL 引擎和认证系统。

## 安装

```bash
npm install @wbw121124/wbwdb
```

## CLI 用法

```bash
wbwdb [options] [command]
```

### 全局选项

| 选项              | 说明          | 默认值   |
| ----------------- | ------------- | -------- |
| `-d, --db <path>` | 数据库路径    | `./data` |
| `--json`          | JSON 格式输出 | `false`  |

### 命令

```bash
# 交互式 SQL 终端
wbwdb shell

# 执行 SQL 语句
wbwdb query "CREATE TABLE users (name String, age Number)"
wbwdb query "INSERT INTO users (name, age) VALUES ('Alice', 30)"
wbwdb query "SELECT * FROM users WHERE age > 25"
wbwdb query --json "SELECT * FROM users"    # JSON 输出

# 表管理
wbwdb tables                                 # 列出所有表
wbwdb table list                             # 同上
wbwdb table info <name>                      # 查看表结构和数据
wbwdb table create                           # 交互式建表
wbwdb table drop <name>                      # 删表

# 用户管理
wbwdb user list
wbwdb user create
wbwdb user info <name>
wbwdb user delete <name>
wbwdb user login

# 角色管理
wbwdb role list
wbwdb role create
wbwdb role delete <name>

# 权限
wbwdb grant <username> <role>
wbwdb revoke <username> <role>

# 启动 API server
wbwdb server
wbwdb server [options]
wbwdb server -p 3000 -H 127.0.0.1
```

### SQL Shell 元命令

```
\dt              列出所有表
\d <name>        查看表结构
\schema <name>   输出表 schema (JSON)
\clear           清屏
\q               退出
```

## 库 API 用法

```typescript
import { wbwdbManager } from '@wbw121124/wbwdb';

const db = new wbwdbManager('./data');
await db.init();

// SQL 查询
db.query("CREATE TABLE users (name String, age Number)");
db.query("INSERT INTO users (name, age) VALUES ('Alice', 30)");
const result = db.query("SELECT * FROM users WHERE age > $1", [25]);
console.log(result.rows);

// 持久化
await db.save();
```

### 带认证

```typescript
const db = new wbwdbManager('./data');
await db.init();
const auth = await db.initAuth();

// 注册
const { user, token } = await auth.register({
  username: 'alice',
  email: 'alice@example.com',
  password: 'secret123',
});

// 登录
const loginResult = await auth.login('alice', 'secret123');

// 角色
const role = await auth.createRole({ name: 'admin', permissions: ['read', 'write'] });
await auth.assignRole(user.id, role.id);
```

## 内置类型

| 类型      | 说明                           |
| --------- | ------------------------------ |
| `Number`  | 数字                           |
| `String`  | 字符串                         |
| `Boolean` | 布尔值                         |
| `Date`    | 日期                           |
| `Email`   | 邮箱（自动验证格式）           |
| `Phone`   | 电话号码（支持中国大陆手机号） |
| `UUID`    | UUID（自动校验）               |

自定义类型：

```typescript
import { addType } from '@wbw121124/wbwdb';

addType<MyType>('MyType', defaultValue);
```

## SQL 支持

- DDL: `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, `CREATE INDEX`, `TRUNCATE`
- DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- 子查询、`JOIN`（INNER/LEFT/RIGHT/FULL）
- `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `OFFSET`
- 聚合: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`
- 字符串: `UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `REPLACE`, `CONCAT`, `LENGTH`
- 数学: `ABS`, `CEIL`, `FLOOR`, `ROUND`
- 其他: `COALESCE`, `NULLIF`, `CASE WHEN`, `IN`, `BETWEEN`, `LIKE`, `EXISTS`, `CAST`, `DISTINCT`
- 事务: `BEGIN`, `COMMIT`, `ROLLBACK`
- RLS (行级安全): `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `SET ROLE`

## 文件结构

```
data/
  dbroot/
    index.json                      # 表索引
    table/<table_name>/data.json    # 表数据
```

## 开发

```bash
npm run build          # 编译
npm run build:watch    # 监听模式编译
npm run lint           # 代码检查
npm test               # 运行测试
```

## License

GPLv3.0
