import { Parser } from './parser.js';
import { SQLExecutor, type QueryResult, type Row } from './executor.js';
import { DBTable, DBSchema, DBFullType, DBRowWithID, dbtypes } from '../types.js';

export type { QueryResult, Row } from './executor.js';

export class WBWDBSQL {
	private executor: SQLExecutor;
	private wbwdbTables: Map<string, DBTable>;

	constructor(wbwdbTables: Map<string, DBTable>) {
		this.wbwdbTables = wbwdbTables;
		const initial = new Map<string, Row[]>();
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
		}
		this.executor = new SQLExecutor(initial);
	}

	execute(sql: string, params?: unknown[]): QueryResult {
		const trimmed = sql.trim();
		if (!trimmed) throw new Error('Empty SQL statement');

		const stmts = trimmed.split(/;(?=\s|$)/g).filter(s => s.trim());
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
		return lastResult!;
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

			const schemaMap = new Map<string, DBFullType<any>>();
			for (const [colName, colDef] of store.schema.entries()) {
				const dbType = dbtypes.get(colDef.name) ?? dbtypes.get('String')!;
				schemaMap.set(colName, new DBFullType(dbType, colDef.notNull, colDef.defaultValue ?? undefined));
			}
			const schema = new DBSchema(schemaMap);

			const rows: DBRowWithID[] = store.rows.map(r => {
				const rowMap = new Map<string, any>();
				for (const [k, v] of Object.entries(r)) {
					if (k === 'id') continue;
					rowMap.set(k, v);
				}
				return new DBRowWithID(rowMap, Number(r.id) || 0);
			});

			const table = new DBTable(name, schema, store.autoIncrement, rows);
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
