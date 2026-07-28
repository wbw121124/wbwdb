// ── SQL AST Nodes ──────────────────────────────────────

export type SQLNode =
	| SelectStatement
	| InsertStatement
	| UpdateStatement
	| DeleteStatement
	| CreateTableStatement
	| DropTableStatement
	| AlterTableStatement
	| CreateIndexStatement
	| DropIndexStatement
	| TruncateStatement
	| TransactionStatement
	| GrantStatement
	| ExplainStatement
	| CreatePolicyStatement
	| DropPolicyStatement
	| AlterPolicyStatement
	| EnableRLSStatement
	| SetRoleStatement
	| CreateHookStatement
	| DropHookStatement
	| ShowHooksStatement;

// ── SELECT ─────────────────────────────────────────────

export interface SelectStatement {
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
	union?: { type: 'UNION' | 'INTERSECT' | 'EXCEPT'; all: boolean; select: SelectStatement }[];
	forUpdate?: boolean;
	forShare?: boolean;
}

export interface SelectColumn {
	expr: Expression;
	alias: string | null;
}

export interface FromClause {
	table: string;
	subquery?: SelectStatement;
	alias: string | null;
}

export interface JoinClause {
	type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
	table: string;
	subquery?: SelectStatement;
	alias: string | null;
	on: Expression | null;
	using: string[] | null;
}

export interface OrderByClause {
	expr: Expression;
	direction: 'ASC' | 'DESC';
	nulls: 'FIRST' | 'LAST' | null;
}

export interface WithClause {
	recursive: boolean;
	CTEs: { name: string; columns: string[]; select: SelectStatement }[];
}

// ── INSERT ─────────────────────────────────────────────

export interface InsertStatement {
	type: 'INSERT';
	table: string;
	columns: string[];
	values: { type: 'VALUES'; rows: Expression[][] } | { type: 'SELECT'; select: SelectStatement };
	conflictAction: 'NOTHING' | 'UPDATE' | null;
	conflictColumns?: string[];
	updateColumns?: string[];
	updateExpressions?: Expression[];
	returning?: SelectColumn[];
}

// ── UPDATE ─────────────────────────────────────────────

export interface UpdateStatement {
	type: 'UPDATE';
	table: string;
	sets: { column: string; value: Expression }[];
	where: Expression | null;
	returning?: SelectColumn[];
}

// ── DELETE ─────────────────────────────────────────────

export interface DeleteStatement {
	type: 'DELETE';
	table: string;
	where: Expression | null;
	returning?: SelectColumn[];
	using?: FromClause[];
}

// ── CREATE TABLE ───────────────────────────────────────

export interface CreateTableStatement {
	type: 'CREATE_TABLE';
	ifNotExists: boolean;
	table: string;
	columns: ColumnDef[];
	primaryKey?: string[];
	unique?: string[][];
}

export interface ColumnDef {
	name: string;
	type: string;
	notNull: boolean;
	defaultValue: Expression | null;
	primaryKey: boolean;
	unique: boolean;
	autoIncrement?: boolean;
}

// ── DROP TABLE ─────────────────────────────────────────

export interface DropTableStatement {
	type: 'DROP_TABLE';
	ifExists: boolean;
	table: string;
	cascade: boolean;
}

// ── ALTER TABLE ────────────────────────────────────────

export interface AlterTableStatement {
	type: 'ALTER_TABLE';
	table: string;
	action: 'ADD_COLUMN' | 'DROP_COLUMN' | 'RENAME_COLUMN' | 'ALTER_COLUMN_TYPE';
	column?: string;
	newName?: string;
	columnDef?: ColumnDef;
}

// ── CREATE INDEX ───────────────────────────────────────

export interface CreateIndexStatement {
	type: 'CREATE_INDEX';
	unique: boolean;
	concurrently: boolean;
	indexName: string;
	table: string;
	columns: string[];
	where?: Expression;
}

// ── DROP INDEX ─────────────────────────────────────────

export interface DropIndexStatement {
	type: 'DROP_INDEX';
	concurrently: boolean;
	ifExists: boolean;
	indexName: string;
}

// ── TRUNCATE ───────────────────────────────────────────

export interface TruncateStatement {
	type: 'TRUNCATE';
	table: string;
	cascade: boolean;
}

// ── TRANSACTION ────────────────────────────────────────

export interface TransactionStatement {
	type: 'TRANSACTION';
	action: 'BEGIN' | 'COMMIT' | 'ROLLBACK' | 'SAVEPOINT';
	savepointName?: string;
}

// ── GRANT / REVOKE ────────────────────────────────────

export interface GrantStatement {
	type: 'GRANT';
	permissions: string[];
	table: string;
	grantee: string;
}

// ── EXPLAIN ────────────────────────────────────────────

export interface ExplainStatement {
	type: 'EXPLAIN';
	statement: SQLNode;
}

// ── RLS: Row-Level Security ────────────────────────────

export type RLSPolicyCmd = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface CreatePolicyStatement {
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

export interface DropPolicyStatement {
	type: 'DROP_POLICY';
	policyName: string;
	table: string;
	ifExists: boolean;
}

export interface AlterPolicyStatement {
	type: 'ALTER_POLICY';
	policyName: string;
	table: string;
	newName?: string;
	using?: Expression | null;
	withCheck?: Expression | null;
	roles?: string[];
	cmd?: RLSPolicyCmd;
}

export interface EnableRLSStatement {
	type: 'ENABLE_RLS';
	table: string;
	enable: boolean;
	force?: boolean;
}

export interface SetRoleStatement {
	type: 'SET_ROLE';
	role: string;
	global: boolean;
}

// ── HOOKS ───────────────────────────────────────────────

export type HookEvent = 'INSERT' | 'UPDATE' | 'DELETE';
export type HookTiming = 'BEFORE' | 'AFTER';
export type HookLanguage = 'js' | 'sql';

export interface CreateHookStatement {
	type: 'CREATE_HOOK';
	hookName: string;
	table: string;
	event: HookEvent;
	timing: HookTiming;
	language: HookLanguage;
	body: string;
	ifNotExists: boolean;
}

export interface DropHookStatement {
	type: 'DROP_HOOK';
	hookName: string;
	table: string;
	ifExists: boolean;
}

export interface ShowHooksStatement {
	type: 'SHOW_HOOKS';
	table: string;
}

// ── Expression ─────────────────────────────────────────

export type Expression =
	| LiteralExpr
	| ColumnRef
	| BinaryExpr
	| UnaryExpr
	| FuncCall
	| CaseExpr
	| InExpr
	| BetweenExpr
	| LikeExpr
	| ExistsExpr
	| SubqueryExpr
	| CastExpr
	| ParameterExpr
	| WindowFuncExpr;

export interface LiteralExpr {
	type: 'LITERAL';
	value: string | number | boolean | null;
	dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL';
}

export interface ColumnRef {
	type: 'COLUMN_REF';
	table: string | null;
	column: string;
	star: boolean;
}

export interface BinaryExpr {
	type: 'BINARY';
	op: string;
	left: Expression;
	right: Expression;
}

export interface UnaryExpr {
	type: 'UNARY';
	op: string;
	expr: Expression;
	prefix: boolean;
}

export interface FuncCall {
	type: 'FUNC_CALL';
	name: string;
	args: Expression[];
	distinct: boolean;
	over?: WindowExpr;
}

export interface CaseExpr {
	type: 'CASE';
	expr: Expression | null;
	branches: { when: Expression; then: Expression }[];
	elseExpr: Expression | null;
}

export interface InExpr {
	type: 'IN';
	expr: Expression;
	values: Expression[] | SelectStatement;
	negated: boolean;
}

export interface BetweenExpr {
	type: 'BETWEEN';
	expr: Expression;
	low: Expression;
	high: Expression;
	negated: boolean;
}

export interface LikeExpr {
	type: 'LIKE';
	expr: Expression;
	pattern: Expression;
	negated: boolean;
	caseSensitive: boolean;
}

export interface ExistsExpr {
	type: 'EXISTS';
	select: SelectStatement;
}

export interface SubqueryExpr {
	type: 'SUBQUERY';
	select: SelectStatement;
}

export interface CastExpr {
	type: 'CAST';
	expr: Expression;
	dataType: string;
}

export interface ParameterExpr {
	type: 'PARAMETER';
	index: number;
}

export interface WindowExpr {
	type: 'WINDOW';
	partitionBy: Expression[];
	orderBy: OrderByClause[];
	frame?: { start: string; end: string };
}

export interface WindowFuncExpr {
	type: 'WINDOW_FUNC';
	name: string;
	expr: Expression | null;
	over: WindowExpr;
}
