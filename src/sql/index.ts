import { Parser } from './parser.js';
import { SQLExecutor, type QueryResult, type Row } from './executor.js';
import { DBTable, DBSchema, DBFullType, DBRowWithID, dbtypes } from '../types.js';
import type { TableHook, RLSPolicyData } from '../types.js';

export type { QueryResult, Row } from './executor.js';

function splitStatements(sql: string): string[] {
	const result: string[] = [];
	let i = 0;
	let start = 0;
	while (i < sql.length) {
		const ch = sql[i];
		if (ch === "'") {
			i++;
			while (i < sql.length && sql[i] !== "'") {
				if (sql[i] === '\\') i++;
				i++;
			}
			i++;
		} else if (ch === '"') {
			i++;
			while (i < sql.length && sql[i] !== '"') {
				if (sql[i] === '\\') i++;
				i++;
			}
			i++;
		} else if (ch === '$' && i + 1 < sql.length && sql[i + 1] === '$') {
			i += 2;
			while (i < sql.length) {
				if (sql[i] === '$' && i + 1 < sql.length && sql[i + 1] === '$') {
					i += 2;
					break;
				}
				i++;
			}
		} else if (ch === ';') {
			const part = sql.slice(start, i);
			if (part.trim()) result.push(part);
			start = i + 1;
			i++;
		} else {
			i++;
		}
	}
	if (start < sql.length) {
		const part = sql.slice(start);
		if (part.trim()) result.push(part);
	}
	return result;
}

export class WBWDBSQL {
	private executor: SQLExecutor;
	private wbwdbTables: Map<string, DBTable>;

	constructor(wbwdbTables: Map<string, DBTable>) {
		this.wbwdbTables = wbwdbTables;
		const initial = new Map<string, Row[]>();
		const schemas = new Map<string, Map<string, { name: string; notNull: boolean; defaultValue: unknown }>>();
		const rlsStates = new Map<string, { enabled: boolean; forced: boolean; policies: Array<{ name: string; cmd: string; permissive: boolean; roles: string[]; using: unknown; withCheck: unknown }> }>();
		const hooksStates = new Map<string, TableHook[]>();
		for (const [name, table] of wbwdbTables) {
			const rows: Row[] = table.rows.map(r => {
				const row: Row = {};
				for (const [k, v] of r.row) {
					row[k] = v;
				}
				row.id = r.id;
				return row;
			});
			initial.set(name, rows);
			const schemaMap = new Map<string, { name: string; notNull: boolean; defaultValue: unknown }>();
			for (const [col, fullType] of table.schema.map.entries()) {
				schemaMap.set(col, {
					name: fullType.t.name,
					notNull: fullType.nullable === false,
					defaultValue: fullType.defaultVal,
				});
			}
			schemas.set(name, schemaMap);
			rlsStates.set(name, {
				enabled: table.rlsEnabled,
				forced: table.rlsForced,
				policies: table.policies,
			});
			if (table.hooks.length > 0) {
				hooksStates.set(name, table.hooks);
			}
		}
		this.executor = new SQLExecutor(initial, schemas, rlsStates, hooksStates);
	}

	execute(sql: string, params?: unknown[]): QueryResult {
		const trimmed = sql.trim();
		if (!trimmed) throw new Error('Empty SQL statement');

		const stmts = splitStatements(trimmed).filter(s => s.trim());
		if (stmts.length === 1) {
			const parser = new Parser(trimmed);
			const ast = parser.parse();
			const result = this.executor.execute(ast, params);
			this.syncToWBWDB();
			return result;
		}

		let lastResult: QueryResult | null = null;
		for (const stmt of stmts) {
			if (!stmt.trim()) continue;
			const parser = new Parser(stmt.trim());
			const ast = parser.parse();
			lastResult = this.executor.execute(ast, params);
		}
		this.syncToWBWDB();
		return lastResult ?? { columns: [], rows: [], rowCount: 0, command: 'UNKNOWN' };
	}

	parse(sql: string) {
		const parser = new Parser(sql);
		return parser.parse();
	}

	executeAST(ast: ReturnType<Parser['parse']>, params?: unknown[]): QueryResult {
		return this.executor.execute(ast, params);
	}

	/** Set auth context for RLS integration */
	setAuthContext(ctx: { userId: string; username: string; roles: string[]; permissions: string[] } | null): void {
		this.executor.setAuthContext(ctx);
	}

	/** Get current auth context */
	getAuthContext(): { userId: string; username: string; roles: string[]; permissions: string[] } | null {
		return this.executor.getAuthContext();
	}

	tables(): string[] {
		return this.executor.getTables();
	}

	tableRows(name: string): Row[] {
		return this.executor.getTableRows(name);
	}

	private syncToWBWDB(): void {
		const sqlTables = this.executor.getTables();
		for (const name of sqlTables) {
			const store = this.executor.getTableStore(name);
			if (!store) continue;

			const schemaMap = new Map<string, DBFullType<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
			for (const [colName, colDef] of store.schema.entries()) {
				const capitalizedName = colDef.name.charAt(0).toUpperCase() + colDef.name.slice(1);
				const dbType = dbtypes.get(colDef.name) ?? dbtypes.get(capitalizedName) ?? dbtypes.values().next().value;
				if (!dbType) continue;
				schemaMap.set(colName, new DBFullType(dbType, colDef.notNull, colDef.defaultValue ?? undefined));
			}
			const schema = new DBSchema(schemaMap);

			const rows: DBRowWithID[] = store.rows.map(r => {
				const rowMap = new Map<string, unknown>();
				for (const [k, v] of Object.entries(r)) {
					rowMap.set(k, v);
				}
				return new DBRowWithID(rowMap, Number(r.id) || 0);
			});

			// Build RLS policies
			const policies: RLSPolicyData[] = store.policies.map(p => ({
				name: p.name,
				cmd: p.cmd,
				permissive: p.permissive,
				roles: p.roles,
				using: p.using ? JSON.parse(JSON.stringify(p.using)) : null,
				withCheck: p.withCheck ? JSON.parse(JSON.stringify(p.withCheck)) : null,
			}));

			// Build hooks
			const hooks: TableHook[] = store.hooks.map(h => ({
				name: h.name,
				table: h.table,
				event: h.event,
				timing: h.timing,
				language: h.language,
				body: h.body,
				enabled: h.enabled,
			}));

			const table = new DBTable(name, schema, store.autoIncrement, rows, {
				rlsEnabled: store.rlsEnabled,
				rlsForced: store.rlsForced,
				policies,
				hooks,
			});
			for (const row of table.rows) {
				row.updateT(table.schema);
			}
			this.wbwdbTables.set(name, table);
		}
		for (const name of this.wbwdbTables.keys()) {
			if (!sqlTables.includes(name)) {
				this.wbwdbTables.delete(name);
			}
		}
	}
}

export { Parser } from './parser.js';
export { SQLExecutor, TableStore } from './executor.js';
export type { SQLNode } from './ast.js';
