import { Token, Tokenizer, type TokenType } from './tokenizer.js';
import type {
	SQLNode, SelectStatement, SelectColumn, FromClause, JoinClause, OrderByClause,
	WithClause, InsertStatement, UpdateStatement, DeleteStatement,
	DropTableStatement, AlterTableStatement,
	CreateIndexStatement, DropIndexStatement, TruncateStatement,
	TransactionStatement, ExplainStatement, ColumnDef,
	Expression, FuncCall, CaseExpr, InExpr, BetweenExpr,
	LikeExpr, ExistsExpr, SubqueryExpr, CastExpr, ParameterExpr, WindowFuncExpr, WindowExpr,
	CreatePolicyStatement, DropPolicyStatement, AlterPolicyStatement,
	EnableRLSStatement, SetRoleStatement,
	CreateHookStatement, DropHookStatement, ShowHooksStatement,
} from './ast.js';

export class Parser {
	private tokens: Token[];
	private pos = 0;

	constructor(sql: string) {
		this.tokens = new Tokenizer(sql).tokenize();
	}

	/** Parse a single SQL statement */
	parse(): SQLNode {
		return this.parseStatement();
	}

	/** Parse multiple SQL statements separated by semicolons */
	parseAll(): SQLNode[] {
		const stmts: SQLNode[] = [];
		while (!this.is('EOF')) {
			stmts.push(this.parseStatement());
			if (this.is('SEMICOLON')) this.advance();
		}
		return stmts;
	}

	// ── Statement Dispatch ──────────────────────────────

	private parseStatement(): SQLNode {
		const kw = this.peek().value;
		switch (kw) {
			case 'SELECT':
			case 'WITH': return this.parseSelect();
			case 'INSERT': return this.parseInsert();
			case 'UPDATE': return this.parseUpdate();
			case 'DELETE': return this.parseDelete();
			case 'CREATE': return this.parseCreate();
			case 'DROP': return this.parseDrop();
			case 'ALTER': return this.parseAlter();
			case 'TRUNCATE': return this.parseTruncate();
			case 'BEGIN':
			case 'COMMIT':
			case 'ROLLBACK':
			case 'SAVEPOINT': return this.parseTransaction();
			case 'SET': return this.parseSet();
			case 'EXPLAIN': return this.parseExplain();
			case 'SHOW': return this.parseShow();
			default: throw this.error(`Unexpected keyword: ${kw}`);
		}
	}

	// ── SELECT ──────────────────────────────────────────

	private parseSelect(): SelectStatement {
		let withClause: WithClause | undefined;
		if (this.match('KEYWORD', 'WITH')) {
			const recursive = this.match('KEYWORD', 'RECURSIVE');
			const CTEs: WithClause['CTEs'] = [];
			do {
				const name = this.expectIdentOrKeyword();
				const columns: string[] = [];
				if (this.match('LPAREN')) {
					while (!this.match('RPAREN')) {
						columns.push(this.expectIdentOrKeyword());
						this.match('COMMA');
					}
				}
				this.expect('KEYWORD', 'AS');
				this.expect('LPAREN');
				const select = this.parseSelect();
				this.expect('RPAREN');
				CTEs.push({ name, columns, select });
			} while (this.match('COMMA'));
			withClause = { recursive, CTEs };
		}

		this.expect('KEYWORD', 'SELECT');
		const distinct = this.match('KEYWORD', 'DISTINCT') || this.match('KEYWORD', 'ALL');

		// Parse column list
		const columns = this.parseSelectColumns();

		// FROM
		let from: FromClause = { table: '', alias: null };
		const joins: JoinClause[] = [];

		if (this.match('KEYWORD', 'FROM')) {
			from = this.parseFromClause();
			// Parse JOINs
			while (this.isJoin()) {
				joins.push(this.parseJoin());
			}
		}

		// WHERE
		let where: Expression | null = null;
		if (this.match('KEYWORD', 'WHERE')) {
			where = this.parseExpression();
		}

		// GROUP BY
		const groupBy: Expression[] = [];
		if (this.match('KEYWORD', 'GROUP')) {
			this.expect('KEYWORD', 'BY');
			do { groupBy.push(this.parseExpression()); } while (this.match('COMMA'));
		}

		// HAVING
		let having: Expression | null = null;
		if (this.match('KEYWORD', 'HAVING')) {
			having = this.parseExpression();
		}

		// ORDER BY
		const orderBy = this.parseOrderBy();

		// LIMIT / OFFSET
		let limit: Expression | null = null;
		let offset: Expression | null = null;
		if (this.match('KEYWORD', 'LIMIT')) {
			limit = this.parseExpression();
		}
		if (this.match('KEYWORD', 'OFFSET')) {
			offset = this.parseExpression();
		}

		// FOR UPDATE / FOR SHARE
		let forUpdate = false;
		let forShare = false;
		if (this.match('KEYWORD', 'FOR')) {
			if (this.match('KEYWORD', 'UPDATE')) forUpdate = true;
			else if (this.match('KEYWORD', 'SHARE')) forShare = true;
			else throw this.error('Expected UPDATE or SHARE after FOR');
		}

		const select: SelectStatement = {
			type: 'SELECT',
			distinct,
			columns,
			from,
			joins,
			where,
			groupBy,
			having,
			orderBy,
			limit,
			offset,
			forUpdate,
			forShare,
		};

		if (withClause) select.with = withClause;

		// UNION / INTERSECT / EXCEPT
		if (this.is('KEYWORD') && (this.peek().value === 'UNION' || this.peek().value === 'INTERSECT' || this.peek().value === 'EXCEPT')) {
			const op = this.advance().value as 'UNION' | 'INTERSECT' | 'EXCEPT';
			const all = this.match('KEYWORD', 'ALL');
			const next = this.parseSelect();
			select.union = [{ type: op, all, select: next }];
		}

		return select;
	}

	private parseSelectColumns(): SelectColumn[] {
		const cols: SelectColumn[] = [];
		if (this.match('STAR')) {
			cols.push({ expr: { type: 'COLUMN_REF', table: null, column: '*', star: true }, alias: null });
		} else {
			do {
				const expr = this.parseExpression();
				let alias: string | null = null;
				if (this.match('KEYWORD', 'AS')) {
					alias = this.expectIdentOrKeyword();
				} else if (this.is('IDENT')) {
					alias = this.advance().value;
				}
				cols.push({ expr, alias });
			} while (this.match('COMMA'));
		}
		return cols;
	}

	private parseFromClause(): FromClause {
		if (this.match('LPAREN')) {
			const select = this.parseSelect();
			this.expect('RPAREN');
			const alias = this.match('KEYWORD', 'AS') ? this.expectIdentOrKeyword() : (this.is('IDENT') ? this.advance().value : null);
			return { table: '', subquery: select, alias };
		}
		const table = this.parseTableName();
		const alias = this.match('KEYWORD', 'AS') ? this.expectIdentOrKeyword() : (this.is('IDENT') ? this.advance().value : null);
		return { table, alias };
	}

	private parseJoin(): JoinClause {
		let type: JoinClause['type'];
		if (this.match('KEYWORD', 'INNER')) type = 'INNER';
		else if (this.match('KEYWORD', 'LEFT')) { type = 'LEFT'; this.match('KEYWORD', 'OUTER'); }
		else if (this.match('KEYWORD', 'RIGHT')) { type = 'RIGHT'; this.match('KEYWORD', 'OUTER'); }
		else if (this.match('KEYWORD', 'FULL')) { type = 'FULL'; this.match('KEYWORD', 'OUTER'); }
		else if (this.match('KEYWORD', 'CROSS')) type = 'CROSS';
		else if (this.match('KEYWORD', 'JOIN')) type = 'INNER';
		else throw this.error('Expected JOIN type');

		if (type !== 'CROSS') this.expect('KEYWORD', 'JOIN');
		else this.expect('KEYWORD', 'JOIN');

		let table: string;
		let subquery: SelectStatement | undefined;
		let alias: string | null;

		if (this.match('LPAREN')) {
			subquery = this.parseSelect();
			this.expect('RPAREN');
			alias = this.match('KEYWORD', 'AS') ? this.expectIdentOrKeyword() : (this.is('IDENT') ? this.advance().value : null);
			table = '';
		} else {
			table = this.parseTableName();
			alias = this.match('KEYWORD', 'AS') ? this.expectIdentOrKeyword() : (this.is('IDENT') ? this.advance().value : null);
		}

		let on: Expression | null = null;
		let using: string[] | null = null;

		if (this.match('KEYWORD', 'ON')) {
			on = this.parseExpression();
		} else if (this.match('KEYWORD', 'USING')) {
			this.expect('LPAREN');
			using = [];
			do { using.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
			this.expect('RPAREN');
		}

		return { type, table, subquery, alias, on, using };
	}

	private parseOrderBy(): OrderByClause[] {
		const orderBy: OrderByClause[] = [];
		if (this.match('KEYWORD', 'ORDER')) {
			this.expect('KEYWORD', 'BY');
			do {
				const expr = this.parseExpression();
				const direction = this.match('KEYWORD', 'DESC') ? 'DESC' : (this.match('KEYWORD', 'ASC') ? 'ASC' : 'ASC');
				let nulls: 'FIRST' | 'LAST' | null = null;
				if (this.match('KEYWORD', 'NULLS')) {
					nulls = this.match('KEYWORD', 'FIRST') ? 'FIRST' : 'LAST';
				}
				orderBy.push({ expr, direction, nulls });
			} while (this.match('COMMA'));
		}
		return orderBy;
	}

	// ── INSERT ──────────────────────────────────────────

	private parseInsert(): InsertStatement {
		this.expect('KEYWORD', 'INSERT');
		this.expect('KEYWORD', 'INTO');
		const table = this.parseTableName();

		// Column list
		const columns: string[] = [];
		if (this.match('LPAREN')) {
			do { columns.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
			this.expect('RPAREN');
		}

		// VALUES or SELECT
		let values: InsertStatement['values'];
		if (this.match('KEYWORD', 'VALUES')) {
			const rows: Expression[][] = [];
			do {
				this.expect('LPAREN');
				const row: Expression[] = [];
				if (!this.match('RPAREN')) {
					do { row.push(this.parseExpression()); } while (this.match('COMMA'));
					this.expect('RPAREN');
				}
				rows.push(row);
			} while (this.match('COMMA'));
			values = { type: 'VALUES', rows };
		} else if (this.match('KEYWORD', 'SELECT')) {
			const select = this.parseSelect();
			values = { type: 'SELECT', select };
		} else {
			throw this.error('Expected VALUES or SELECT');
		}

		// ON CONFLICT
		let conflictAction: InsertStatement['conflictAction'] = null;
		let conflictColumns: string[] | undefined;
		let updateColumns: string[] | undefined;
		let updateExpressions: Expression[] | undefined;
		if (this.match('KEYWORD', 'ON')) {
			this.expect('KEYWORD', 'CONFLICT');
			this.expect('LPAREN');
			conflictColumns = [];
			do { conflictColumns.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
			this.expect('RPAREN');
			if (this.match('KEYWORD', 'DO')) {
				if (this.match('KEYWORD', 'NOTHING')) {
					conflictAction = 'NOTHING';
				} else if (this.match('KEYWORD', 'UPDATE')) {
					conflictAction = 'UPDATE';
					this.expect('KEYWORD', 'SET');
					updateColumns = [];
					updateExpressions = [];
					do {
						const col = this.expectIdentOrKeyword();
						this.expect('EQ');
						const expr = this.parseExpression();
						updateColumns.push(col);
						updateExpressions.push(expr);
					} while (this.match('COMMA'));
				}
			}
		}

		// RETURNING
		let returning: SelectColumn[] | undefined;
		if (this.match('KEYWORD', 'RETURNING')) {
			returning = this.parseSelectColumns();
		}

		return { type: 'INSERT', table, columns, values, conflictAction, conflictColumns, updateColumns, updateExpressions, returning };
	}

	// ── UPDATE ──────────────────────────────────────────

	private parseUpdate(): UpdateStatement {
		this.expect('KEYWORD', 'UPDATE');
		const table = this.parseTableName();
		this.expect('KEYWORD', 'SET');

		const sets: UpdateStatement['sets'] = [];
		do {
			const column = this.expectIdentOrKeyword();
			this.expect('EQ');
			const value = this.parseExpression();
			sets.push({ column, value });
		} while (this.match('COMMA'));

		let where: Expression | null = null;
		if (this.match('KEYWORD', 'WHERE')) {
			where = this.parseExpression();
		}

		let returning: SelectColumn[] | undefined;
		if (this.match('KEYWORD', 'RETURNING')) {
			returning = this.parseSelectColumns();
		}

		return { type: 'UPDATE', table, sets, where, returning };
	}

	// ── DELETE ──────────────────────────────────────────

	private parseDelete(): DeleteStatement {
		this.expect('KEYWORD', 'DELETE');
		this.expect('KEYWORD', 'FROM');
		const table = this.parseTableName();

		let where: Expression | null = null;
		if (this.match('KEYWORD', 'WHERE')) {
			where = this.parseExpression();
		}

		let returning: SelectColumn[] | undefined;
		if (this.match('KEYWORD', 'RETURNING')) {
			returning = this.parseSelectColumns();
		}

		return { type: 'DELETE', table, where, returning };
	}

	// ── CREATE TABLE ────────────────────────────────────

	private parseCreate(): SQLNode {
		this.expect('KEYWORD', 'CREATE');
		if (this.match('KEYWORD', 'INDEX')) {
			return this.parseCreateIndex();
		}
		if (this.match('KEYWORD', 'POLICY')) {
			return this.parseCreatePolicy();
		}
		if (this.match('KEYWORD', 'HOOK')) {
			return this.parseCreateHook();
		}
		this.expect('KEYWORD', 'TABLE');
		const ifNotExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'NOT'), this.expect('KEYWORD', 'EXISTS'), true);
		const table = this.parseTableName();
		const columns: ColumnDef[] = [];
		let primaryKey: string[] | undefined;
		const unique: string[][] = [];

		this.expect('LPAREN');
		while (!this.match('RPAREN')) {
			if (this.match('KEYWORD', 'PRIMARY')) {
				this.expect('KEYWORD', 'KEY');
				this.expect('LPAREN');
				primaryKey = [];
				do { primaryKey.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
				this.expect('RPAREN');
			} else if (this.match('KEYWORD', 'UNIQUE')) {
				this.expect('LPAREN');
				const cols: string[] = [];
				do { cols.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
				this.expect('RPAREN');
				unique.push(cols);
			} else {
				const col = this.parseColumnDef();
				columns.push(col);
			}
			this.match('COMMA');
		}

		return { type: 'CREATE_TABLE', ifNotExists: !!ifNotExists, table, columns, primaryKey, unique };
	}

	private parseColumnDef(): ColumnDef {
		const name = this.expectIdentOrKeyword();
		const type = this.parseTypeName();
		let notNull = false;
		let defaultValue: Expression | null = null;
		let colPrimaryKey = false;
		let unique = false;
		let autoIncrement = false;

		while (true) {
			if (this.match('KEYWORD', 'NOT')) {
				if (this.match('KEYWORD', 'NULL')) notNull = true;
			} else if (this.match('KEYWORD', 'NULL')) {
				notNull = false;
			} else if (this.match('KEYWORD', 'PRIMARY')) {
				this.expect('KEYWORD', 'KEY');
				colPrimaryKey = true;
			} else if (this.match('KEYWORD', 'UNIQUE')) {
				unique = true;
			} else if (this.match('KEYWORD', 'DEFAULT')) {
				defaultValue = this.parseExpression();
			} else if (this.match('KEYWORD', 'AUTO_INCREMENT') || this.match('KEYWORD', 'SERIAL')) {
				autoIncrement = true;
			} else {
				break;
			}
		}

		return { name, type, notNull, defaultValue, primaryKey: colPrimaryKey, unique, autoIncrement };
	}

	private parseTypeName(): string {
		let name = this.expectIdentOrKeyword();
		if (this.match('LPAREN')) {
			let precision = this.expect('NUMBER').value;
			if (this.match('COMMA')) {
				precision += ',' + this.expect('NUMBER').value;
			}
			this.expect('RPAREN');
			name += `(${precision})`;
		}
		// Handle types with special keywords
		if (this.is('KEYWORD') && (this.peek().value === 'WITH' || this.peek().value === 'TIME' || this.peek().value === 'ZONE')) {
			if (this.match('KEYWORD', 'WITH') && this.match('KEYWORD', 'TIME') && this.match('KEYWORD', 'ZONE')) {
				name += ' WITH TIME ZONE';
			}
		}
		return name;
	}

	// ── DROP TABLE ──────────────────────────────────────

	private parseDrop(): DropTableStatement | DropIndexStatement | DropPolicyStatement | DropHookStatement {
		this.expect('KEYWORD', 'DROP');
		if (this.match('KEYWORD', 'INDEX')) {
			return this.parseDropIndex();
		}
		if (this.match('KEYWORD', 'POLICY')) {
			return this.parseDropPolicy();
		}
		if (this.match('KEYWORD', 'HOOK')) {
			return this.parseDropHook();
		}
		this.expect('KEYWORD', 'TABLE');
		const ifExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'EXISTS'), true);
		const table = this.parseTableName();
		const cascade = this.match('KEYWORD', 'CASCADE');
		return { type: 'DROP_TABLE', ifExists: !!ifExists, table, cascade };
	}

	// ── ALTER TABLE ─────────────────────────────────────

	private parseAlter(): AlterTableStatement | EnableRLSStatement | AlterPolicyStatement {
		this.expect('KEYWORD', 'ALTER');
		if (this.match('KEYWORD', 'POLICY')) {
			return this.parseAlterPolicy();
		}
		this.expect('KEYWORD', 'TABLE');
		const table = this.parseTableName();

		if (this.match('KEYWORD', 'ADD')) {
			this.expect('KEYWORD', 'COLUMN');
			const col = this.parseColumnDef();
			return { type: 'ALTER_TABLE', table, action: 'ADD_COLUMN', columnDef: col };
		}
		if (this.match('KEYWORD', 'DROP')) {
			this.expect('KEYWORD', 'COLUMN');
			const column = this.expectIdentOrKeyword();
			return { type: 'ALTER_TABLE', table, action: 'DROP_COLUMN', column };
		}
		if (this.match('KEYWORD', 'RENAME')) {
			this.expect('KEYWORD', 'COLUMN');
			const column = this.expectIdentOrKeyword();
			this.expect('KEYWORD', 'TO');
			const newName = this.expectIdentOrKeyword();
			return { type: 'ALTER_TABLE', table, action: 'RENAME_COLUMN', column, newName };
		}
		// ENABLE/DISABLE/FORCE ROW LEVEL SECURITY
		if (this.match('KEYWORD', 'ENABLE')) {
			this.expect('KEYWORD', 'ROW');
			this.expect('KEYWORD', 'LEVEL');
			this.expect('KEYWORD', 'SECURITY');
			return { type: 'ENABLE_RLS', table, enable: true };
		}
		if (this.match('KEYWORD', 'DISABLE')) {
			this.expect('KEYWORD', 'ROW');
			this.expect('KEYWORD', 'LEVEL');
			this.expect('KEYWORD', 'SECURITY');
			return { type: 'ENABLE_RLS', table, enable: false };
		}
		if (this.match('KEYWORD', 'FORCE')) {
			this.expect('KEYWORD', 'ROW');
			this.expect('KEYWORD', 'LEVEL');
			this.expect('KEYWORD', 'SECURITY');
			return { type: 'ENABLE_RLS', table, enable: true, force: true };
		}
		throw this.error('Expected ADD, DROP, RENAME, ENABLE, DISABLE, or FORCE after ALTER TABLE');
	}

	// ── CREATE INDEX ────────────────────────────────────

	private parseCreateIndex(): CreateIndexStatement {
		const unique = this.match('KEYWORD', 'UNIQUE');
		this.expect('KEYWORD', 'INDEX');
		const concurrently = this.match('KEYWORD', 'CONCURRENTLY');
		if (this.match('KEYWORD', 'IF')) { this.expect('KEYWORD', 'NOT'); this.expect('KEYWORD', 'EXISTS'); }
		const indexName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();
		this.expect('LPAREN');
		const columns: string[] = [];
		do { columns.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
		this.expect('RPAREN');

		let where: Expression | undefined;
		if (this.match('KEYWORD', 'WHERE')) {
			where = this.parseExpression();
		}

		return { type: 'CREATE_INDEX', unique, concurrently, indexName, table, columns, where };
	}

	// ── DROP INDEX ──────────────────────────────────────

	private parseDropIndex(): DropIndexStatement {
		const concurrently = this.match('KEYWORD', 'CONCURRENTLY');
		const ifExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'EXISTS'), true);
		const indexName = this.expectIdentOrKeyword();
		return { type: 'DROP_INDEX', concurrently, ifExists: !!ifExists, indexName };
	}

	// ── TRUNCATE ────────────────────────────────────────

	private parseTruncate(): TruncateStatement {
		this.expect('KEYWORD', 'TRUNCATE');
		this.match('KEYWORD', 'TABLE'); // optional TABLE keyword
		const table = this.parseTableName();
		const cascade = this.match('KEYWORD', 'CASCADE');
		return { type: 'TRUNCATE', table, cascade };
	}

	// ── TRANSACTION ─────────────────────────────────────

	private parseTransaction(): TransactionStatement {
		const kw = this.advance().value;
		if (kw === 'BEGIN') return { type: 'TRANSACTION', action: 'BEGIN' };
		if (kw === 'COMMIT') return { type: 'TRANSACTION', action: 'COMMIT' };
		if (kw === 'ROLLBACK') {
			if (this.match('KEYWORD', 'TO')) {
				this.match('KEYWORD', 'SAVEPOINT');
				const name = this.expectIdentOrKeyword();
				return { type: 'TRANSACTION', action: 'ROLLBACK', savepointName: name };
			}
			return { type: 'TRANSACTION', action: 'ROLLBACK' };
		}
		if (kw === 'SAVEPOINT') {
			const name = this.expectIdentOrKeyword();
			return { type: 'TRANSACTION', action: 'SAVEPOINT', savepointName: name };
		}
		throw this.error(`Unexpected keyword: ${kw}`);
	}

	// ── EXPLAIN ─────────────────────────────────────────

	private parseExplain(): ExplainStatement {
		this.expect('KEYWORD', 'EXPLAIN');
		const statement = this.parseStatement();
		return { type: 'EXPLAIN', statement };
	}

	// ── SET ROLE / SET SESSION AUTHORIZATION ────────────

	private parseSet(): SetRoleStatement {
		this.expect('KEYWORD', 'SET');
		const global = false;
		if (this.match('KEYWORD', 'SESSION')) {
			this.expect('KEYWORD', 'AUTHORIZATION');
			const role = this.expectIdentOrKeyword();
			return { type: 'SET_ROLE', role, global };
		}
		if (this.match('KEYWORD', 'ROLE')) {
			const role = this.expectIdentOrKeyword();
			return { type: 'SET_ROLE', role, global };
		}
		// SET session_authorization = 'xxx'
		if (this.match('KEYWORD', 'SESSION')) {
			this.expect('KEYWORD', 'AUTHORIZATION');
			this.expect('EQ');
			const role = this.expect('STRING').value;
			return { type: 'SET_ROLE', role, global };
		}
		throw this.error('Expected ROLE or SESSION AUTHORIZATION after SET');
	}

	// ── CREATE POLICY ──────────────────────────────────

	private parseCreatePolicy(): CreatePolicyStatement {
		const ifNotExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'NOT'), this.expect('KEYWORD', 'EXISTS'), true);
		const policyName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();

		let permissive = true;
		if (this.match('KEYWORD', 'AS')) {
			if (this.match('KEYWORD', 'PERMISSIVE')) permissive = true;
			else if (this.match('KEYWORD', 'RESTRICTIVE')) permissive = false;
		}

		let cmd: CreatePolicyStatement['cmd'] = 'ALL';
		if (this.match('KEYWORD', 'FOR')) {
			if (this.match('KEYWORD', 'ALL')) cmd = 'ALL';
			else if (this.match('KEYWORD', 'SELECT')) cmd = 'SELECT';
			else if (this.match('KEYWORD', 'INSERT')) cmd = 'INSERT';
			else if (this.match('KEYWORD', 'UPDATE')) cmd = 'UPDATE';
			else if (this.match('KEYWORD', 'DELETE')) cmd = 'DELETE';
		}

		const roles: string[] = [];
		if (this.match('KEYWORD', 'TO')) {
			do { roles.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
		}

		let using: Expression | null = null;
		if (this.match('KEYWORD', 'USING')) {
			this.expect('LPAREN');
			using = this.parseExpression();
			this.expect('RPAREN');
		}

		let withCheck: Expression | null = null;
		if (this.match('KEYWORD', 'WITH')) {
			this.expect('KEYWORD', 'CHECK');
			this.expect('LPAREN');
			withCheck = this.parseExpression();
			this.expect('RPAREN');
		}

		return {
			type: 'CREATE_POLICY', policyName, table, cmd, permissive, roles,
			using, withCheck, ifNotExists: !!ifNotExists,
		};
	}

	// ── DROP POLICY ────────────────────────────────────

	private parseDropPolicy(): DropPolicyStatement {
		const ifExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'EXISTS'), true);
		const policyName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();
		return { type: 'DROP_POLICY', policyName, table, ifExists: !!ifExists };
	}

	// ── ALTER POLICY ───────────────────────────────────

	private parseAlterPolicy(): AlterPolicyStatement {
		const policyName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();

		const result: AlterPolicyStatement = { type: 'ALTER_POLICY', policyName, table };

		if (this.match('KEYWORD', 'RENAME')) {
			result.newName = this.expectIdentOrKeyword();
		}

		if (this.match('KEYWORD', 'TO')) {
			result.roles = [];
			do { result.roles.push(this.expectIdentOrKeyword()); } while (this.match('COMMA'));
		}

		if (this.match('KEYWORD', 'USING')) {
			this.expect('LPAREN');
			result.using = this.parseExpression();
			this.expect('RPAREN');
		}

		if (this.match('KEYWORD', 'WITH')) {
			this.expect('KEYWORD', 'CHECK');
			this.expect('LPAREN');
			result.withCheck = this.parseExpression();
			this.expect('RPAREN');
		}

		return result;
	}

	// ── CREATE HOOK ────────────────────────────────────

	private parseCreateHook(): CreateHookStatement {
		const ifNotExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'NOT'), this.expect('KEYWORD', 'EXISTS'), true);
		const hookName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();
		this.expect('KEYWORD', 'FOR');
		let event: CreateHookStatement['event'];
		if (this.match('KEYWORD', 'INSERT')) event = 'INSERT';
		else if (this.match('KEYWORD', 'UPDATE')) event = 'UPDATE';
		else if (this.match('KEYWORD', 'DELETE')) event = 'DELETE';
		else throw this.error('Expected INSERT, UPDATE, or DELETE after FOR');
		let timing: CreateHookStatement['timing'];
		if (this.match('KEYWORD', 'BEFORE')) timing = 'BEFORE';
		else if (this.match('KEYWORD', 'AFTER')) timing = 'AFTER';
		else throw this.error('Expected BEFORE or AFTER');
		this.expect('KEYWORD', 'AS');
		let language: CreateHookStatement['language'];
		let body: string;
		if (this.match('KEYWORD', 'JS')) {
			language = 'js';
			body = this.expect('STRING').value;
		} else if (this.match('KEYWORD', 'SQL')) {
			language = 'sql';
			if (this.is('STRING')) {
				body = this.advance().value;
			} else {
				const parts: string[] = [];
				while (!this.is('EOF') && !this.is('SEMICOLON')) {
					parts.push(this.advance().value);
				}
				body = parts.join(' ').trim();
			}
		} else {
			throw this.error('Expected JS or SQL after AS');
		}
		return { type: 'CREATE_HOOK', hookName, table, event, timing, language, body, ifNotExists: !!ifNotExists };
	}

	// ── DROP HOOK ──────────────────────────────────────

	private parseDropHook(): DropHookStatement {
		const ifExists = this.match('KEYWORD', 'IF') && (this.expect('KEYWORD', 'EXISTS'), true);
		const hookName = this.expectIdentOrKeyword();
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();
		return { type: 'DROP_HOOK', hookName, table, ifExists: !!ifExists };
	}

	// ── SHOW HOOKS ─────────────────────────────────────

	private parseShow(): ShowHooksStatement {
		this.expect('KEYWORD', 'SHOW');
		this.expect('KEYWORD', 'HOOKS');
		this.expect('KEYWORD', 'ON');
		const table = this.parseTableName();
		return { type: 'SHOW_HOOKS', table };
	}

	// ── Expression Parser ───────────────────────────────

	private parseExpression(): Expression {
		return this.parseOr();
	}

	private parseOr(): Expression {
		let left = this.parseAnd();
		while (this.match('KEYWORD', 'OR')) {
			const right = this.parseAnd();
			left = { type: 'BINARY', op: 'OR', left, right };
		}
		return left;
	}

	private parseAnd(): Expression {
		let left = this.parseComparison();
		while (this.match('KEYWORD', 'AND')) {
			const right = this.parseComparison();
			left = { type: 'BINARY', op: 'AND', left, right };
		}
		return left;
	}

	private parseComparison(): Expression {
		let left = this.parseAddSub();

		if (this.match('KEYWORD', 'IS')) {
			const negated = this.match('KEYWORD', 'NOT');
			const value = this.match('KEYWORD', 'NULL') ? { type: 'LITERAL' as const, value: null, dataType: 'NULL' as const } : this.parseAddSub();
			left = { type: 'BINARY', op: negated ? 'IS NOT' : 'IS', left, right: value };
			return left;
		}

		// Check for NOT IN / NOT BETWEEN / NOT LIKE / NOT ILIKE
		const savedPos = this.pos;
		const negated = this.match('KEYWORD', 'NOT');

		if (negated && this.match('KEYWORD', 'IN')) {
			this.expect('LPAREN');
			if (this.is('KEYWORD') && this.peek().value === 'SELECT') {
				const select = this.parseSelect();
				this.expect('RPAREN');
				left = { type: 'IN', expr: left, values: select, negated: true } as InExpr;
			} else {
				const values: Expression[] = [];
				if (!this.match('RPAREN')) {
					do { values.push(this.parseExpression()); } while (this.match('COMMA'));
					this.expect('RPAREN');
				}
				left = { type: 'IN', expr: left, values, negated: true } as InExpr;
			}
			return left;
		}

		if (negated && this.match('KEYWORD', 'BETWEEN')) {
			const low = this.parseAddSub();
			this.expect('KEYWORD', 'AND');
			const high = this.parseAddSub();
			left = { type: 'BETWEEN', expr: left, low, high, negated: true } as BetweenExpr;
			return left;
		}

		if (negated && this.match('KEYWORD', 'LIKE')) {
			const pattern = this.parseAddSub();
			left = { type: 'LIKE', expr: left, pattern, negated: true, caseSensitive: true } as LikeExpr;
			return left;
		}

		if (negated && this.match('KEYWORD', 'ILIKE')) {
			const pattern = this.parseAddSub();
			left = { type: 'LIKE', expr: left, pattern, negated: true, caseSensitive: false } as LikeExpr;
			return left;
		}

		// If NOT was consumed but not followed by IN/BETWEEN/LIKE/ILIKE, backtrack
		if (negated) {
			this.pos = savedPos;
		}

		if (this.match('KEYWORD', 'IN')) {
			this.expect('LPAREN');
			if (this.is('KEYWORD') && this.peek().value === 'SELECT') {
				const select = this.parseSelect();
				this.expect('RPAREN');
				left = { type: 'IN', expr: left, values: select, negated: false } as InExpr;
			} else {
				const values: Expression[] = [];
				if (!this.match('RPAREN')) {
					do { values.push(this.parseExpression()); } while (this.match('COMMA'));
					this.expect('RPAREN');
				}
				left = { type: 'IN', expr: left, values, negated: false } as InExpr;
			}
			return left;
		}

		if (this.match('KEYWORD', 'BETWEEN')) {
			const low = this.parseAddSub();
			this.expect('KEYWORD', 'AND');
			const high = this.parseAddSub();
			left = { type: 'BETWEEN', expr: left, low, high, negated: false } as BetweenExpr;
			return left;
		}

		if (this.match('KEYWORD', 'LIKE')) {
			const pattern = this.parseAddSub();
			left = { type: 'LIKE', expr: left, pattern, negated: false, caseSensitive: true } as LikeExpr;
			return left;
		}

		if (this.match('KEYWORD', 'ILIKE')) {
			const pattern = this.parseAddSub();
			left = { type: 'LIKE', expr: left, pattern, negated: false, caseSensitive: false } as LikeExpr;
			return left;
		}

		if (this.isComparisonOp()) {
			const op = this.advance().value;
			const right = this.parseAddSub();
			left = { type: 'BINARY', op, left, right };
		}

		return left;
	}

	private parseAddSub(): Expression {
		let left = this.parseMulDiv();
		while (this.is('PLUS') || this.is('MINUS')) {
			const op = this.advance().value;
			const right = this.parseMulDiv();
			left = { type: 'BINARY', op, left, right };
		}
		return left;
	}

	private parseMulDiv(): Expression {
		let left = this.parseUnary();
		while (this.is('STAR') || this.is('SLASH') || this.is('PERCENT')) {
			const op = this.advance().value;
			const right = this.parseUnary();
			left = { type: 'BINARY', op, left, right };
		}
		return left;
	}

	private parseUnary(): Expression {
		if (this.match('KEYWORD', 'NOT')) {
			const expr = this.parseUnary();
			return { type: 'UNARY', op: 'NOT', expr, prefix: true };
		}
		if (this.match('MINUS')) {
			const expr = this.parseUnary();
			return { type: 'UNARY', op: '-', expr, prefix: true };
		}
		if (this.match('PLUS')) {
			return this.parseUnary();
		}
		return this.parsePrimary();
	}

	private parsePrimary(): Expression {
		// Subquery
		if (this.match('LPAREN')) {
			if (this.is('KEYWORD') && this.peek().value === 'SELECT') {
				const select = this.parseSelect();
				this.expect('RPAREN');
				return { type: 'SUBQUERY', select } as SubqueryExpr;
			}
			const expr = this.parseExpression();
			this.expect('RPAREN');
			return expr;
		}

		// EXISTS
		if (this.match('KEYWORD', 'EXISTS')) {
			this.expect('LPAREN');
			const select = this.parseSelect();
			this.expect('RPAREN');
			return { type: 'EXISTS', select } as ExistsExpr;
		}

		// CASE
		if (this.match('KEYWORD', 'CASE')) {
			return this.parseCase();
		}

		// CAST
		if (this.match('KEYWORD', 'CAST')) {
			this.expect('LPAREN');
			const expr = this.parseExpression();
			this.expect('KEYWORD', 'AS');
			const dataType = this.parseTypeName();
			this.expect('RPAREN');
			return { type: 'CAST', expr, dataType } as CastExpr;
		}

		// Current timestamp
		if (this.match('KEYWORD', 'CURRENT_TIMESTAMP') || this.match('KEYWORD', 'NOW')) {
			if (this.is('LPAREN')) this.advance(); // optional parens
			if (this.is('RPAREN')) this.advance();
			return { type: 'LITERAL', value: new Date().toISOString(), dataType: 'STRING' };
		}

		// Auth functions (no parentheses required)
		if (this.is('KEYWORD') && (
			this.peek().value === 'AUTH_USER_ID' ||
			this.peek().value === 'AUTH_USERNAME' ||
			this.peek().value === 'AUTH_ROLES' ||
			this.peek().value === 'AUTH_PERMISSIONS' ||
			this.peek().value === 'IS_AUTHENTICATED' ||
			this.peek().value === 'CURRENT_USER' ||
			this.peek().value === 'SESSION_USER'
		)) {
			const funcName = this.advance().value;
			if (this.is('LPAREN')) this.advance();
			if (this.is('RPAREN')) this.advance();
			return { type: 'FUNC_CALL', name: funcName, args: [], distinct: false };
		}

		// Parameter $1, $2, etc.
		if (this.is('IDENT') && this.peek().value.startsWith('$')) {
			const idx = parseInt(this.peek().value.slice(1), 10);
			this.advance();
			return { type: 'PARAMETER', index: idx } as ParameterExpr;
		}

		// Function call or column reference
		if (this.is('IDENT') || this.is('KEYWORD')) {
			const name = this.expectIdentOrKeyword();
			if (this.match('LPAREN')) {
				const distinct = this.match('KEYWORD', 'DISTINCT');
				const args: Expression[] = [];
				if (!this.match('RPAREN')) {
					if (this.match('STAR')) {
						args.push({ type: 'COLUMN_REF', table: null, column: '*', star: true });
					} else {
						do { args.push(this.parseExpression()); } while (this.match('COMMA'));
					}
					this.expect('RPAREN');
				}
				const func: FuncCall = { type: 'FUNC_CALL', name, args, distinct };
				// Window function OVER clause
				if (this.match('KEYWORD', 'OVER')) {
					const over = this.parseWindowSpec();
					return { type: 'WINDOW_FUNC', name, expr: args[0] || null, over } as WindowFuncExpr;
				}
				return func;
			}
			// Column reference
			if (this.match('DOT')) {
				const column = this.match('STAR')
					? '*'
					: this.expectIdentOrKeyword();
				return { type: 'COLUMN_REF', table: name, column, star: column === '*' };
			}
			return { type: 'COLUMN_REF', table: null, column: name, star: false };
		}

		// Star
		if (this.match('STAR')) {
			return { type: 'COLUMN_REF', table: null, column: '*', star: true };
		}

		// Literal
		if (this.is('STRING')) {
			const val = this.advance().value;
			return { type: 'LITERAL', value: val, dataType: 'STRING' };
		}
		if (this.is('NUMBER')) {
			const val = this.advance().value;
			return { type: 'LITERAL', value: val.includes('.') ? parseFloat(val) : parseInt(val, 10), dataType: 'NUMBER' };
		}
		if (this.match('KEYWORD', 'TRUE')) {
			return { type: 'LITERAL', value: true, dataType: 'BOOLEAN' };
		}
		if (this.match('KEYWORD', 'FALSE')) {
			return { type: 'LITERAL', value: false, dataType: 'BOOLEAN' };
		}
		if (this.match('KEYWORD', 'NULL')) {
			return { type: 'LITERAL', value: null, dataType: 'NULL' };
		}

		throw this.error(`Unexpected token: ${this.peek().value}`);
	}

	private parseCase(): CaseExpr {
		let expr: Expression | null = null;
		const branches: CaseExpr['branches'] = [];
		// Parse CASE [expr] WHEN then/WHEN then ... END
		if (this.match('KEYWORD', 'WHEN')) {
			// CASE WHEN ... form: first WHEN already consumed
			const parseBranch = () => {
				const when = this.parseExpression();
				this.expect('KEYWORD', 'THEN');
				const then = this.parseExpression();
				branches.push({ when, then });
			};
			parseBranch();
			while (this.match('KEYWORD', 'WHEN')) {
				parseBranch();
			}
		} else {
			// CASE expr WHEN ... form
			expr = this.parseExpression();
			this.expect('KEYWORD', 'WHEN');
			const parseBranch = () => {
				const when = this.parseExpression();
				this.expect('KEYWORD', 'THEN');
				const then = this.parseExpression();
				branches.push({ when, then });
			};
			parseBranch();
			while (this.match('KEYWORD', 'WHEN')) {
				parseBranch();
			}
		}
		let elseExpr: Expression | null = null;
		if (this.match('KEYWORD', 'ELSE')) {
			elseExpr = this.parseExpression();
		}
		this.expect('KEYWORD', 'END');
		return { type: 'CASE', expr, branches, elseExpr };
	}

	private parseWindowSpec(): WindowExpr {
		this.expect('LPAREN');
		const partitionBy: Expression[] = [];
		const orderBy: OrderByClause[] = [];
		let hasContent = false;

		if (this.match('KEYWORD', 'PARTITION')) {
			this.expect('KEYWORD', 'BY');
			do { partitionBy.push(this.parseExpression()); } while (this.match('COMMA'));
			hasContent = true;
		}
		if (this.is('KEYWORD') && this.peek().value === 'ORDER') {
			orderBy.push(...this.parseOrderBy());
			hasContent = true;
		}
		if (!hasContent && !this.is('RPAREN')) {
			// named window reference
			const name = this.expectIdentOrKeyword();
			return { type: 'WINDOW', partitionBy: [], orderBy: [], frame: { start: name, end: name } };
		}
		this.expect('RPAREN');
		return { type: 'WINDOW', partitionBy, orderBy };
	}

	// ── Helpers ─────────────────────────────────────────

	private parseTableName(): string {
		let name = this.expectIdentOrKeyword();
		if (this.match('DOT')) {
			name += '.' + this.expectIdentOrKeyword();
		}
		return name;
	}

	/** Accept either IDENT or KEYWORD token as an identifier (SQL allows keywords as identifiers) */
	private expectIdentOrKeyword(): string {
		if (this.is('IDENT')) {
			return this.advance().value;
		}
		if (this.is('KEYWORD')) {
			// Keywords used as identifiers should be lowercased (PostgreSQL convention)
			return this.advance().value.toLowerCase();
		}
		throw this.error(`Expected identifier but got ${this.peek().value} (${this.peek().type})`);
	}

	private isComparisonOp(): boolean {
		return this.is('EQ') || this.is('NEQ') || this.is('LT') || this.is('GT') || this.is('LTE') || this.is('GTE') || this.is('LT_GT') || this.is('TILDE');
	}

	private isJoin(): boolean {
		return this.is('KEYWORD') && (this.peek().value === 'JOIN' || this.peek().value === 'INNER' || this.peek().value === 'LEFT' || this.peek().value === 'RIGHT' || this.peek().value === 'FULL' || this.peek().value === 'CROSS');
	}

	private peek(): Token { return this.tokens[this.pos] ?? { type: 'EOF', value: '', line: 0, col: 0 }; }
	private advance(): Token { const tok = this.tokens[this.pos] ?? { type: 'EOF', value: '', line: 0, col: 0 }; this.pos++; return tok; }
	private is(type: TokenType): boolean { return this.peek().type === type; }

	private match(type: TokenType, value?: string): boolean {
		if (!this.is(type)) return false;
		if (value !== undefined && this.peek().value !== value) return false;
		this.pos++;
		return true;
	}

	private expect(type: TokenType, value?: string): Token {
		if (!this.is(type)) {
			throw this.error(`Expected ${value ?? type} but got ${this.peek().value} (${this.peek().type})`);
		}
		if (value !== undefined && this.peek().value !== value) {
			throw this.error(`Expected ${value} but got ${this.peek().value}`);
		}
		return this.advance();
	}

	private error(msg: string): Error {
		const tok = this.peek();
		return new Error(`SQL Parse Error at line ${tok.line}, col ${tok.col}: ${msg}`);
	}
}
