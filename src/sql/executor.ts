import type {
	SQLNode, SelectStatement, SelectColumn, FromClause, JoinClause, OrderByClause,
	InsertStatement, UpdateStatement, DeleteStatement,
	CreateTableStatement, DropTableStatement, AlterTableStatement,
	CreateIndexStatement, TruncateStatement, TransactionStatement,
	CreatePolicyStatement, DropPolicyStatement, AlterPolicyStatement,
	EnableRLSStatement, SetRoleStatement,
	Expression,
} from './ast.js';
import { DBTable, DBSchema, DBFullType, DBRowWithID, dbtypes } from '../types.js';

// ── Types ──────────────────────────────────────────────

export type Row = Record<string, unknown>;

export interface QueryResult {
	columns: string[];
	rows: Row[];
	rowCount: number;
	command: string;
}

// ── RLS Policy ─────────────────────────────────────────

export interface RLSPolicy {
	name: string;
	cmd: string;
	permissive: boolean;
	roles: string[];
	using: Expression | null;
	withCheck: Expression | null;
}

// ── Table Store ────────────────────────────────────────

export class TableStore {
	rows: Row[] = [];
	schema: Map<string, { name: string; notNull: boolean; defaultValue: unknown }> = new Map();
	autoIncrement = 0;
	rlsEnabled = false;
	rlsForced = false;
	policies: RLSPolicy[] = [];

	nextId(): number {
		return ++this.autoIncrement;
	}

	findMaxId(): number {
		let max = 0;
		for (const r of this.rows) {
			const id = Number(r.id);
			if (id > max) max = id;
		}
		this.autoIncrement = max;
		return max;
	}
}

// ── SQL Executor ───────────────────────────────────────

export class SQLExecutor {
	private tables: Map<string, TableStore> = new Map();
	private transactions: Map<string, TableStore>[] = [];
	private currentRole: string = 'public';
	private superUser = true;
	private authContext: { userId: string; username: string; roles: string[]; permissions: string[] } | null = null;

	constructor(existingTables?: Map<string, Row[]>) {
		// Sync existing tables into memory
		if (existingTables) {
			for (const [name, rows] of existingTables) {
				const store = new TableStore();
				for (const row of rows) {
					store.rows.push({ ...row });
				}
				store.findMaxId();
				this.tables.set(name, store);
			}
		}
	}

	/** Set auth context from Auth module */
	setAuthContext(ctx: { userId: string; username: string; roles: string[]; permissions: string[] } | null): void {
		this.authContext = ctx;
		if (ctx) {
			this.currentRole = ctx.username;
			this.superUser = false;
		} else {
			this.currentRole = 'public';
			this.superUser = true;
		}
	}

	/** Get auth context */
	getAuthContext(): { userId: string; username: string; roles: string[]; permissions: string[] } | null {
		return this.authContext;
	}

	/** Execute a parsed SQL statement */
	execute(stmt: SQLNode, params?: unknown[]): QueryResult {
		switch (stmt.type) {
			case 'SELECT': return this.execSelect(stmt, params);
			case 'INSERT': return this.execInsert(stmt, params);
			case 'UPDATE': return this.execUpdate(stmt, params);
			case 'DELETE': return this.execDelete(stmt, params);
			case 'CREATE_TABLE': return this.execCreateTable(stmt);
			case 'DROP_TABLE': return this.execDropTable(stmt);
			case 'ALTER_TABLE': return this.execAlterTable(stmt);
			case 'CREATE_INDEX': return this.execCreateIndex(stmt);
			case 'TRUNCATE': return this.execTruncate(stmt);
			case 'TRANSACTION': return this.execTransaction(stmt);
			case 'EXPLAIN': return this.execExplain(stmt);
			case 'CREATE_POLICY': return this.execCreatePolicy(stmt);
			case 'DROP_POLICY': return this.execDropPolicy(stmt);
			case 'ALTER_POLICY': return this.execAlterPolicy(stmt);
			case 'ENABLE_RLS': return this.execEnableRLS(stmt);
			case 'SET_ROLE': return this.execSetRole(stmt);
			default: throw new Error(`Unsupported statement type: ${(stmt as SQLNode).type}`);
		}
	}

	/** Get table store, throwing if not found */
	private getTable(name: string): TableStore {
		const store = this.tables.get(name);
		if (!store) throw new Error(`Table "${name}" does not exist`);
		return store;
	}

	// ── SELECT ──────────────────────────────────────────

	private execSelect(stmt: SelectStatement, params?: unknown[]): QueryResult {
		let rows = this.resolveFrom(stmt.from, params);

		// Apply RLS to base table
		if (stmt.from.table) {
			const store = this.tables.get(stmt.from.table);
			if (store && store.rlsEnabled) {
				rows = this.rlsFilter(store, rows, 'SELECT');
			}
		}

		// JOINs
		for (const join of stmt.joins) {
			rows = this.applyJoin(rows, join, params);
		}

		// WHERE
		if (stmt.where) {
			rows = rows.filter(row => this.evalExpr(stmt.where!, row, params) as boolean);
		}

		// GROUP BY
		let groupedRows: Row[];
		const hasAggregate = this.hasAggregateColumns(stmt.columns) || !!stmt.having || stmt.groupBy.length > 0;

		if (stmt.groupBy.length > 0 || hasAggregate) {
			groupedRows = this.applyGroupBy(rows, stmt);
		} else {
			groupedRows = rows;
		}

		// HAVING
		if (stmt.having) {
			groupedRows = groupedRows.filter(row => this.evalExpr(stmt.having!, row, params) as boolean);
		}

		// ORDER BY
		if (stmt.orderBy.length > 0) {
			groupedRows = this.applyOrderBy(groupedRows, stmt.orderBy, params);
		}

		// OFFSET
		let resultRows = groupedRows;
		if (stmt.offset) {
			const offset = Number(this.evalExpr(stmt.offset, {}, params));
			resultRows = resultRows.slice(offset);
		}

		// LIMIT
		if (stmt.limit) {
			const limit = Number(this.evalExpr(stmt.limit, {}, params));
			resultRows = resultRows.slice(0, limit);
		}

		// SELECT columns
		const columns: string[] = [];
		const outputRows: Row[] = [];

		for (const row of resultRows) {
			const out: Row = {};
			for (const col of stmt.columns) {
				if (col.expr.type === 'COLUMN_REF' && col.expr.star) {
					// Expand * to all columns in row
					for (const [k, v] of Object.entries(row)) {
						if (!columns.includes(k)) columns.push(k);
						out[k] = v;
					}
				} else {
					const colName = col.alias || this.getColumnExprName(col.expr);
					if (!columns.includes(colName)) columns.push(colName);
					out[colName] = this.evalExpr(col.expr, row, params);
				}
			}
			outputRows.push(out);
		}

		// DISTINCT
		if (stmt.distinct) {
			const seen = new Set<string>();
			const distinctRows: Row[] = [];
			for (const row of outputRows) {
				const sortedKeys = Object.keys(row).sort();
				const normalized: Row = {};
				for (const k of sortedKeys) normalized[k] = row[k];
				const key = JSON.stringify(normalized);
				if (!seen.has(key)) {
					seen.add(key);
					distinctRows.push(row);
				}
			}
			return { columns, rows: distinctRows, rowCount: distinctRows.length, command: 'SELECT' };
		}

		return { columns, rows: outputRows, rowCount: outputRows.length, command: 'SELECT' };
	}

	private resolveFrom(from: FromClause, params?: unknown[]): Row[] {
		if (from.subquery) {
			const result = this.execSelect(from.subquery, params);
			return result.rows;
		}
		// Handle SELECT without FROM (e.g., SELECT 1+1)
		if (!from.table) {
			return [{}];
		}
		const store = this.getTable(from.table);
		const alias = from.alias || from.table;
		return store.rows.map(r => {
			const row: Row = { ...r };
			// Also add prefixed keys for aliased tables (c.name, o.product, etc.)
			if (from.alias) {
				for (const [k, v] of Object.entries(r)) {
					row[`${alias}.${k}`] = v;
				}
			}
			return row;
		});
	}

	private applyJoin(rows: Row[], join: JoinClause, params?: unknown[]): Row[] {
		let rightRows: Row[];
		if (join.subquery) {
			rightRows = this.execSelect(join.subquery, params).rows;
		} else {
			rightRows = this.getTable(join.table).rows.map(r => ({ ...r }));
		}

		const result: Row[] = [];
		const rightAlias = join.alias || join.table;

		for (const left of rows) {
			let matched = false;
			for (const right of rightRows) {
				const merged = { ...left, ...this.prefixedRow(right, rightAlias) };
				let condition = true;

				if (join.on) {
					condition = this.evalExpr(join.on, merged, params) as boolean;
				} else if (join.using) {
					for (const col of join.using) {
						if (left[col] !== right[col]) { condition = false; break; }
					}
				}

				if (condition) {
					result.push(merged);
					matched = true;
				}
			}

			if (!matched && (join.type === 'LEFT' || join.type === 'FULL')) {
				const nullRight: Row = {};
				for (const key of Object.keys(rightRows[0] || {})) {
					nullRight[`${rightAlias}.${key}`] = null;
				}
				result.push({ ...left, ...nullRight });
			}
		}

		// FULL OUTER: add unmatched right rows
		if (join.type === 'FULL') {
			for (const right of rightRows) {
				let matched = false;
				for (const left of rows) {
					const merged = { ...left, ...this.prefixedRow(right, rightAlias) };
					let condition = true;
					if (join.on) condition = this.evalExpr(join.on, merged, params) as boolean;
					if (condition) { matched = true; break; }
				}
				if (!matched) {
					const nullLeft: Row = {};
					for (const key of Object.keys(rows[0] || {})) {
						if (!key.includes('.')) nullLeft[key] = null;
					}
					result.push({ ...nullLeft, ...this.prefixedRow(right, rightAlias) });
				}
			}
		}

		// RIGHT OUTER: handled by reversing logic
		if (join.type === 'RIGHT') {
			const rightResult: Row[] = [];
			for (const right of rightRows) {
				let matched = false;
				for (const left of rows) {
					const merged = { ...left, ...this.prefixedRow(right, rightAlias) };
					let condition = true;
					if (join.on) condition = this.evalExpr(join.on, merged, params) as boolean;
					if (condition) { rightResult.push(merged); matched = true; }
				}
				if (!matched) {
					const nullLeft: Row = {};
					for (const key of Object.keys(rows[0] || {})) {
						if (!key.includes('.')) nullLeft[key] = null;
					}
					rightResult.push({ ...nullLeft, ...this.prefixedRow(right, rightAlias) });
				}
			}
			return rightResult;
		}

		return result;
	}

	private prefixedRow(row: Row, prefix: string): Row {
		const out: Row = {};
		for (const [k, v] of Object.entries(row)) {
			out[`${prefix}.${k}`] = v;
		}
		return out;
	}

	private applyGroupBy(rows: Row[], stmt: SelectStatement): Row[] {
		const groups = new Map<string, Row[]>();

		for (const row of rows) {
			const key = stmt.groupBy.map(e => this.evalExpr(e, row)).map(v => JSON.stringify(v)).join('|||');
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(row);
		}

		// If no groups formed (empty table + aggregate), still produce one row for aggregates
		if (groups.size === 0 && this.hasAggregateColumns(stmt.columns)) {
			const groupRow: Row = { __groupRows: [] } as Row;
			groupRow.__groupRows = [];
			return [groupRow];
		}

		const result: Row[] = [];
		for (const [, groupRows] of groups) {
			const groupRow: Row = {};
			// Use first row for non-aggregate columns
			Object.assign(groupRow, groupRows[0]);
			// Store all rows for aggregate functions
			groupRow.__groupRows = groupRows;
			result.push(groupRow);
		}
		return result;
	}

	private hasAggregateColumns(columns: SelectColumn[]): boolean {
		for (const col of columns) {
			if (col.expr.type === 'FUNC_CALL') {
				const name = col.expr.name.toUpperCase();
				if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(name)) return true;
			}
		}
		return false;
	}

	private applyOrderBy(rows: Row[], orderBy: OrderByClause[], params?: unknown[]): Row[] {
		return [...rows].sort((a, b) => {
			for (const clause of orderBy) {
				const aVal = this.evalExpr(clause.expr, a, params);
				const bVal = this.evalExpr(clause.expr, b, params);

				// NULLS FIRST/LAST
				if (aVal === null && bVal === null) continue;
				if (aVal === null) return clause.nulls === 'LAST' ? 1 : -1;
				if (bVal === null) return clause.nulls === 'LAST' ? -1 : 1;

				const cmp = this.compare(aVal, bVal);
				if (cmp !== 0) return clause.direction === 'DESC' ? -cmp : cmp;
			}
			return 0;
		});
	}

	private compare(a: unknown, b: unknown): number {
		if (a === b) return 0;
		if (a === null || a === undefined) return -1;
		if (b === null || b === undefined) return 1;
		if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
		const sa = String(a);
		const sb = String(b);
		return sa < sb ? -1 : sa > sb ? 1 : 0;
	}

	// ── INSERT ──────────────────────────────────────────

	private execInsert(stmt: InsertStatement, params?: unknown[]): QueryResult {
		const store = this.getTable(stmt.table);

		if (stmt.values.type === 'VALUES') {
			const rows: Row[] = [];
			for (const rowExprs of stmt.values.rows) {
				const row: Row = {};
				const id = store.nextId();
				row.id = id;

				for (let i = 0; i < rowExprs.length; i++) {
					const colName = stmt.columns[i] || `col${i}`;
					row[colName] = this.evalExpr(rowExprs[i], {}, params);
				}

				// RLS WITH CHECK
				if (!this.rlsCheckWith(store, row, 'INSERT')) {
					throw new Error('new row violates row-level security policy');
				}

				// ON CONFLICT
				if (stmt.conflictColumns && stmt.conflictColumns.length > 0) {
					const conflictIdx = store.rows.findIndex(existing => {
						return stmt.conflictColumns!.every(col => existing[col] === row[col]);
					});
					if (conflictIdx !== -1) {
						if (stmt.conflictAction === 'NOTHING') {
							continue;
						} else if (stmt.conflictAction === 'UPDATE' && stmt.updateColumns && stmt.updateExpressions) {
							const existingRow = store.rows[conflictIdx];
							for (let i = 0; i < stmt.updateColumns.length; i++) {
								existingRow[stmt.updateColumns[i]] = this.evalExpr(stmt.updateExpressions[i], existingRow, params);
							}
							rows.push(existingRow);
							continue;
						}
					}
				}

				store.rows.push(row);
				rows.push(row);
			}

			const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
			return { columns, rows, rowCount: rows.length, command: `INSERT ${rows.length}` };
		}

		// INSERT ... SELECT
		const selectResult = this.execSelect(stmt.values.select, params);
		const inserted: Row[] = [];
		for (const selRow of selectResult.rows) {
			const row: Row = { id: store.nextId() };
			for (let i = 0; i < stmt.columns.length; i++) {
				row[stmt.columns[i]] = selRow[stmt.columns[i]] ?? selRow[Object.keys(selRow)[i]];
			}

			// RLS WITH CHECK
			if (!this.rlsCheckWith(store, row, 'INSERT')) {
				throw new Error('new row violates row-level security policy');
			}

			store.rows.push(row);
			inserted.push(row);
		}

		return { columns: inserted.length > 0 ? Object.keys(inserted[0]) : stmt.columns, rows: inserted, rowCount: inserted.length, command: `INSERT ${inserted.length}` };
	}

	// ── UPDATE ──────────────────────────────────────────

	private execUpdate(stmt: UpdateStatement, params?: unknown[]): QueryResult {
		const store = this.getTable(stmt.table);
		const updated: Row[] = [];

		for (const row of store.rows) {
			if (stmt.where && !this.evalExpr(stmt.where, row, params)) continue;

			// RLS: check USING (can access this row?)
			if (!this.rlsCheck(store, row, 'UPDATE')) continue;

			for (const set of stmt.sets) {
				row[set.column] = this.evalExpr(set.value, row, params);
			}

			// RLS: check WITH CHECK (does updated row pass?)
			if (!this.rlsCheckWith(store, row, 'UPDATE')) {
				throw new Error('updated row violates row-level security policy');
			}

			updated.push({ ...row });
		}

		return { columns: updated.length > 0 ? Object.keys(updated[0]) : [], rows: updated, rowCount: updated.length, command: `UPDATE ${updated.length}` };
	}

	// ── DELETE ──────────────────────────────────────────

	private execDelete(stmt: DeleteStatement, params?: unknown[]): QueryResult {
		const store = this.getTable(stmt.table);
		const deleted: Row[] = [];

		store.rows = store.rows.filter(row => {
			if (stmt.where && !this.evalExpr(stmt.where, row, params)) return true;

			// RLS: check USING (can access this row?)
			if (!this.rlsCheck(store, row, 'DELETE')) return true;

			deleted.push({ ...row });
			return false;
		});

		return { columns: deleted.length > 0 ? Object.keys(deleted[0]) : [], rows: deleted, rowCount: deleted.length, command: `DELETE ${deleted.length}` };
	}

	// ── CREATE TABLE ────────────────────────────────────

	private execCreateTable(stmt: CreateTableStatement): QueryResult {
		if (this.tables.has(stmt.table) && !stmt.ifNotExists) {
			throw new Error(`Table "${stmt.table}" already exists`);
		}
		if (!this.tables.has(stmt.table)) {
			const store = new TableStore();
			for (const col of stmt.columns) {
				store.schema.set(col.name, {
					name: col.type,
					notNull: col.notNull,
					defaultValue: col.defaultValue ? this.evalExpr(col.defaultValue, {}) : null,
				});
				if (col.autoIncrement) store.autoIncrement = 0;
			}
			this.tables.set(stmt.table, store);
		}
		return { columns: [], rows: [], rowCount: 0, command: 'CREATE TABLE' };
	}

	// ── DROP TABLE ──────────────────────────────────────

	private execDropTable(stmt: DropTableStatement): QueryResult {
		if (!this.tables.has(stmt.table) && !stmt.ifExists) {
			throw new Error(`Table "${stmt.table}" does not exist`);
		}
		this.tables.delete(stmt.table);
		return { columns: [], rows: [], rowCount: 0, command: 'DROP TABLE' };
	}

	// ── ALTER TABLE ─────────────────────────────────────

	private execAlterTable(stmt: AlterTableStatement): QueryResult {
		const store = this.getTable(stmt.table);
		switch (stmt.action) {
			case 'ADD_COLUMN':
				if (stmt.columnDef) {
					store.schema.set(stmt.columnDef.name, {
						name: stmt.columnDef.type,
						notNull: stmt.columnDef.notNull,
						defaultValue: stmt.columnDef.defaultValue ? this.evalExpr(stmt.columnDef.defaultValue, {}) : null,
					});
					// Add default value to existing rows
					if (stmt.columnDef.defaultValue) {
						const dv = this.evalExpr(stmt.columnDef.defaultValue, {});
						for (const row of store.rows) {
							if (row[stmt.columnDef.name] === undefined) row[stmt.columnDef.name] = dv;
						}
					}
				}
				break;
			case 'DROP_COLUMN':
				if (stmt.column) {
					store.schema.delete(stmt.column);
					for (const row of store.rows) {
						delete row[stmt.column!];
					}
				}
				break;
			case 'RENAME_COLUMN':
				if (stmt.column && stmt.newName) {
					const def = store.schema.get(stmt.column);
					if (def) {
						store.schema.delete(stmt.column);
						store.schema.set(stmt.newName, def);
					}
					for (const row of store.rows) {
						if (row[stmt.column!] !== undefined) {
							row[stmt.newName!] = row[stmt.column!];
							delete row[stmt.column!];
						}
					}
				}
				break;
		}
		return { columns: [], rows: [], rowCount: 0, command: 'ALTER TABLE' };
	}

	// ── CREATE INDEX ────────────────────────────────────

	private execCreateIndex(_stmt: CreateIndexStatement): QueryResult {
		// In-memory: no-op (index not needed for small datasets)
		return { columns: [], rows: [], rowCount: 0, command: 'CREATE INDEX' };
	}

	// ── TRUNCATE ────────────────────────────────────────

	private execTruncate(stmt: TruncateStatement): QueryResult {
		const store = this.getTable(stmt.table);
		store.rows = [];
		store.autoIncrement = 0;
		return { columns: [], rows: [], rowCount: 0, command: 'TRUNCATE TABLE' };
	}

	// ── TRANSACTION ─────────────────────────────────────

	private execTransaction(stmt: TransactionStatement): QueryResult {
		switch (stmt.action) {
			case 'BEGIN': {
				const snapshot = new Map<string, TableStore>();
				for (const [k, v] of this.tables) {
					const copy = new TableStore();
					copy.rows = v.rows.map(r => ({ ...r }));
					copy.schema = new Map(v.schema);
					copy.autoIncrement = v.autoIncrement;
					copy.rlsEnabled = v.rlsEnabled;
					copy.rlsForced = v.rlsForced;
					copy.policies = v.policies.map(p => ({ ...p }));
					snapshot.set(k, copy);
				}
				this.transactions.push(snapshot);
				break;
			}
			case 'COMMIT':
				this.transactions.pop();
				break;
			case 'ROLLBACK':
				if (this.transactions.length > 0) {
					const snapshot = this.transactions.pop()!;
					this.tables = snapshot;
				}
				break;
			case 'SAVEPOINT':
				// In-memory: simplified savepoint
				break;
		}
		return { columns: [], rows: [], rowCount: 0, command: stmt.action };
	}

	// ── EXPLAIN ─────────────────────────────────────────

	private execExplain(stmt: { statement: SQLNode }): QueryResult {
		const plan = this.generatePlan(stmt.statement);
		return { columns: ['QUERY PLAN'], rows: plan.map(p => ({ 'QUERY PLAN': p })), rowCount: plan.length, command: 'EXPLAIN' };
	}

	private generatePlan(stmt: SQLNode): string[] {
		const lines: string[] = [];
		if (stmt.type === 'SELECT') {
			lines.push(`Seq Scan on ${stmt.from.table || '(subquery)'}`);
			if (stmt.where) lines.push(`  Filter: <condition>`);
			if (stmt.orderBy.length) lines.push(`  Sort Key: ${stmt.orderBy.map(o => this.getColumnExprName(o.expr)).join(', ')}`);
			if (stmt.limit) lines.push(`  Limit`);
		} else {
			lines.push(`${stmt.type} on ${stmt.type === 'DELETE' ? (stmt as DeleteStatement).table : stmt.type === 'UPDATE' ? (stmt as UpdateStatement).table : '(unknown)'}`);
		}
		return lines;
	}

	// ── RLS: Row-Level Security ─────────────────────────

	/** Check if RLS allows a row to be accessed */
	private rlsCheck(store: TableStore, row: Row, cmd: string): boolean {
		// Superuser bypasses RLS
		if (this.superUser) return true;

		// RLS not enabled for this table
		if (!store.rlsEnabled) return true;

		// Collect applicable policies
		const applicable = store.policies.filter(p => {
			if (p.cmd !== 'ALL' && p.cmd !== cmd) return false;
			if (p.roles.length === 0) return true;
			return p.roles.includes(this.currentRole);
		});

		// If no policies apply and RLS is forced, deny
		if (applicable.length === 0 && store.rlsForced) return false;

		// Permissive policies: any passing policy grants access
		const permissive = applicable.filter(p => p.permissive);
		if (permissive.length > 0) {
			return permissive.some(p => p.using ? this.evalExpr(p.using, row) as boolean : true);
		}

		// Restrictive policies: all must pass
		const restrictive = applicable.filter(p => !p.permissive);
		if (restrictive.length > 0) {
			return restrictive.every(p => p.using ? this.evalExpr(p.using, row) as boolean : true);
		}

		// No policies: default allow
		return true;
	}

	/** Check RLS WITH CHECK for INSERT/UPDATE */
	private rlsCheckWith(store: TableStore, row: Row, cmd: string): boolean {
		if (this.superUser) return true;
		if (!store.rlsEnabled) return true;

		const applicable = store.policies.filter(p => {
			if (p.cmd !== 'ALL' && p.cmd !== cmd) return false;
			if (p.roles.length === 0) return true;
			return p.roles.includes(this.currentRole);
		});

		const permissive = applicable.filter(p => p.permissive);
		if (permissive.length > 0) {
			return permissive.some(p => {
				if (p.withCheck) return this.evalExpr(p.withCheck, row) as boolean;
				if (p.using) return this.evalExpr(p.using, row) as boolean;
				return true;
			});
		}

		const restrictive = applicable.filter(p => !p.permissive);
		if (restrictive.length > 0) {
			return restrictive.every(p => {
				if (p.withCheck) return this.evalExpr(p.withCheck, row) as boolean;
				if (p.using) return this.evalExpr(p.using, row) as boolean;
				return true;
			});
		}

		return true;
	}

	/** Apply RLS filter to a set of rows */
	private rlsFilter(store: TableStore, rows: Row[], cmd: string): Row[] {
		return rows.filter(row => this.rlsCheck(store, row, cmd));
	}

	// ── RLS Statement Handlers ──────────────────────────

	private execCreatePolicy(stmt: CreatePolicyStatement): QueryResult {
		const store = this.getTable(stmt.table);
		const exists = store.policies.some(p => p.name === stmt.policyName);
		if (exists && !stmt.ifNotExists) {
			throw new Error(`Policy "${stmt.policyName}" already exists on table "${stmt.table}"`);
		}
		if (!exists) {
			store.policies.push({
				name: stmt.policyName,
				cmd: stmt.cmd,
				permissive: stmt.permissive,
				roles: stmt.roles,
				using: stmt.using,
				withCheck: stmt.withCheck,
			});
		}
		return { columns: [], rows: [], rowCount: 0, command: 'CREATE POLICY' };
	}

	private execDropPolicy(stmt: DropPolicyStatement): QueryResult {
		const store = this.getTable(stmt.table);
		const idx = store.policies.findIndex(p => p.name === stmt.policyName);
		if (idx === -1 && !stmt.ifExists) {
			throw new Error(`Policy "${stmt.policyName}" does not exist on table "${stmt.table}"`);
		}
		if (idx >= 0) store.policies.splice(idx, 1);
		return { columns: [], rows: [], rowCount: 0, command: 'DROP POLICY' };
	}

	private execAlterPolicy(stmt: AlterPolicyStatement): QueryResult {
		const store = this.getTable(stmt.table);
		const policy = store.policies.find(p => p.name === stmt.policyName);
		if (!policy) throw new Error(`Policy "${stmt.policyName}" does not exist on table "${stmt.table}"`);
		if (stmt.newName) policy.name = stmt.newName;
		if (stmt.roles) policy.roles = stmt.roles;
		if (stmt.using !== undefined) policy.using = stmt.using;
		if (stmt.withCheck !== undefined) policy.withCheck = stmt.withCheck;
		if (stmt.cmd) policy.cmd = stmt.cmd;
		return { columns: [], rows: [], rowCount: 0, command: 'ALTER POLICY' };
	}

	private execEnableRLS(stmt: EnableRLSStatement): QueryResult {
		const store = this.getTable(stmt.table);
		store.rlsEnabled = stmt.enable;
		if (stmt.force) store.rlsForced = true;
		return { columns: [], rows: [], rowCount: 0, command: stmt.enable ? 'ALTER TABLE' : 'ALTER TABLE' };
	}

	private execSetRole(stmt: SetRoleStatement): QueryResult {
		this.currentRole = stmt.role;
		if (stmt.role === 'public' || stmt.role === 'none') this.superUser = true;
		else this.superUser = false;
		return { columns: [], rows: [], rowCount: 0, command: 'SET ROLE' };
	}

	/** Get current role */
	getCurrentRole(): string {
		return this.currentRole;
	}

	/** Check if current session is superuser */
	isSuperUser(): boolean {
		return this.superUser;
	}

	// ── Expression Evaluator ────────────────────────────

	private evalExpr(expr: Expression, row: Row, params?: unknown[]): unknown {
		switch (expr.type) {
			case 'LITERAL': return expr.value;
			case 'PARAMETER': return params?.[expr.index - 1] ?? null;

			case 'COLUMN_REF': {
				if (expr.star) return row;
				if (expr.table) {
					const qualified = `${expr.table}.${expr.column}`;
					if (row[qualified] !== undefined) return row[qualified];
					// Try without prefix
					if (row[expr.column] !== undefined) return row[expr.column];
					return null;
				}
				// Try to find column in row (may be qualified)
				if (row[expr.column] !== undefined) return row[expr.column];
				// Try unqualified match
				for (const key of Object.keys(row)) {
					const parts = key.split('.');
					if (parts.length === 2 && parts[1] === expr.column) return row[key];
				}
				return null;
			}

			case 'UNARY': {
				const val = this.evalExpr(expr.expr, row, params);
				if (expr.op === 'NOT') return !val;
				if (expr.op === '-') return -(val as number);
				return val;
			}

			case 'BINARY': {
				// Short-circuit for AND/OR
				if (expr.op === 'AND') {
					const left = this.evalExpr(expr.left, row, params);
					return !!left && !!this.evalExpr(expr.right, row, params);
				}
				if (expr.op === 'OR') {
					const left = this.evalExpr(expr.left, row, params);
					return !!left || !!this.evalExpr(expr.right, row, params);
				}

				const left = this.evalExpr(expr.left, row, params);
				const right = this.evalExpr(expr.right, row, params);

				// NULL propagation for comparisons
				if (left === null || right === null) {
					if (expr.op === 'IS') return left === null && right === null;
					if (expr.op === 'IS NOT') return !(left === null && right === null);
					return null;
				}

				switch (expr.op) {
					case '=': return typeof left === typeof right ? left === right : String(left) === String(right);
					case '!=': case '<>': return typeof left === typeof right ? left !== right : String(left) !== String(right);
					case '<': return (left as number) < (right as number);
					case '>': return (left as number) > (right as number);
					case '<=': return (left as number) <= (right as number);
					case '>=': return (left as number) >= (right as number);
					case '+': return (left as number) + (right as number);
					case '-': return (left as number) - (right as number);
					case '*': return (left as number) * (right as number);
					case '/': if ((right as number) === 0) throw new Error('Division by zero'); return (left as number) / (right as number);
					case '%': if ((right as number) === 0) throw new Error('Division by zero'); return (left as number) % (right as number);
					case '||': return String(left) + String(right);
					case 'IS': return left === right;
					case 'IS NOT': return left !== right;
					default: return null;
				}
			}

			case 'FUNC_CALL': {
				const name = expr.name.toUpperCase();
				const args = expr.args.map(a => this.evalExpr(a, row, params));

				// Check for aggregate context
				const groupRows: Row[] | undefined = (row as Record<string, unknown>).__groupRows as Row[] | undefined;

				if (groupRows) {
					switch (name) {
						case 'COUNT': return expr.distinct ? this.countDistinct(groupRows, expr.args[0]) : groupRows.length;
						case 'SUM': return this.sumAggregate(groupRows, expr.args[0]);
						case 'AVG': return this.avgAggregate(groupRows, expr.args[0]);
						case 'MIN': return this.minAggregate(groupRows, expr.args[0]);
						case 'MAX': return this.maxAggregate(groupRows, expr.args[0]);
					}
				}

				switch (name) {
					case 'COUNT': {
						if (expr.args[0]?.type === 'COLUMN_REF' && (expr.args[0] as { column: string }).column === '*') {
							return 1;
						}
						return args[0] !== null ? 1 : 0;
					}
					case 'SUM': return args.reduce<number>((a, b) => a + Number(b), 0);
					case 'AVG': return args.length ? args.reduce<number>((a, b) => a + Number(b), 0) / args.length : null;
					case 'MIN': return args.length ? Math.min(...args.map(Number)) : null;
					case 'MAX': return args.length ? Math.max(...args.map(Number)) : null;
					case 'COALESCE': return args.find(a => a !== null) ?? null;
					case 'NULLIF': return args[0] === args[1] ? null : args[0];
					case 'ABS': return Math.abs(args[0] as number);
					case 'CEIL': return Math.ceil(args[0] as number);
					case 'FLOOR': return Math.floor(args[0] as number);
					case 'ROUND': return Number(Number(args[0]).toFixed(Number(args[1]) || 0));
					case 'LENGTH': case 'CHAR_LENGTH': return String(args[0]).length;
					case 'UPPER': return String(args[0]).toUpperCase();
					case 'LOWER': return String(args[0]).toLowerCase();
					case 'TRIM': return String(args[0]).trim();
					case 'LTRIM': return String(args[0]).trimStart();
					case 'RTRIM': return String(args[0]).trimEnd();
					case 'SUBSTRING': case 'SUBSTR': return String(args[0]).substring(Number(args[1]) - 1, Number(args[1]) - 1 + Number(args[2] ?? String(String(args[0]).length)));
					case 'REPLACE': return String(args[0]).replaceAll(String(args[1]), String(args[2]));
					case 'CONCAT': return args.map(String).join('');
					case 'NOW': case 'CURRENT_TIMESTAMP': return new Date().toISOString();
					case 'CURRENT_USER': return this.authContext?.username || this.currentRole;
					case 'SESSION_USER': return this.authContext?.username || this.currentRole;
					case 'AUTH_USER_ID': return this.authContext?.userId || null;
					case 'AUTH_USERNAME': return this.authContext?.username || null;
					case 'AUTH_ROLES': return this.authContext?.roles || [];
					case 'AUTH_PERMISSIONS': return this.authContext?.permissions || [];
					case 'IS_AUTHENTICATED': return this.authContext !== null;
					case 'EXTRACT': return this.evalExtract(args);
					case 'GREATEST': return Math.max(...args.map(Number));
					case 'LEAST': return Math.min(...args.map(Number));
					case 'JSONB_BUILD_OBJECT': {
						const obj: Record<string, unknown> = {};
						for (let i = 0; i < args.length; i += 2) {
							obj[String(args[i])] = args[i + 1];
						}
						return obj;
					}
					case 'GENERATE_SERIES': return Array.from({ length: Number(args[1]) - Number(args[0]) + 1 }, (_, i) => Number(args[0]) + i);
					default: throw new Error(`Unknown function: ${name}`);
				}
			}

			case 'CASE': {
				const caseVal = expr.expr ? this.evalExpr(expr.expr, row, params) : null;
				for (const branch of expr.branches) {
					if (expr.expr) {
						if (this.evalExpr(branch.when, row, params) === caseVal) {
							return this.evalExpr(branch.then, row, params);
						}
					} else {
						if (this.evalExpr(branch.when, row, params)) {
							return this.evalExpr(branch.then, row, params);
						}
					}
				}
				return expr.elseExpr ? this.evalExpr(expr.elseExpr, row, params) : null;
			}

			case 'IN': {
				const val = this.evalExpr(expr.expr, row, params);
				let result: boolean;
				if (Array.isArray(expr.values)) {
					result = expr.values.some(v => this.evalExpr(v, row, params) === val);
				} else {
					const subResult = this.execSelect(expr.values);
					result = subResult.rows.some(r => {
						const keys = Object.keys(r);
						return keys.some(k => r[k] === val);
					});
				}
				return expr.negated ? !result : result;
			}

			case 'BETWEEN': {
				const val = this.evalExpr(expr.expr, row, params) as number;
				const low = this.evalExpr(expr.low, row, params) as number;
				const high = this.evalExpr(expr.high, row, params) as number;
				const result = val >= low && val <= high;
				return expr.negated ? !result : result;
			}

			case 'LIKE': {
				const val = String(this.evalExpr(expr.expr, row, params));
				const pattern = String(this.evalExpr(expr.pattern, row, params));
				const regex = this.likeToRegex(pattern);
				const result = regex.test(val);
				return expr.negated ? !result : result;
			}

			case 'EXISTS': {
				const result = this.execSelect(expr.select);
				return result.rows.length > 0;
			}

			case 'SUBQUERY': {
				const result = this.execSelect(expr.select);
				return result.rows[0] ? Object.values(result.rows[0])[0] : null;
			}

			case 'CAST': {
				const val = this.evalExpr(expr.expr, row, params);
				const target = expr.dataType.toUpperCase();
				if (val === null) return null;
				switch (target) {
					case 'INTEGER': case 'INT': case 'INT4': return parseInt(String(val), 10);
					case 'BIGINT': case 'INT8': {
						try { return BigInt(String(val)); }
						catch { throw new Error(`Cannot cast "${val}" to BIGINT`); }
					}
					case 'SMALLINT': case 'INT2': return parseInt(String(val), 10);
					case 'REAL': case 'FLOAT4': return parseFloat(String(val));
					case 'DOUBLE PRECISION': case 'FLOAT8': return parseFloat(String(val));
					case 'NUMERIC': case 'DECIMAL': return parseFloat(String(val));
					case 'BOOLEAN': case 'BOOL': return val === 'true' || val === 't' || val === '1';
					case 'TEXT': case 'VARCHAR': case 'CHARACTER VARYING': return String(val);
					case 'DATE': return String(val);
					case 'TIMESTAMP': case 'TIMESTAMP WITHOUT TIME ZONE': return String(val);
					case 'TIMESTAMPTZ': case 'TIMESTAMP WITH TIME ZONE': return String(val);
					case 'JSON': case 'JSONB':
						if (typeof val === 'string') {
							try { return JSON.parse(val); }
							catch { throw new Error(`Cannot cast "${val}" to JSON`); }
						}
						return val;
					default: return val;
				}
			}

			default: return null;
		}
	}

	private countDistinct(groupRows: Row[], expr: Expression | undefined): number {
		if (!expr) return groupRows.length;
		const seen = new Set<string>();
		for (const row of groupRows) {
			const val = this.evalExpr(expr, row);
			seen.add(JSON.stringify(val));
		}
		return seen.size;
	}

	private sumAggregate(groupRows: Row[], expr: Expression | undefined): number {
		if (!expr) return 0;
		let sum = 0;
		for (const row of groupRows) {
			const val = this.evalExpr(expr, row);
			if (val !== null) sum += Number(val);
		}
		return sum;
	}

	private avgAggregate(groupRows: Row[], expr: Expression | undefined): number | null {
		if (!expr || groupRows.length === 0) return null;
		let sum = 0;
		let count = 0;
		for (const row of groupRows) {
			const val = this.evalExpr(expr, row);
			if (val !== null) { sum += Number(val); count++; }
		}
		return count > 0 ? sum / count : null;
	}

	private minAggregate(groupRows: Row[], expr: Expression | undefined): unknown {
		if (!expr) return null;
		let min: unknown = null;
		for (const row of groupRows) {
			const val = this.evalExpr(expr, row);
			if (val !== null && (min === null || (val as number) < (min as number))) min = val;
		}
		return min;
	}

	private maxAggregate(groupRows: Row[], expr: Expression | undefined): unknown {
		if (!expr) return null;
		let max: unknown = null;
		for (const row of groupRows) {
			const val = this.evalExpr(expr, row);
			if (val !== null && (max === null || (val as number) > (max as number))) max = val;
		}
		return max;
	}

	private evalExtract(args: unknown[]): number {
		const part = String(args[0]).toUpperCase();
		const ts = new Date(String(args[1]));
		switch (part) {
			case 'YEAR': return ts.getFullYear();
			case 'MONTH': return ts.getMonth() + 1;
			case 'DAY': return ts.getDate();
			case 'HOUR': return ts.getHours();
			case 'MINUTE': return ts.getMinutes();
			case 'SECOND': return ts.getSeconds();
			case 'DOW': return ts.getDay();
			case 'DOY': return Math.floor((ts.getTime() - new Date(Date.UTC(ts.getFullYear(), 0, 1)).getTime()) / 86400000) + 1;
			case 'EPOCH': return Math.floor(ts.getTime() / 1000);
			default: return 0;
		}
	}

	private likeToRegex(pattern: string): RegExp {
		let regex = '^';
		for (let i = 0; i < pattern.length; i++) {
			const ch = pattern[i];
			if (ch === '%') { regex += '.*'; }
			else if (ch === '_') { regex += '.'; }
			else if (ch === '\\') { i++; regex += this.escapeRegex(pattern[i]); }
			else { regex += this.escapeRegex(ch); }
		}
		regex += '$';
		return new RegExp(regex, 'i');
	}

	private escapeRegex(s: string): string {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private getColumnExprName(expr: Expression): string {
		if (expr.type === 'COLUMN_REF') {
			if (expr.table) return `${expr.table}.${expr.column}`;
			return expr.column;
		}
		if (expr.type === 'FUNC_CALL') {
			const args = expr.args.map(a => this.getColumnExprName(a)).join(', ');
			return `${expr.name}(${args})`;
		}
		return 'expr';
	}

	/** Get all table names */
	getTables(): string[] {
		return [...this.tables.keys()];
	}

	/** Get a specific table as an array of Row */
	getTableRows(name: string): Row[] {
		return this.tables.get(name)?.rows ?? [];
	}

	/** Get table store (for sync) */
	getTableStore(name: string): TableStore | undefined {
		return this.tables.get(name);
	}

	/** Sync SQL tables back to wbwdb DBTable objects */
	syncTo(wbwdbTables: Map<string, DBTable>): void {
		for (const [name, store] of this.tables) {
			// Build schema
			const schemaMap = new Map<string, DBFullType<any>>();
			for (const [colName, colDef] of store.schema.entries()) {
				const dbType = dbtypes.get(colDef.name) ?? dbtypes.get('String')!;
				schemaMap.set(colName, new DBFullType(dbType, colDef.notNull, colDef.defaultValue ?? undefined));
			}
			const schema = new DBSchema(schemaMap);

			// Build rows
			const rows: DBRowWithID[] = store.rows.map(r => {
				const rowMap = new Map<string, any>();
				for (const [k, v] of Object.entries(r)) {
					if (k === 'id') continue;
					rowMap.set(k, v);
				}
				return new DBRowWithID(rowMap, Number(r.id) || 0);
			});

			const table = new DBTable(name, schema, store.autoIncrement, rows);
			wbwdbTables.set(name, table);
		}
		// Remove tables that no longer exist in SQL engine
		for (const name of wbwdbTables.keys()) {
			if (!this.tables.has(name)) {
				wbwdbTables.delete(name);
			}
		}
	}
}