//#region src/types.d.ts
/**
 * 数据库类型定义接口
 * @template T - 类型参数，表示对应的 TypeScript 类型
 * @public
 */
interface DBType<T = any> {
  /** 类型名称 */
  name: string;
  /** 将值转换为数据库存储对象的函数 */
  toObj: (value: T) => object;
  /** 从数据库存储对象还原为原始值的函数 */
  fromObj: (value: object) => T;
  /** 转 string */
  toStr: (value: T) => string;
  /** string 转 T */
  fromStr: (value: string) => T;
  /** 新建值 */
  newVal: () => T;
}
/**
 * 数据库类型定义类
 * @template T - 类型参数，表示对应的 TypeScript 类型
 * @public
 */
declare class DBTypeDef<T> implements DBType<T> {
  name: string;
  toObj: (value: T) => object;
  fromObj: (value: object) => T;
  toStr: (value: T) => string;
  fromStr: (value: string) => T;
  newVal: () => T;
  /**
   * 创建一个数据库类型定义
   * @param name - 类型名称
   * @param toObj - 值到数据库对象的转换函数
   * @param fromObj - 数据库对象到值的转换函数
   * @param newVal - 新建值的函数
   * @public
   */
  constructor(name: string, toObj: (value: T) => object, fromObj: (value: object) => T, toStr: (value: T) => string, fromStr: (value: string) => T, newVal: () => T);
}
/**
 * 电子邮件地址类
 * 提供电子邮件地址的验证和封装
 * @public
 * @example
 * ```typescript
 * const email = new Email('user@example.com');
 * console.log(email.toString()); // 'user@example.com'
 * ```
 */
declare class Email {
  /** 存储的电子邮件地址值 */
  private readonly _value;
  /**
   * 创建一个电子邮件实例
   * @param value - 电子邮件地址字符串或 Email 实例
   * @throws {Error} 当电子邮件地址格式无效时抛出错误
   * @example
   * ```typescript
   * const email1 = new Email('user@example.com');
   * const email2 = new Email(email1); // 从另一个实例创建
   * ```
   */
  constructor(value: string | Email);
  /**
   * 验证电子邮件地址格式
   * @param email - 要验证的电子邮件字符串
   * @throws {Error} 当格式无效时抛出错误
   * @private
   */
  private validate;
  /**
   * 转换为字符串
   * @returns 电子邮件地址字符串
   */
  toString(): string;
  /**
   * 值类型转换（用于类型强制转换）
   * @returns 电子邮件地址字符串
   */
  valueOf(): string;
}
/**
 * 创建数据库类型定义的工厂函数
 * @template T - 类型参数
 * @param name - 类型名称
 * @returns 数据库类型定义实例
 * @public
 * @example
 * ```typescript
 * const numberType = dbtypeMaker<number>('Number');
 * const stringType = dbtypeMaker<string>('String');
 * ```
 */
declare function dbtypeMaker<T>(name: string, defaultValue?: T): DBTypeDef<T>;
/**
 * 电话号码类
 * 提供电话号码的验证和封装
 * @public
 * @example
 * ```typescript
 * const phone = new Phone('13800138000');
 * console.log(phone.toString()); // '13800138000'
 * ```
 */
declare class Phone {
  /** 存储的电话号码值 */
  private readonly _value;
  /**
   * 创建一个电话号码实例
   * @param value - 电话号码字符串或 Phone 实例
   * @throws {Error} 当电话号码格式无效时抛出错误
   */
  constructor(value: string | Phone);
  /**
   * 验证电话号码格式（支持中国大陆手机号）
   * @param phone - 要验证的电话号码字符串
   * @throws {Error} 当格式无效时抛出错误
   * @private
   */
  private validate;
  /**
   * 转换为字符串
   * @returns 电话号码字符串
   */
  toString(): string;
  /**
   * 值类型转换（用于类型强制转换）
   * @returns 电话号码字符串
   */
  valueOf(): string;
}
/**
 * UUID 类
 * 提供 UUID 的生成和验证封装
 * @public
 * @example
 * ```typescript
 * const uuid1 = new UUID(); // 自动生成
 * const uuid2 = new UUID('550e8400-e29b-41d4-a716-446655440000');
 * const uuid3 = UUID.generate(); // 使用静态方法
 * ```
 */
declare class UUID {
  /** 存储的 UUID 值 */
  private readonly _value;
  /**
   * 创建一个 UUID 实例
   * @param value - UUID 字符串或 UUID 实例，如果不传则自动生成
   * @throws {Error} 当 UUID 格式无效时抛出错误
   */
  constructor(value?: string | UUID);
  /**
   * 验证 UUID 格式
   * @param uuid - 要验证的 UUID 字符串
   * @throws {Error} 当格式无效时抛出错误
   * @private
   */
  private validate;
  /**
   * 转换为字符串
   * @returns UUID 字符串
   */
  toString(): string;
  /**
   * 值类型转换（用于类型强制转换）
   * @returns UUID 字符串
   */
  valueOf(): string;
  /**
   * 静态方法：生成新的 UUID
   * @returns 新的 UUID 实例
   * @example
   * ```typescript
   * const uuid = UUID.generate();
   * console.log(uuid.toString());
   * ```
   */
  static generate(): UUID;
}
/** 全局数据库类型注册表 */
declare const dbtypes: Map<string, DBType>;
/**
 * 向数据库类型注册表添加类型
 * @template T - 要添加的类型
 * @param name - 类型名称
 * @public
 * @example
 * ```typescript
 * addType<number>('Number');
 * addType<Email>('Email');
 * addType<UUID>('UUID');
 * ```
 */
declare function addType<T>(name: string, defaultVal?: T): void;
declare class DBFullType<T> {
  t: DBType<T>;
  nullable: boolean;
  defaultVal: (() => T) | T | null;
  constructor(t: DBType<T>, nullable: boolean, defaultVal?: (() => T) | T | null);
}
declare class DBSchema {
  map: Map<string, DBFullType<any>>;
  constructor(map: Map<string, DBFullType<any>>);
  toString(): string;
  static fromStrMap(v: Map<string, string>): DBSchema;
}
/** 数据表行类型 */
declare class DBRow {
  row: Map<string, any>;
  constructor(row: Map<string, any>);
  static fromObject(obj: Record<string, any>): DBRow;
  updateT(schema: DBSchema): void;
  get(str: string): any;
}
declare class DBRowWithID extends DBRow {
  id: number;
  constructor(row: Map<string, any>, id: number);
  toString(): string;
  valueOf(): {
    id: number;
    row: Map<string, any>;
  };
  static fromJSON(json: any): DBRowWithID;
}
/** Hook 定义 */
interface TableHook {
  name: string;
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  timing: 'BEFORE' | 'AFTER';
  language: 'js' | 'sql';
  body: string;
  enabled: boolean;
}
/** RLS 策略 */
interface RLSPolicyData {
  name: string;
  cmd: string;
  permissive: boolean;
  roles: string[];
  using: any | null;
  withCheck: any | null;
}
/** 数据表类型 */
declare class DBTable {
  name: string;
  schema: DBSchema;
  cnt: number;
  rows: DBRowWithID[];
  rlsEnabled: boolean;
  rlsForced: boolean;
  policies: RLSPolicyData[];
  hooks: TableHook[];
  constructor(name: string, schema: DBSchema, cnt?: number, rows?: DBRowWithID[], extra?: {
    rlsEnabled?: boolean;
    rlsForced?: boolean;
    policies?: RLSPolicyData[];
    hooks?: TableHook[];
  });
  valueOf(): {
    name: string;
    schema: DBSchema;
    rows: DBRowWithID[];
    cnt: number;
    rlsEnabled: boolean;
    rlsForced: boolean;
    policies: RLSPolicyData[];
    hooks: TableHook[];
  };
  toString(): string;
  setAll(rows: DBRowWithID[]): void;
  insert(val: DBRow): void;
  delete(id: number): void;
  find(f: (row: DBRowWithID) => boolean): DBRowWithID[];
  sort(f: (a: DBRowWithID, b: DBRowWithID) => number): DBRowWithID[];
}
declare function importDBTableFromString(str: string): DBTable;
//#endregion
//#region src/sql/ast.d.ts
type SQLNode = SelectStatement | InsertStatement | UpdateStatement | DeleteStatement | CreateTableStatement | DropTableStatement | AlterTableStatement | CreateIndexStatement | DropIndexStatement | TruncateStatement | TransactionStatement | GrantStatement | ExplainStatement | CreatePolicyStatement | DropPolicyStatement | AlterPolicyStatement | EnableRLSStatement | SetRoleStatement | CreateHookStatement | DropHookStatement | ShowHooksStatement;
interface SelectStatement {
  type: 'SELECT';
  distinct: boolean;
  columns: SelectColumn[];
  from: FromClause;
  joins: JoinClause[];
  where: Expression | null;
  groupBy: Expression[];
  having: Expression | null;
  orderBy: OrderByClause[];
  limit: Expression | null;
  offset: Expression | null;
  with?: WithClause;
  union?: {
    type: 'UNION' | 'INTERSECT' | 'EXCEPT';
    all: boolean;
    select: SelectStatement;
  }[];
  forUpdate?: boolean;
  forShare?: boolean;
}
interface SelectColumn {
  expr: Expression;
  alias: string | null;
}
interface FromClause {
  table: string;
  subquery?: SelectStatement;
  alias: string | null;
}
interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: string;
  subquery?: SelectStatement;
  alias: string | null;
  on: Expression | null;
  using: string[] | null;
}
interface OrderByClause {
  expr: Expression;
  direction: 'ASC' | 'DESC';
  nulls: 'FIRST' | 'LAST' | null;
}
interface WithClause {
  recursive: boolean;
  CTEs: {
    name: string;
    columns: string[];
    select: SelectStatement;
  }[];
}
interface InsertStatement {
  type: 'INSERT';
  table: string;
  columns: string[];
  values: {
    type: 'VALUES';
    rows: Expression[][];
  } | {
    type: 'SELECT';
    select: SelectStatement;
  };
  conflictAction: 'NOTHING' | 'UPDATE' | null;
  conflictColumns?: string[];
  updateColumns?: string[];
  updateExpressions?: Expression[];
  returning?: SelectColumn[];
}
interface UpdateStatement {
  type: 'UPDATE';
  table: string;
  sets: {
    column: string;
    value: Expression;
  }[];
  where: Expression | null;
  returning?: SelectColumn[];
}
interface DeleteStatement {
  type: 'DELETE';
  table: string;
  where: Expression | null;
  returning?: SelectColumn[];
  using?: FromClause[];
}
interface CreateTableStatement {
  type: 'CREATE_TABLE';
  ifNotExists: boolean;
  table: string;
  columns: ColumnDef[];
  primaryKey?: string[];
  unique?: string[][];
}
interface ColumnDef {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: Expression | null;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement?: boolean;
}
interface DropTableStatement {
  type: 'DROP_TABLE';
  ifExists: boolean;
  table: string;
  cascade: boolean;
}
interface AlterTableStatement {
  type: 'ALTER_TABLE';
  table: string;
  action: 'ADD_COLUMN' | 'DROP_COLUMN' | 'RENAME_COLUMN' | 'ALTER_COLUMN_TYPE';
  column?: string;
  newName?: string;
  columnDef?: ColumnDef;
}
interface CreateIndexStatement {
  type: 'CREATE_INDEX';
  unique: boolean;
  concurrently: boolean;
  indexName: string;
  table: string;
  columns: string[];
  where?: Expression;
}
interface DropIndexStatement {
  type: 'DROP_INDEX';
  concurrently: boolean;
  ifExists: boolean;
  indexName: string;
}
interface TruncateStatement {
  type: 'TRUNCATE';
  table: string;
  cascade: boolean;
}
interface TransactionStatement {
  type: 'TRANSACTION';
  action: 'BEGIN' | 'COMMIT' | 'ROLLBACK' | 'SAVEPOINT';
  savepointName?: string;
}
interface GrantStatement {
  type: 'GRANT';
  permissions: string[];
  table: string;
  grantee: string;
}
interface ExplainStatement {
  type: 'EXPLAIN';
  statement: SQLNode;
}
type RLSPolicyCmd = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
interface CreatePolicyStatement {
  type: 'CREATE_POLICY';
  policyName: string;
  table: string;
  cmd: RLSPolicyCmd;
  permissive: boolean;
  roles: string[];
  using: Expression | null;
  withCheck: Expression | null;
  ifNotExists: boolean;
}
interface DropPolicyStatement {
  type: 'DROP_POLICY';
  policyName: string;
  table: string;
  ifExists: boolean;
}
interface AlterPolicyStatement {
  type: 'ALTER_POLICY';
  policyName: string;
  table: string;
  newName?: string;
  using?: Expression | null;
  withCheck?: Expression | null;
  roles?: string[];
  cmd?: RLSPolicyCmd;
}
interface EnableRLSStatement {
  type: 'ENABLE_RLS';
  table: string;
  enable: boolean;
  force?: boolean;
}
interface SetRoleStatement {
  type: 'SET_ROLE';
  role: string;
  global: boolean;
}
type HookEvent = 'INSERT' | 'UPDATE' | 'DELETE';
type HookTiming = 'BEFORE' | 'AFTER';
type HookLanguage = 'js' | 'sql';
interface CreateHookStatement {
  type: 'CREATE_HOOK';
  hookName: string;
  table: string;
  event: HookEvent;
  timing: HookTiming;
  language: HookLanguage;
  body: string;
  ifNotExists: boolean;
}
interface DropHookStatement {
  type: 'DROP_HOOK';
  hookName: string;
  table: string;
  ifExists: boolean;
}
interface ShowHooksStatement {
  type: 'SHOW_HOOKS';
  table: string;
}
type Expression = LiteralExpr | ColumnRef | BinaryExpr | UnaryExpr | FuncCall | CaseExpr | InExpr | BetweenExpr | LikeExpr | ExistsExpr | SubqueryExpr | CastExpr | ParameterExpr | WindowFuncExpr;
interface LiteralExpr {
  type: 'LITERAL';
  value: string | number | boolean | null;
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL';
}
interface ColumnRef {
  type: 'COLUMN_REF';
  table: string | null;
  column: string;
  star: boolean;
}
interface BinaryExpr {
  type: 'BINARY';
  op: string;
  left: Expression;
  right: Expression;
}
interface UnaryExpr {
  type: 'UNARY';
  op: string;
  expr: Expression;
  prefix: boolean;
}
interface FuncCall {
  type: 'FUNC_CALL';
  name: string;
  args: Expression[];
  distinct: boolean;
  over?: WindowExpr;
}
interface CaseExpr {
  type: 'CASE';
  expr: Expression | null;
  branches: {
    when: Expression;
    then: Expression;
  }[];
  elseExpr: Expression | null;
}
interface InExpr {
  type: 'IN';
  expr: Expression;
  values: Expression[] | SelectStatement;
  negated: boolean;
}
interface BetweenExpr {
  type: 'BETWEEN';
  expr: Expression;
  low: Expression;
  high: Expression;
  negated: boolean;
}
interface LikeExpr {
  type: 'LIKE';
  expr: Expression;
  pattern: Expression;
  negated: boolean;
  caseSensitive: boolean;
}
interface ExistsExpr {
  type: 'EXISTS';
  select: SelectStatement;
}
interface SubqueryExpr {
  type: 'SUBQUERY';
  select: SelectStatement;
}
interface CastExpr {
  type: 'CAST';
  expr: Expression;
  dataType: string;
}
interface ParameterExpr {
  type: 'PARAMETER';
  index: number;
}
interface WindowExpr {
  type: 'WINDOW';
  partitionBy: Expression[];
  orderBy: OrderByClause[];
  frame?: {
    start: string;
    end: string;
  };
}
interface WindowFuncExpr {
  type: 'WINDOW_FUNC';
  name: string;
  expr: Expression | null;
  over: WindowExpr;
}
//#endregion
//#region src/sql/parser.d.ts
declare class Parser {
  private tokens;
  private pos;
  constructor(sql: string);
  /** Parse a single SQL statement */
  parse(): SQLNode;
  /** Parse multiple SQL statements separated by semicolons */
  parseAll(): SQLNode[];
  private parseStatement;
  private parseSelect;
  private parseSelectColumns;
  private parseFromClause;
  private parseJoin;
  private parseOrderBy;
  private parseInsert;
  private parseUpdate;
  private parseDelete;
  private parseCreate;
  private parseColumnDef;
  private parseTypeName;
  private parseDrop;
  private parseAlter;
  private parseCreateIndex;
  private parseDropIndex;
  private parseTruncate;
  private parseTransaction;
  private parseExplain;
  private parseSet;
  private parseCreatePolicy;
  private parseDropPolicy;
  private parseAlterPolicy;
  private parseCreateHook;
  private parseDropHook;
  private parseShow;
  private parseExpression;
  private parseOr;
  private parseAnd;
  private parseComparison;
  private parseAddSub;
  private parseMulDiv;
  private parseUnary;
  private parsePrimary;
  private parseCase;
  private parseWindowSpec;
  private parseTableName;
  /** Accept either IDENT or KEYWORD token as an identifier (SQL allows keywords as identifiers) */
  private expectIdentOrKeyword;
  private isComparisonOp;
  private isJoin;
  private peek;
  private advance;
  private is;
  private match;
  private expect;
  private error;
}
//#endregion
//#region src/sql/executor.d.ts
type Row = Record<string, unknown>;
interface QueryResult {
  columns: string[];
  rows: Row[];
  rowCount: number;
  command: string;
}
interface RLSPolicy {
  name: string;
  cmd: string;
  permissive: boolean;
  roles: string[];
  using: Expression | null;
  withCheck: Expression | null;
}
declare class TableStore {
  rows: Row[];
  schema: Map<string, {
    name: string;
    notNull: boolean;
    defaultValue: unknown;
  }>;
  autoIncrement: number;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policies: RLSPolicy[];
  hooks: TableHook[];
  nextId(): number;
  findMaxId(): number;
}
declare class SQLExecutor {
  private tables;
  private transactions;
  private currentRole;
  private superUser;
  private authContext;
  constructor(existingTables?: Map<string, Row[]>, existingSchemas?: Map<string, Map<string, {
    name: string;
    notNull: boolean;
    defaultValue: unknown;
  }>>, existingRls?: Map<string, {
    enabled: boolean;
    forced: boolean;
    policies: any[];
  }>, existingHooks?: Map<string, TableHook[]>);
  /** Set auth context from Auth module */
  setAuthContext(ctx: {
    userId: string;
    username: string;
    roles: string[];
    permissions: string[];
  } | null): void;
  /** Get auth context */
  getAuthContext(): {
    userId: string;
    username: string;
    roles: string[];
    permissions: string[];
  } | null;
  /** Execute a parsed SQL statement */
  execute(stmt: SQLNode, params?: unknown[]): QueryResult;
  /** Get table store, throwing if not found */
  private getTable;
  private execSelect;
  private resolveFrom;
  private applyJoin;
  private prefixedRow;
  private applyGroupBy;
  private hasAggregateColumns;
  private applyOrderBy;
  private compare;
  private getHooks;
  private runHooks;
  private runAfterHooks;
  private execInsert;
  private execUpdate;
  private execDelete;
  private execCreateTable;
  private execDropTable;
  private execAlterTable;
  private execCreateIndex;
  private execTruncate;
  private execTransaction;
  private execExplain;
  private generatePlan;
  /** Check if RLS allows a row to be accessed */
  private rlsCheck;
  /** Check RLS WITH CHECK for INSERT/UPDATE */
  private rlsCheckWith;
  /** Apply RLS filter to a set of rows */
  private rlsFilter;
  private execCreatePolicy;
  private execDropPolicy;
  private execAlterPolicy;
  private execEnableRLS;
  private execSetRole;
  private execCreateHook;
  private execDropHook;
  private execShowHooks;
  /** Get current role */
  getCurrentRole(): string;
  /** Check if current session is superuser */
  isSuperUser(): boolean;
  private evalExpr;
  private countDistinct;
  private sumAggregate;
  private avgAggregate;
  private minAggregate;
  private maxAggregate;
  private evalExtract;
  private likeToRegex;
  private escapeRegex;
  private getColumnExprName;
  /** Get all table names */
  getTables(): string[];
  /** Get a specific table as an array of Row */
  getTableRows(name: string): Row[];
  /** Get table store (for sync) */
  getTableStore(name: string): TableStore | undefined;
  /** Sync SQL tables back to wbwdb DBTable objects */
  syncTo(wbwdbTables: Map<string, DBTable>): void;
}
//#endregion
//#region src/sql/index.d.ts
declare class WBWDBSQL {
  private executor;
  private wbwdbTables;
  constructor(wbwdbTables: Map<string, DBTable>);
  execute(sql: string, params?: unknown[]): QueryResult;
  parse(sql: string): SQLNode;
  executeAST(ast: ReturnType<Parser['parse']>, params?: unknown[]): QueryResult;
  /** Set auth context for RLS integration */
  setAuthContext(ctx: {
    userId: string;
    username: string;
    roles: string[];
    permissions: string[];
  } | null): void;
  /** Get current auth context */
  getAuthContext(): {
    userId: string;
    username: string;
    roles: string[];
    permissions: string[];
  } | null;
  tables(): string[];
  tableRows(name: string): Row[];
  private syncToWBWDB;
}
//#endregion
//#region src/auth/types.d.ts
interface User {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: string;
}
interface RegisterInput {
  username: string;
  email: string;
  password: string;
  metadata?: Record<string, unknown>;
}
interface AuthResult {
  user: User;
  token: string;
  refreshToken?: string;
  sessionId?: string;
}
interface TokenOptions {
  expiresIn?: string;
  issuer?: string;
  audience?: string;
}
interface TokenPayload {
  sub: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}
interface SessionResult {
  user: User;
  sessionId: string;
  expiresAt: string;
}
interface SessionOptions {
  expiresInMs?: number;
}
interface SessionPayload {
  sessionId: string;
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  expiresAt: string;
}
interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
}
interface RoleInput {
  name: string;
  description?: string;
  permissions?: string[];
}
interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  permissions: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}
interface ApiKeyOptions {
  name?: string;
  permissions?: string[];
  expiresInMs?: number;
}
interface ApiKeyResult {
  key: string;
  apiKey: ApiKey;
}
interface ApiKeyValidation {
  valid: boolean;
  userId: string;
  permissions: string[];
  apiKeyId?: string;
}
type OAuthProvider = 'google' | 'github' | 'wechat' | 'qq';
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}
interface OAuthUserInfo {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  provider: OAuthProvider;
}
interface OAuthUrlResult {
  url: string;
  state: string;
}
interface AuthContext {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
}
interface AuthOptions {
  jwtSecret?: string;
  jwtExpiresIn?: string;
  jwtIssuer?: string;
  sessionExpiresInMs?: number;
  bcryptSaltRounds?: number;
}
//#endregion
//#region src/auth/index.d.ts
declare class Auth {
  private db;
  private jwt;
  private sessions;
  private oauth;
  private apiKeys;
  private users;
  private usersByUsername;
  private usersByEmail;
  private roles;
  private rolesByName;
  private userRoles;
  private authContext;
  constructor(db: wbwdbManager, options?: AuthOptions);
  init(): Promise<void>;
  private loadUsers;
  private loadRoles;
  private loadUserRoles;
  private saveUsers;
  private saveRoles;
  private saveUserRoles;
  private toUser;
  private getUserRolesAndPermissions;
  register(input: RegisterInput): Promise<User>;
  login(username: string, password: string): Promise<AuthResult>;
  logout(sessionId: string): Promise<void>;
  generateToken(userId: string, options?: TokenOptions): Promise<string>;
  validateToken(token: string): Promise<TokenPayload>;
  refreshToken(token: string, expiresIn?: string): Promise<string>;
  createSession(userId: string, options?: SessionOptions): Promise<SessionResult>;
  validateSession(sessionId: string): Promise<SessionPayload | null>;
  destroySession(sessionId: string): Promise<void>;
  getUser(userId: string): Promise<User | null>;
  updateUser(userId: string, data: Partial<Pick<User, 'email' | 'isActive' | 'metadata'>>): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  listUsers(options?: {
    limit?: number;
    offset?: number;
  }): Promise<User[]>;
  createRole(input: RoleInput): Promise<Role>;
  updateRole(roleId: string, data: Partial<Pick<Role, 'description' | 'permissions'>>): Promise<Role>;
  deleteRole(roleId: string): Promise<void>;
  assignRole(userId: string, roleId: string): Promise<void>;
  removeRole(userId: string, roleId: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
  checkPermission(userId: string, permission: string): Promise<boolean>;
  grantPermission(roleId: string, permission: string): Promise<void>;
  revokePermission(roleId: string, permission: string): Promise<void>;
  createApiKey(userId: string, options?: ApiKeyOptions): Promise<ApiKeyResult>;
  revokeApiKey(keyId: string): Promise<void>;
  validateApiKey(key: string): Promise<ApiKeyValidation>;
  listApiKeys(userId: string): Promise<ApiKey[]>;
  setOAuthConfig(provider: OAuthProvider, config: OAuthConfig): void;
  getOAuthUrl(provider: OAuthProvider, redirectUri: string, scopes?: string[]): Promise<OAuthUrlResult>;
  handleOAuthCallback(provider: OAuthProvider, code: string, redirectUri: string): Promise<OAuthUserInfo>;
  linkOAuth(_userId: string, provider: OAuthProvider, code: string, redirectUri: string): Promise<void>;
  loginWithOAuth(provider: OAuthProvider, code: string, redirectUri: string): Promise<AuthResult>;
  setCurrentUser(userId: string): void;
  setCurrentUserByToken(token: string): void;
  getCurrentUser(): AuthContext | null;
  clearCurrentUser(): void;
}
//#endregion
//#region src/index.d.ts
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
declare class wbwdbManager {
  /** 数据库路径 */
  path: string;
  /** 根目录路径 */
  rootdir: string | null;
  /** 数据表 */
  dbTables: Map<string, DBTable>;
  /** 索引数据 */
  private indexData;
  /** SQL 引擎 */
  private sql;
  /** Auth 认证模块 */
  auth: Auth | null;
  /** API 事件监听器 */
  private listeners;
  /**
   * 创建数据库管理器实例
   * @param path - 数据库存储路径
   */
  constructor(path: string);
  /**
   * 初始化 Auth 认证模块
   * @param options - Auth 配置选项
   * @returns Auth 实例
   */
  initAuth(options?: AuthOptions): Promise<Auth>;
  /**
   * 初始化（加载）数据库
   * @returns Promise<void>
   * @throws {Error} 当创建目录失败时抛出错误
   * @public
   */
  init: () => Promise<void>;
  /**
   * 加载指定的数据表
   * @param tableName - 表名
   * @private
   */
  private loadTable;
  /**
   * 保存索引文件
   * @private
   */
  private saveIndex;
  /**
   * 创建新表
   * @param name - 表名
   * @param schema - 表结构
   * @returns 创建的表实例
   * @public
   */
  createTable(name: string, schema: DBSchema): Promise<DBTable>;
  /**
   * 保存指定的表
   * @param name - 表名
   * @private
   */
  private saveTable;
  /**
   * 保存数据库
   * @returns Promise<void>
   * @public
   */
  save(): Promise<void>;
  /**
   * 刷新数据库（重新从磁盘加载）
   * @returns Promise<void>
   * @public
   */
  refresh(): Promise<void>;
  /**
   * 获取表
   * @param name - 表名
   * @returns 表实例或 undefined
   * @public
   */
  getTable(name: string): DBTable | undefined;
  /**
   * 删除表
   * @param name - 表名
   * @returns Promise<void>
   * @public
   */
  dropTable(name: string): Promise<void>;
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
  query(sql: string, params?: unknown[]): QueryResult;
  private extractTableName;
  /**
   * 获取 SQL 引擎实例
   * @public
   */
  getSQL(): WBWDBSQL;
  /**
   * 注册事件监听器
   * @param event - 事件名 (beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete, afterDelete)
   * @param table - 表名 (可选，不传则所有表触发)
   * @param fn - 回调函数
   */
  on(event: string, table: string, fn: Function): void;
  on(event: string, fn: Function): void;
  /**
   * 移除事件监听器
   */
  off(event: string, table: string, fn: Function): void;
  off(event: string, fn: Function): void;
  /**
   * 触发事件
   */
  emit(event: string, tableName: string, ...args: unknown[]): void;
}
//#endregion
export { type ApiKey, type ApiKeyOptions, type ApiKeyResult, type ApiKeyValidation, Auth, type AuthContext, type AuthOptions, type AuthResult, DBFullType, DBRow, DBRowWithID, DBSchema, DBTable, type DBType, DBTypeDef, Email, type OAuthConfig, type OAuthProvider, type OAuthUrlResult, type OAuthUserInfo, Parser, Phone, type QueryResult, type RLSPolicyData, type RegisterInput, type Role, type RoleInput, type Row, SQLExecutor, type SQLNode, type SessionOptions, type SessionPayload, type SessionResult, type TableHook, TableStore, type TokenOptions, type TokenPayload, UUID, type User, WBWDBSQL, addType, dbtypeMaker, dbtypes, importDBTableFromString, wbwdbManager };