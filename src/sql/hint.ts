// ── SQL Hint Engine with AST-based Context Analysis ──────────────────────────────────────

import type { DBTable } from '../types.js';
import type {
	SQLNode, SelectStatement, InsertStatement, UpdateStatement, DeleteStatement,
	CreateTableStatement
} from './ast.js';
import { Parser } from './parser.js';

export interface HintSuggestion {
	text: string;
	type: 'keyword' | 'table' | 'column' | 'function' | 'operator' | 'datatype' | 'alias' | 'param' | 'role';
	description: string;
}

export interface HintContext {
	type: 'keyword' | 'table' | 'column' | 'function' | 'function_param' | 'datatype' | 'alias';
	partial: string;
	table?: string;
	functionName?: string | null;
	tokens: string[];
	astNode?: SQLNode | null;
	cursorInNode?: string;
}

// SQL Keywords with context
const SQL_KEYWORDS: string[] = [
	'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
	'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT',
	'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS',
	'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
	'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
	'ASC', 'DESC', 'TRUE', 'FALSE', 'PRIMARY', 'KEY', 'DEFAULT',
	'UNIQUE', 'IF', 'EXISTS', 'FULL', 'CROSS', 'LATERAL',
	'ALL', 'ANY', 'SOME', 'UNION', 'INTERSECT', 'EXCEPT',
	'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'TRANSACTION',
	'WITH', 'RECURSIVE', 'RETURNING',
	'POLICY', 'PERMISSIVE', 'RESTRICTIVE', 'FOR',
	'USING', 'CHECK', 'ENABLE', 'DISABLE', 'FORCE', 'ROW', 'LEVEL', 'SECURITY',
	'SET', 'SESSION', 'AUTHORIZATION', 'ROLE',
	'SHARE', 'DO', 'ONLY', 'NATURAL',
	'TRUNCATE', 'CASCADE', 'COLUMN',
	'ADD', 'TYPE', 'SHOW', 'HOOKS',
];

// Next keyword suggestions based on context
interface NextKeywordsMap {
	[key: string]: string[];
}

const NEXT_KEYWORDS: NextKeywordsMap = {
	'SELECT': ['DISTINCT', '*', 'column', 'function', 'ALL'],
	'FROM': ['table', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'LATERAL', 'WHERE', 'GROUP', 'ORDER', 'LIMIT'],
	'WHERE': ['column', 'function', 'NOT', 'EXISTS', '('],
	'JOIN': ['table', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL'],
	'ON': ['column', 'table.column'],
	'AND': ['column', 'function', 'NOT', 'EXISTS', '('],
	'OR': ['column', 'function', 'NOT', 'EXISTS', '('],
	'SET': ['column'],
	'ORDER': ['BY'],
	'GROUP': ['BY'],
	'HAVING': ['column', 'function', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'],
	'LIMIT': ['number'],
	'OFFSET': ['number'],
	'AS': ['alias'],
	'INSERT': ['INTO'],
	'INTO': ['table', '('],
	'VALUES': ['('],
	'UPDATE': ['table'],
	'DELETE': ['FROM'],
	'CREATE': ['TABLE', 'INDEX', 'POLICY', 'HOOK'],
	'DROP': ['TABLE', 'INDEX', 'POLICY', 'HOOK'],
	'ALTER': ['TABLE', 'COLUMN'],
	'TABLE': ['IF', 'table'],
	'INDEX': ['IF', 'UNIQUE', 'index_name'],
	'BEGIN': ['TRANSACTION', 'WORK'],
	'COMMIT': ['TRANSACTION', 'WORK'],
	'ROLLBACK': ['TRANSACTION', 'WORK', 'TO'],
	'WITH': ['RECURSIVE', 'cte_name'],
	'UNION': ['ALL', 'SELECT'],
	'INTERSECT': ['SELECT'],
	'EXCEPT': ['SELECT'],
	'RETURNING': ['*', 'column', 'DISTINCT'],
	'GRANT': ['permission', 'ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'],
	'REVOKE': ['permission', 'ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'],
	'TO': ['role', 'PUBLIC'],
	'POLICY': ['policy_name'],
	'HOOK': ['hook_name'],
	'ENABLE': ['ROW', 'FORCE'],
	'DISABLE': ['ROW', 'FORCE'],
	'FORCE': ['ROW'],
	'SHOW': ['variable', 'TABLES', 'COLUMNS', 'INDEXES', 'HOOKS'],
};

// SQL Functions with signatures and parameter hints
interface SQLFunction {
	name: string;
	signature: string;
	params: string[];
	description: string;
	returnHint: string;
}

const SQL_FUNCTIONS: SQLFunction[] = [
	// Aggregate functions
	{ name: 'COUNT', signature: 'COUNT(expr)', params: ['expr'], description: 'Count rows', returnHint: 'INTEGER' },
	{ name: 'SUM', signature: 'SUM(expr)', params: ['expr'], description: 'Sum values', returnHint: 'NUMERIC' },
	{ name: 'AVG', signature: 'AVG(expr)', params: ['expr'], description: 'Average values', returnHint: 'NUMERIC' },
	{ name: 'MIN', signature: 'MIN(expr)', params: ['expr'], description: 'Minimum value', returnHint: 'same as input' },
	{ name: 'MAX', signature: 'MAX(expr)', params: ['expr'], description: 'Maximum value', returnHint: 'same as input' },

	// String functions
	{ name: 'UPPER', signature: 'UPPER(str)', params: ['str'], description: 'Convert to uppercase', returnHint: 'TEXT' },
	{ name: 'LOWER', signature: 'LOWER(str)', params: ['str'], description: 'Convert to lowercase', returnHint: 'TEXT' },
	{ name: 'TRIM', signature: 'TRIM(str)', params: ['str'], description: 'Remove whitespace', returnHint: 'TEXT' },
	{ name: 'LTRIM', signature: 'LTRIM(str)', params: ['str'], description: 'Remove leading whitespace', returnHint: 'TEXT' },
	{ name: 'RTRIM', signature: 'RTRIM(str)', params: ['str'], description: 'Remove trailing whitespace', returnHint: 'TEXT' },
	{ name: 'LENGTH', signature: 'LENGTH(str)', params: ['str'], description: 'String length', returnHint: 'INTEGER' },
	{ name: 'CHAR_LENGTH', signature: 'CHAR_LENGTH(str)', params: ['str'], description: 'Character length', returnHint: 'INTEGER' },
	{ name: 'SUBSTRING', signature: 'SUBSTRING(str, start, len)', params: ['str', 'start', 'len'], description: 'Extract substring', returnHint: 'TEXT' },
	{ name: 'SUBSTR', signature: 'SUBSTR(str, start, len)', params: ['str', 'start', 'len'], description: 'Extract substring', returnHint: 'TEXT' },
	{ name: 'REPLACE', signature: 'REPLACE(str, from, to)', params: ['str', 'from', 'to'], description: 'Replace substring', returnHint: 'TEXT' },
	{ name: 'CONCAT', signature: 'CONCAT(str1, str2, ...)', params: ['str1', 'str2', '...'], description: 'Concatenate strings', returnHint: 'TEXT' },
	{ name: 'POSITION', signature: 'POSITION(substr IN str)', params: ['substr', 'str'], description: 'Find position of substring', returnHint: 'INTEGER' },
	{ name: 'INITCAP', signature: 'INITCAP(str)', params: ['str'], description: 'Capitalize first letter', returnHint: 'TEXT' },

	// Math functions
	{ name: 'ABS', signature: 'ABS(num)', params: ['num'], description: 'Absolute value', returnHint: 'same as input' },
	{ name: 'CEIL', signature: 'CEIL(num)', params: ['num'], description: 'Round up', returnHint: 'INTEGER' },
	{ name: 'FLOOR', signature: 'FLOOR(num)', params: ['num'], description: 'Round down', returnHint: 'INTEGER' },
	{ name: 'ROUND', signature: 'ROUND(num, decimals)', params: ['num', 'decimals'], description: 'Round number', returnHint: 'NUMERIC' },
	{ name: 'TRUNC', signature: 'TRUNC(num, decimals)', params: ['num', 'decimals'], description: 'Truncate number', returnHint: 'NUMERIC' },
	{ name: 'MOD', signature: 'MOD(a, b)', params: ['a', 'b'], description: 'Modulo', returnHint: 'NUMERIC' },
	{ name: 'POWER', signature: 'POWER(base, exp)', params: ['base', 'exp'], description: 'Power', returnHint: 'NUMERIC' },
	{ name: 'SQRT', signature: 'SQRT(num)', params: ['num'], description: 'Square root', returnHint: 'NUMERIC' },
	{ name: 'LN', signature: 'LN(num)', params: ['num'], description: 'Natural logarithm', returnHint: 'NUMERIC' },
	{ name: 'LOG', signature: 'LOG(num)', params: ['num'], description: 'Base 10 logarithm', returnHint: 'NUMERIC' },
	{ name: 'EXP', signature: 'EXP(num)', params: ['num'], description: 'Exponential', returnHint: 'NUMERIC' },
	{ name: 'SIGN', signature: 'SIGN(num)', params: ['num'], description: 'Sign of number', returnHint: 'INTEGER' },
	{ name: 'GREATEST', signature: 'GREATEST(num1, num2, ...)', params: ['num1', 'num2', '...'], description: 'Maximum value', returnHint: 'same as input' },
	{ name: 'LEAST', signature: 'LEAST(num1, num2, ...)', params: ['num1', 'num2', '...'], description: 'Minimum value', returnHint: 'same as input' },
	{ name: 'RANDOM', signature: 'RANDOM()', params: [], description: 'Random number 0-1', returnHint: 'FLOAT' },

	// Date/Time functions
	{ name: 'NOW', signature: 'NOW()', params: [], description: 'Current timestamp', returnHint: 'TIMESTAMP' },
	{ name: 'CURRENT_TIMESTAMP', signature: 'CURRENT_TIMESTAMP()', params: [], description: 'Current timestamp', returnHint: 'TIMESTAMP' },
	{ name: 'CURRENT_DATE', signature: 'CURRENT_DATE()', params: [], description: 'Current date', returnHint: 'DATE' },
	{ name: 'CURRENT_TIME', signature: 'CURRENT_TIME()', params: [], description: 'Current time', returnHint: 'TIME' },
	{ name: 'EXTRACT', signature: 'EXTRACT(part FROM date)', params: ['part', 'date'], description: 'Extract date part (YEAR, MONTH, DAY, HOUR, MINUTE, SECOND)', returnHint: 'INTEGER' },
	{ name: 'DATE_TRUNC', signature: 'DATE_TRUNC(precision, timestamp)', params: ['precision', 'timestamp'], description: 'Truncate timestamp', returnHint: 'TIMESTAMP' },
	{ name: 'AGE', signature: 'AGE(timestamp1, timestamp2)', params: ['timestamp1', 'timestamp2'], description: 'Age between timestamps', returnHint: 'INTERVAL' },
	{ name: 'EXTRACT_EPOCH', signature: 'EXTRACT(EPOCH FROM timestamp)', params: ['timestamp'], description: 'Unix timestamp', returnHint: 'INTEGER' },

	// Type conversion
	{ name: 'CAST', signature: 'CAST(expr AS type)', params: ['expr', 'type'], description: 'Type cast (INTEGER, TEXT, NUMERIC, BOOLEAN, DATE, TIMESTAMP)', returnHint: 'specified type' },
	{ name: 'CONVERT', signature: 'CONVERT(expr, type)', params: ['expr', 'type'], description: 'Type conversion', returnHint: 'specified type' },

	// Null handling
	{ name: 'COALESCE', signature: 'COALESCE(val1, val2, ...)', params: ['val1', 'val2', '...'], description: 'First non-null value', returnHint: 'same as first non-null' },
	{ name: 'NULLIF', signature: 'NULLIF(val1, val2)', params: ['val1', 'val2'], description: 'NULL if equal', returnHint: 'same as val1' },
	{ name: 'GREATEST_NULL', signature: 'GREATEST_NULL(val1, val2, ...)', params: ['val1', 'val2', '...'], description: 'Maximum non-null value', returnHint: 'same as input' },

	// Authentication functions
	{ name: 'AUTH_USER_ID', signature: 'AUTH_USER_ID()', params: [], description: 'Current user ID', returnHint: 'UUID' },
	{ name: 'AUTH_USERNAME', signature: 'AUTH_USERNAME()', params: [], description: 'Current username', returnHint: 'TEXT' },
	{ name: 'AUTH_ROLES', signature: 'AUTH_ROLES()', params: [], description: 'Current user roles', returnHint: 'TEXT[]' },
	{ name: 'AUTH_PERMISSIONS', signature: 'AUTH_PERMISSIONS()', params: [], description: 'Current user permissions', returnHint: 'TEXT[]' },
	{ name: 'IS_AUTHENTICATED', signature: 'IS_AUTHENTICATED()', params: [], description: 'Check if authenticated', returnHint: 'BOOLEAN' },

	// JSON functions
	{ name: 'JSONB_BUILD_OBJECT', signature: 'JSONB_BUILD_OBJECT(key1, val1, ...)', params: ['key1', 'val1', '...'], description: 'Build JSON object', returnHint: 'JSONB' },
	{ name: 'JSONB_BUILD_ARRAY', signature: 'JSONB_BUILD_ARRAY(val1, val2, ...)', params: ['val1', 'val2', '...'], description: 'Build JSON array', returnHint: 'JSONB' },
	{ name: 'JSONB_EXTRACT_PATH', signature: 'JSONB_EXTRACT_PATH(json, path)', params: ['json', 'path'], description: 'Extract JSON path', returnHint: 'JSONB' },
	{ name: 'JSONB_EXTRACT_PATH_TEXT', signature: 'JSONB_EXTRACT_PATH_TEXT(json, path)', params: ['json', 'path'], description: 'Extract JSON path as text', returnHint: 'TEXT' },
	{ name: 'JSONB_SET', signature: 'JSONB_SET(json, path, new_value)', params: ['json', 'path', 'new_value'], description: 'Set JSON path value', returnHint: 'JSONB' },
	{ name: 'JSONB_TYPEOF', signature: 'JSONB_TYPEOF(json)', params: ['json'], description: 'Get JSON type', returnHint: 'TEXT' },
	{ name: 'JSONB_ARRAY_LENGTH', signature: 'JSONB_ARRAY_LENGTH(json)', params: ['json'], description: 'JSON array length', returnHint: 'INTEGER' },
	{ name: 'TO_JSONB', signature: 'TO_JSONB(value)', params: ['value'], description: 'Convert to JSONB', returnHint: 'JSONB' },
	{ name: 'TO_JSON', signature: 'TO_JSON(value)', params: ['value'], description: 'Convert to JSON', returnHint: 'JSON' },

	// Array functions
	{ name: 'ARRAY_LENGTH', signature: 'ARRAY_LENGTH(array)', params: ['array'], description: 'Array length', returnHint: 'INTEGER' },
	{ name: 'ARRAY_APPEND', signature: 'ARRAY_APPEND(array, value)', params: ['array', 'value'], description: 'Append to array', returnHint: 'same as input' },
	{ name: 'ARRAY_CAT', signature: 'ARRAY_CAT(arr1, arr2)', params: ['arr1', 'arr2'], description: 'Concatenate arrays', returnHint: 'same as input' },
	{ name: 'ARRAY_REMOVE', signature: 'ARRAY_REMOVE(array, value)', params: ['array', 'value'], description: 'Remove from array', returnHint: 'same as input' },
	{ name: 'ARRAY_POSITION', signature: 'ARRAY_POSITION(array, value)', params: ['array', 'value'], description: 'Position of value in array', returnHint: 'INTEGER' },

	// Series generation
	{ name: 'GENERATE_SERIES', signature: 'GENERATE_SERIES(start, end, step)', params: ['start', 'end', 'step'], description: 'Generate number series', returnHint: 'set of INTEGER' },

	// Window functions
	{ name: 'ROW_NUMBER', signature: 'ROW_NUMBER() OVER (...)', params: [], description: 'Row number', returnHint: 'INTEGER' },
	{ name: 'RANK', signature: 'RANK() OVER (...)', params: [], description: 'Rank', returnHint: 'INTEGER' },
	{ name: 'DENSE_RANK', signature: 'DENSE_RANK() OVER (...)', params: [], description: 'Dense rank', returnHint: 'INTEGER' },
	{ name: 'LAG', signature: 'LAG(expr, offset) OVER (...)', params: ['expr', 'offset'], description: 'Previous row value', returnHint: 'same as expr' },
	{ name: 'LEAD', signature: 'LEAD(expr, offset) OVER (...)', params: ['expr', 'offset'], description: 'Next row value', returnHint: 'same as expr' },
	{ name: 'FIRST_VALUE', signature: 'FIRST_VALUE(expr) OVER (...)', params: ['expr'], description: 'First value in window', returnHint: 'same as expr' },
	{ name: 'LAST_VALUE', signature: 'LAST_VALUE(expr) OVER (...)', params: ['expr'], description: 'Last value in window', returnHint: 'same as expr' },
	{ name: 'NTH_VALUE', signature: 'NTH_VALUE(expr, n) OVER (...)', params: ['expr', 'n'], description: 'Nth value in window', returnHint: 'same as expr' },

	// Conditional
	{ name: 'CASE', signature: 'CASE WHEN condition THEN result ... END', params: [], description: 'Conditional expression', returnHint: 'result type' },
	{ name: 'GREATEST', signature: 'GREATEST(val1, val2, ...)', params: ['val1', 'val2', '...'], description: 'Maximum value', returnHint: 'same as input' },
	{ name: 'LEAST', signature: 'LEAST(val1, val2, ...)', params: ['val1', 'val2', '...'], description: 'Minimum value', returnHint: 'same as input' },
];

// Data types for CREATE TABLE
interface DataType {
	name: string;
	aliases: string[];
	description: string;
}

const DATA_TYPES: DataType[] = [
	{ name: 'INTEGER', aliases: ['INT', 'INT4'], description: '32-bit integer' },
	{ name: 'SMALLINT', aliases: ['INT2'], description: '16-bit integer' },
	{ name: 'BIGINT', aliases: ['INT8'], description: '64-bit integer' },
	{ name: 'REAL', aliases: ['FLOAT4'], description: '32-bit float' },
	{ name: 'DOUBLE PRECISION', aliases: ['FLOAT8'], description: '64-bit float' },
	{ name: 'NUMERIC', aliases: ['DECIMAL'], description: 'Exact decimal' },
	{ name: 'BOOLEAN', aliases: ['BOOL'], description: 'True/false' },
	{ name: 'TEXT', aliases: [], description: 'Variable-length text' },
	{ name: 'VARCHAR', aliases: ['CHARACTER VARYING'], description: 'Variable-length text with limit' },
	{ name: 'DATE', aliases: [], description: 'Date only' },
	{ name: 'TIMESTAMP', aliases: [], description: 'Date and time' },
	{ name: 'TIMESTAMPTZ', aliases: [], description: 'Date and time with timezone' },
	{ name: 'TIME', aliases: [], description: 'Time only' },
	{ name: 'JSON', aliases: [], description: 'JSON text' },
	{ name: 'JSONB', aliases: [], description: 'Binary JSON (indexed)' },
	{ name: 'UUID', aliases: [], description: 'UUID' },
	{ name: 'BYTEA', aliases: [], description: 'Binary data' },
	{ name: 'ARRAY', aliases: [], description: 'Array (e.g., INTEGER[], TEXT[])' },
];

// Operators
const OPERATORS: string[] = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IN', 'NOT IN', 'IS', 'IS NOT', 'BETWEEN', 'EXISTS'];

// Join types
const JOIN_TYPES: string[] = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL'];

// Order direction
const ORDER_DIRECTION: string[] = ['ASC', 'DESC'];

// Column type info
interface ColumnTypeInfo {
	type: string;
	nullable: boolean;
	default: unknown;
}

export class SQLHintEngine {
	private keywords: string[];
	private functions: SQLFunction[];
	private dataTypes: DataType[];
	private tableNames: string[];
	private tableColumns: Map<string, string[]>;
	private tableColumnTypes: Map<string, Map<string, ColumnTypeInfo>>;

	constructor(db: { dbTables: Map<string, DBTable> }) {
		this.keywords = SQL_KEYWORDS;
		this.functions = SQL_FUNCTIONS;
		this.dataTypes = DATA_TYPES;
		this.tableNames = [...db.dbTables.keys()];
		this.tableColumns = new Map();
		this.tableColumnTypes = new Map();

		// Cache table columns and their types
		for (const [name, table] of db.dbTables) {
			this.tableColumns.set(name, [...table.schema.map.keys()]);
			const colTypes = new Map<string, ColumnTypeInfo>();
			for (const [col, typeDef] of table.schema.map.entries()) {
				colTypes.set(col, {
					type: typeDef.t.name,
					nullable: typeDef.nullable,
					default: typeDef.defaultVal,
				});
			}
			this.tableColumnTypes.set(name, colTypes);
		}
	}

	/**
	 * Get suggestions based on AST analysis
	 * @param input - The SQL input string
	 * @param cursorPos - The cursor position in the input string
	 */
	getSuggestions(input: string, cursorPos: number): HintSuggestion[] {
		// Try to parse the SQL and use AST for context-aware hints
		let astContext: { node: SQLNode | null; cursorInNode: string } | null = null;

		try {
			// Parse partial SQL up to cursor position
			const partialSql = input.substring(0, cursorPos);
			if (partialSql.trim().length > 0) {
				const parser = new Parser(partialSql);
				const ast = parser.parse();
				astContext = this.analyzeASTForCursor(ast, input, cursorPos);
			}
		} catch (e) {
			// If parsing fails, fall back to token-based analysis
			// This is expected for incomplete SQL
		}

		// Get context using both token-based and AST-based analysis
		const context = this.analyzeContext(input, cursorPos, astContext?.node || null);
		const suggestions = this.getSuggestionsForContext(context);

		// Add next keyword suggestions if applicable
		if (context.type === 'keyword' && context.partial === '') {
			const lastKeyword = this.getLastKeyword(context.tokens);
			if (lastKeyword && NEXT_KEYWORDS[lastKeyword]) {
				const nextKwSuggestions = this.getNextKeywordSuggestions(lastKeyword, context.tokens);
				return [...suggestions, ...nextKwSuggestions].slice(0, 25);
			}
		}

		return suggestions.slice(0, 25);
	}

	/**
	 * Analyze AST to determine cursor context
	 * Returns information about which AST node the cursor is currently in
	 */
	private analyzeASTForCursor(ast: SQLNode, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		switch (ast.type) {
			case 'SELECT':
				return this.analyzeSelectCursor(ast, input, cursorPos);
			case 'INSERT':
				return this.analyzeInsertCursor(ast, input, cursorPos);
			case 'UPDATE':
				return this.analyzeUpdateCursor(ast, input, cursorPos);
			case 'DELETE':
				return this.analyzeDeleteCursor(ast, input, cursorPos);
			case 'CREATE_TABLE':
				return this.analyzeCreateTableCursor(ast, input, cursorPos);
			default:
				return { node: ast, cursorInNode: 'unknown' };
		}
	}

	/**
	 * Analyze cursor position within a SELECT statement
	 */
	private analyzeSelectCursor(ast: SelectStatement, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		const beforeCursor = input.substring(0, cursorPos);

		// Check if we're in the column list
		if (beforeCursor.includes('SELECT') && !beforeCursor.includes('FROM')) {
			return { node: ast, cursorInNode: 'columns' };
		}

		// Check if we're in the FROM clause
		if (beforeCursor.includes('FROM') && !beforeCursor.includes('WHERE') && !beforeCursor.includes('JOIN')) {
			return { node: ast, cursorInNode: 'from' };
		}

		// Check if we're in a JOIN
		if (beforeCursor.includes('JOIN') && !beforeCursor.includes('ON')) {
			return { node: ast, cursorInNode: 'join_table' };
		}

		if (beforeCursor.includes('ON')) {
			return { node: ast, cursorInNode: 'join_condition' };
		}

		// Check if we're in WHERE
		if (beforeCursor.includes('WHERE') && !beforeCursor.includes('GROUP')) {
			return { node: ast, cursorInNode: 'where' };
		}

		// Check if we're in GROUP BY
		if (beforeCursor.includes('GROUP')) {
			return { node: ast, cursorInNode: 'group_by' };
		}

		// Check if we're in HAVING
		if (beforeCursor.includes('HAVING')) {
			return { node: ast, cursorInNode: 'having' };
		}

		// Check if we're in ORDER BY
		if (beforeCursor.includes('ORDER')) {
			return { node: ast, cursorInNode: 'order_by' };
		}

		// Check if we're in LIMIT/OFFSET
		if (beforeCursor.includes('LIMIT')) {
			return { node: ast, cursorInNode: 'limit' };
		}

		if (beforeCursor.includes('OFFSET')) {
			return { node: ast, cursorInNode: 'offset' };
		}

		return { node: ast, cursorInNode: 'unknown' };
	}

	/**
	 * Analyze cursor position within an INSERT statement
	 */
	private analyzeInsertCursor(ast: InsertStatement, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		const beforeCursor = input.substring(0, cursorPos);

		if (beforeCursor.includes('INTO') && !beforeCursor.includes('VALUES') && !beforeCursor.includes('SELECT')) {
			return { node: ast, cursorInNode: 'columns' };
		}

		if (beforeCursor.includes('VALUES')) {
			return { node: ast, cursorInNode: 'values' };
		}

		if (beforeCursor.includes('SELECT')) {
			return { node: ast, cursorInNode: 'select' };
		}

		return { node: ast, cursorInNode: 'unknown' };
	}

	/**
	 * Analyze cursor position within an UPDATE statement
	 */
	private analyzeUpdateCursor(ast: UpdateStatement, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		const beforeCursor = input.substring(0, cursorPos);

		if (beforeCursor.includes('SET') && !beforeCursor.includes('WHERE')) {
			return { node: ast, cursorInNode: 'set_columns' };
		}

		if (beforeCursor.includes('WHERE')) {
			return { node: ast, cursorInNode: 'where' };
		}

		return { node: ast, cursorInNode: 'unknown' };
	}

	/**
	 * Analyze cursor position within a DELETE statement
	 */
	private analyzeDeleteCursor(ast: DeleteStatement, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		const beforeCursor = input.substring(0, cursorPos);

		if (beforeCursor.includes('FROM') && !beforeCursor.includes('WHERE')) {
			return { node: ast, cursorInNode: 'where' };
		}

		if (beforeCursor.includes('WHERE')) {
			return { node: ast, cursorInNode: 'where' };
		}

		return { node: ast, cursorInNode: 'unknown' };
	}

	/**
	 * Analyze cursor position within a CREATE TABLE statement
	 */
	private analyzeCreateTableCursor(ast: CreateTableStatement, input: string, cursorPos: number): { node: SQLNode | null; cursorInNode: string } {
		const beforeCursor = input.substring(0, cursorPos);

		if (beforeCursor.includes('(') && !beforeCursor.includes(')')) {
			return { node: ast, cursorInNode: 'column_def' };
		}

		return { node: ast, cursorInNode: 'unknown' };
	}

	// Get last keyword in tokens
	getLastKeyword(tokens: string[]): string | null {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const upper = tokens[i].toUpperCase();
			if (this.keywords.includes(upper)) {
				return upper;
			}
		}
		return null;
	}

	// Get next keyword suggestions based on context
	getNextKeywordSuggestions(lastKeyword: string, tokens: string[]): HintSuggestion[] {
		const nextKeywords = NEXT_KEYWORDS[lastKeyword] || [];
		const suggestions: HintSuggestion[] = [];

		for (const kw of nextKeywords) {
			if (kw === 'table') {
				// Suggest table names
				for (const name of this.tableNames) {
					suggestions.push({
						text: name,
						type: 'table',
						description: `Table (${this.tableColumns.get(name)?.length || 0} columns)`,
					});
				}
			} else if (kw === 'column') {
				// Suggest columns from the current table context
				const tableName = this.getTableContext(tokens);
				if (tableName && this.tableColumns.has(tableName)) {
					for (const col of this.tableColumns.get(tableName)!) {
						const colType = this.tableColumnTypes.get(tableName)?.get(col);
						suggestions.push({
							text: col,
							type: 'column',
							description: `${colType?.type || 'unknown'}${colType?.nullable ? ' (nullable)' : ''}`,
						});
					}
				} else {
					// Suggest all columns from all tables
					for (const [tableName, cols] of this.tableColumns) {
						for (const col of cols) {
							suggestions.push({
								text: `${tableName}.${col}`,
								type: 'column',
								description: `Column in ${tableName}`,
							});
						}
					}
				}
			} else if (kw === 'function') {
				// Suggest all functions
				for (const fn of this.functions) {
					suggestions.push({
						text: fn.name,
						type: 'function',
						description: `${fn.signature} → ${fn.returnHint}`,
					});
				}
			} else if (kw === 'permission') {
				// Suggest permissions
				const perms = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'];
				for (const perm of perms) {
					suggestions.push({
						text: perm,
						type: 'keyword',
						description: 'Permission',
					});
				}
			} else if (kw === 'role') {
				// Suggest roles from database
				// For now, suggest common roles
				const roles = ['public', 'admin', 'user', 'readonly'];
				for (const role of roles) {
					suggestions.push({
						text: role,
						type: 'role',
						description: 'Role',
					});
				}
			} else if (NEXT_KEYWORDS[kw]) {
				// It's another keyword, add it
				suggestions.push({
					text: kw,
					type: 'keyword',
					description: 'SQL keyword',
				});
			} else {
				// It's a keyword
				suggestions.push({
					text: kw,
					type: 'keyword',
					description: 'SQL keyword',
				});
			}
		}

		return suggestions;
	}

	// Get table context from tokens
	getTableContext(tokens: string[]): string | null {
		const upperTokens = tokens.map(t => t.toUpperCase());

		// Check for FROM table or JOIN table
		for (let i = 0; i < upperTokens.length; i++) {
			if ((upperTokens[i] === 'FROM' || upperTokens[i] === 'JOIN') && i + 1 < tokens.length) {
				const nextToken = tokens[i + 1];
				if (!this.keywords.includes(nextToken.toUpperCase()) && this.tableNames.includes(nextToken)) {
					return nextToken;
				}
			}
		}

		return null;
	}

	// Analyze input context to determine what to suggest
	analyzeContext(input: string, cursorPos: number, astNode: SQLNode | null = null, astContext?: { node: SQLNode | null; cursorInNode: string } | null): HintContext {
		const beforeCursor = input.substring(0, cursorPos);
		const tokens = this.tokenizePartial(beforeCursor);

		// Empty input or just started
		if (tokens.length === 0) {
			return { type: 'keyword', partial: '', tokens: [], astNode };
		}

		const lastToken = tokens[tokens.length - 1];
		const upperTokens = tokens.map(t => t.toUpperCase());

		// Use AST-based context if available
		if (astNode && astContext) {
			return this.getHintsFromAST(astNode, lastToken, tokens, astContext.cursorInNode);
		}
		if (astNode) {
			return this.getHintsFromAST(astNode, lastToken, tokens);
		}

		// Check if we're in a function (inside parentheses)
		const inFunction = this.isInsideFunction(tokens);
		if (inFunction) {
			return { type: 'function_param', partial: lastToken, tokens, functionName: inFunction };
		}

		// Check if we're after a dot (table.column)
		if (tokens.length >= 2 && tokens[tokens.length - 2] === '.') {
			const tableRef = tokens[tokens.length - 3];
			if (tableRef && this.tableColumns.has(tableRef)) {
				return { type: 'column', partial: lastToken, table: tableRef, tokens };
			}
		}

		// After FROM - suggest table names
		if (upperTokens.includes('FROM') && !upperTokens.includes('WHERE')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper) && !this.functions.some(f => f.name === lastUpper)) {
				return { type: 'table', partial: lastToken, tokens };
			}
		}

		// After JOIN - suggest table names
		if (upperTokens.includes('JOIN') && !upperTokens.includes('ON')) {
			const lastUpper = lastToken.toUpperCase();
			if (!JOIN_TYPES.includes(lastUpper)) {
				return { type: 'table', partial: lastToken, tokens };
			}
		}

		// After SELECT - suggest columns and functions
		if (upperTokens.includes('SELECT') && !upperTokens.includes('FROM')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				// Check if we're after a table name (for table.column suggestion)
				const fromIdx = upperTokens.indexOf('FROM');
				if (fromIdx !== -1 && fromIdx < tokens.length - 1) {
					const tableName = tokens[fromIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
				return { type: 'function', partial: lastToken, tokens };
			}
		}

		// After table name in FROM - suggest columns
		if (upperTokens.length >= 2 && upperTokens[upperTokens.length - 2] === 'FROM') {
			const tableName = tokens[tokens.length - 2];
			if (this.tableColumns.has(tableName)) {
				return { type: 'column', partial: lastToken, table: tableName, tokens };
			}
		}

		// After SET - suggest columns
		if (upperTokens.includes('SET') && !upperTokens.includes('WHERE')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				// Get table from UPDATE
				const updateIdx = upperTokens.indexOf('UPDATE');
				if (updateIdx !== -1 && updateIdx < tokens.length - 1) {
					const tableName = tokens[updateIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
			}
		}

		// After WHERE - suggest columns and operators
		if (upperTokens.includes('WHERE')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				// Get table from FROM or JOIN
				const fromIdx = upperTokens.indexOf('FROM');
				const joinIdx = upperTokens.indexOf('JOIN');
				const tableIdx = Math.max(fromIdx, joinIdx);
				if (tableIdx !== -1 && tableIdx < tokens.length - 1) {
					const tableName = tokens[tableIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
			}
		}

		// After CREATE TABLE - suggest data types
		if (upperTokens.includes('CREATE') && upperTokens.includes('TABLE')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				return { type: 'datatype', partial: lastToken, tokens };
			}
		}

		// After ORDER BY - suggest columns
		if (upperTokens.includes('ORDER') && upperTokens.includes('BY')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper) && !ORDER_DIRECTION.includes(lastUpper)) {
				const fromIdx = upperTokens.indexOf('FROM');
				if (fromIdx !== -1 && fromIdx < tokens.length - 1) {
					const tableName = tokens[fromIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
			}
		}

		// After GROUP BY - suggest columns
		if (upperTokens.includes('GROUP') && upperTokens.includes('BY')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				const fromIdx = upperTokens.indexOf('FROM');
				if (fromIdx !== -1 && fromIdx < tokens.length - 1) {
					const tableName = tokens[fromIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
			}
		}

		// After HAVING - suggest aggregate functions
		if (upperTokens.includes('HAVING')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				return { type: 'function', partial: lastToken, tokens };
			}
		}

		// After ON - suggest columns
		if (upperTokens.includes('ON') && upperTokens.includes('JOIN')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				const fromIdx = upperTokens.indexOf('FROM');
				if (fromIdx !== -1 && fromIdx < tokens.length - 1) {
					const tableName = tokens[fromIdx + 1];
					if (this.tableColumns.has(tableName)) {
						return { type: 'column', partial: lastToken, table: tableName, tokens };
					}
				}
			}
		}

		// After AS - suggest alias
		if (upperTokens.includes('AS')) {
			const lastUpper = lastToken.toUpperCase();
			if (!this.keywords.includes(lastUpper)) {
				return { type: 'alias', partial: lastToken, tokens };
			}
		}

		// Default: suggest keywords or complete current token
		const lastUpper = lastToken.toUpperCase();
		if (this.keywords.includes(lastUpper)) {
			return { type: 'keyword', partial: '', tokens };
		}
		return { type: 'keyword', partial: lastToken, tokens };
	}

	/**
	 * Get hints from parsed AST node
	 * Uses detailed AST information to provide context-aware suggestions
	 */
	private getHintsFromAST(astNode: SQLNode, lastToken: string, tokens: string[], cursorInNode?: string): HintContext {
		switch (astNode.type) {
			case 'SELECT': {
				const select = astNode;

				// Use cursorInNode to determine exact position
				if (cursorInNode) {
					switch (cursorInNode) {
						case 'columns':
							// In SELECT column list - suggest columns from FROM/JOIN tables and functions
							return { type: 'column', partial: lastToken, tokens, astNode };
						case 'from':
							// In FROM clause - suggest table names
							return { type: 'table', partial: lastToken, tokens, astNode };
						case 'join_table':
							// After JOIN keyword - suggest table names
							return { type: 'table', partial: lastToken, tokens, astNode };
						case 'join_condition':
							// In ON clause - suggest columns from joined tables
							return { type: 'column', partial: lastToken, tokens, astNode };
						case 'where':
							// In WHERE clause - suggest columns and operators
							return { type: 'column', partial: lastToken, tokens, astNode };
						case 'group_by':
							// In GROUP BY - suggest columns
							return { type: 'column', partial: lastToken, tokens, astNode };
						case 'having':
							// In HAVING - suggest aggregate functions and columns
							return { type: 'function', partial: lastToken, tokens, astNode };
						case 'order_by':
							// In ORDER BY - suggest columns
							return { type: 'column', partial: lastToken, tokens, astNode };
						case 'limit':
						case 'offset':
							// Expecting number
							return { type: 'keyword', partial: lastToken, tokens, astNode };
					}
				}

				// Fallback: extract available columns from FROM and JOINs
				if (select.from?.table && this.tableColumns.has(select.from.table)) {
					return {
						type: 'column',
						partial: lastToken,
						table: select.from.table,
						tokens,
						astNode
					};
				}
				// If we're in SELECT columns area, suggest functions and columns
				return { type: 'function', partial: lastToken, tokens, astNode };
			}

			case 'INSERT': {
				const insert = astNode;

				if (cursorInNode) {
					switch (cursorInNode) {
						case 'columns':
							// In column list after INTO table (...)
							if (this.tableColumns.has(insert.table)) {
								return {
									type: 'column',
									partial: lastToken,
									table: insert.table,
									tokens,
									astNode
								};
							}
							break;
						case 'values':
							// In VALUES clause - suggest based on column types
							if (insert.columns.length > 0 && this.tableColumns.has(insert.table)) {
								return {
									type: 'column',
									partial: lastToken,
									table: insert.table,
									tokens,
									astNode
								};
							}
							break;
						case 'select':
							// In INSERT ... SELECT
							return { type: 'function', partial: lastToken, tokens, astNode };
					}
				}

				if (this.tableColumns.has(insert.table)) {
					return {
						type: 'column',
						partial: lastToken,
						table: insert.table,
						tokens,
						astNode
					};
				}
				return { type: 'keyword', partial: lastToken, tokens, astNode };
			}

			case 'UPDATE': {
				const update = astNode;

				if (cursorInNode) {
					switch (cursorInNode) {
						case 'set_columns':
							// In SET clause - suggest columns to update
							if (this.tableColumns.has(update.table)) {
								return {
									type: 'column',
									partial: lastToken,
									table: update.table,
									tokens,
									astNode
								};
							}
							break;
						case 'where':
							// In WHERE clause - suggest columns for filtering
							if (this.tableColumns.has(update.table)) {
								return {
									type: 'column',
									partial: lastToken,
									table: update.table,
									tokens,
									astNode
								};
							}
							break;
					}
				}

				if (this.tableColumns.has(update.table)) {
					return {
						type: 'column',
						partial: lastToken,
						table: update.table,
						tokens,
						astNode
					};
				}
				return { type: 'keyword', partial: lastToken, tokens, astNode };
			}

			case 'DELETE': {
				const del = astNode;

				if (cursorInNode) {
					switch (cursorInNode) {
						case 'where':
							// In WHERE clause - suggest columns for filtering
							if (this.tableColumns.has(del.table)) {
								return {
									type: 'column',
									partial: lastToken,
									table: del.table,
									tokens,
									astNode
								};
							}
							break;
					}
				}

				if (this.tableColumns.has(del.table)) {
					return {
						type: 'column',
						partial: lastToken,
						table: del.table,
						tokens,
						astNode
					};
				}
				return { type: 'keyword', partial: lastToken, tokens, astNode };
			}

			case 'CREATE_TABLE': {
				if (cursorInNode === 'column_def') {
					return { type: 'datatype', partial: lastToken, tokens, astNode };
				}
				return { type: 'datatype', partial: lastToken, tokens, astNode };
			}

			default:
				return { type: 'keyword', partial: lastToken, tokens, astNode };
		}
	}

	// Check if we're inside a function (after opening parenthesis)
	isInsideFunction(tokens: string[]): string | null {
		let depth = 0;
		let lastFunction: string | null = null;

		for (const token of tokens) {
			if (token === '(') {
				depth++;
			} else if (token === ')') {
				depth--;
				if (depth === 0) lastFunction = null;
			} else if (depth > 0 && !this.keywords.includes(token.toUpperCase())) {
				// We're inside parentheses
				if (token.endsWith('(')) {
					lastFunction = token.slice(0, -1);
				}
			}
		}

		return depth > 0 ? lastFunction : null;
	}

	// Get suggestions based on context
	getSuggestionsForContext(context: HintContext): HintSuggestion[] {
		const { type, partial, table, functionName, tokens } = context;
		const upperPartial = partial.toUpperCase();

		switch (type) {
			case 'keyword': {
				const suggestions = this.keywords
					.filter(kw => kw.startsWith(upperPartial))
					.map(kw => ({
						text: kw,
						type: 'keyword' as const,
						description: 'SQL keyword',
					}));

				// Add next keyword suggestions
				const lastKeyword = this.getLastKeyword(tokens);
				if (lastKeyword && NEXT_KEYWORDS[lastKeyword]) {
					const nextKwSuggestions = this.getNextKeywordSuggestions(lastKeyword, tokens);
					return [...suggestions, ...nextKwSuggestions].slice(0, 25);
				}

				return suggestions;
			}

			case 'table':
				return this.tableNames
					.filter(name => name.toUpperCase().startsWith(upperPartial))
					.map(name => ({
						text: name,
						type: 'table' as const,
						description: `Table (${this.tableColumns.get(name)?.length || 0} columns)`,
					}));

			case 'column':
				if (table && this.tableColumns.has(table)) {
					return this.tableColumns
						.get(table)!
						.filter(col => col.toUpperCase().startsWith(upperPartial))
						.map(col => {
							const colType = this.tableColumnTypes.get(table)?.get(col);
							return {
								text: col,
								type: 'column' as const,
								description: `${colType?.type || 'unknown'}${colType?.nullable ? ' (nullable)' : ''}`,
							};
						});
				}
				// If no table context, suggest from all tables
				return this.getAllColumns()
					.filter(item => item.col.toUpperCase().startsWith(upperPartial))
					.map(item => ({
						text: `${item.table}.${item.col}`,
						type: 'column' as const,
						description: `Column in ${item.table}`,
					}));

			case 'function': {
				const suggestions = this.functions
					.filter(fn => fn.name.startsWith(upperPartial))
					.map(fn => ({
						text: fn.name,
						type: 'function' as const,
						description: `${fn.signature} → ${fn.returnHint}`,
					}));

				// Also add operators
				const opSuggestions = OPERATORS
					.filter(op => op.toUpperCase().startsWith(upperPartial))
					.map(op => ({
						text: op,
						type: 'operator' as const,
						description: 'Operator',
					}));

				return [...suggestions, ...opSuggestions];
			}

			case 'function_param': {
				// Suggest function parameters
				const func = this.functions.find(f => f.name === functionName?.toUpperCase());
				if (func) {
					const paramIndex = this.getParamIndex(tokens);
					const param = func.params[paramIndex];
					if (param) {
						return [{
							text: `<${param}>`,
							type: 'param',
							description: `Parameter ${paramIndex + 1}/${func.params.length}: ${func.signature}`,
						}];
					}
				}
				// Fallback to columns and functions
				return this.getAllColumns()
					.filter(item => item.col.toUpperCase().startsWith(upperPartial))
					.map(item => ({
						text: item.col,
						type: 'column' as const,
						description: `Column in ${item.table}`,
					}));
			}

			case 'datatype':
				return this.dataTypes
					.filter(dt => dt.name.startsWith(upperPartial) || dt.aliases.some(a => a.startsWith(upperPartial)))
					.map(dt => ({
						text: dt.name,
						type: 'datatype' as const,
						description: dt.description,
					}));

			case 'alias':
				// Suggest common alias patterns
				return [{
					text: partial || 'alias',
					type: 'alias' as const,
					description: 'Alias name',
				}];

			default:
				return [];
		}
	}

	// Get parameter index inside function
	getParamIndex(tokens: string[]): number {
		let depth = 0;
		let commaCount = 0;

		for (const token of tokens) {
			if (token === '(') {
				depth++;
			} else if (token === ')') {
				depth--;
			} else if (depth === 1 && token === ',') {
				commaCount++;
			}
		}

		return commaCount;
	}

	// Get all columns from all tables
	getAllColumns(): { table: string; col: string }[] {
		const columns: { table: string; col: string }[] = [];
		for (const [tableName, cols] of this.tableColumns) {
			for (const col of cols) {
				columns.push({ table: tableName, col });
			}
		}
		return columns;
	}

	// Simple tokenizer for partial SQL
	tokenizePartial(input: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let inString = false;
		let stringChar: string | null = null;
		let inDollarString = false;

		for (let i = 0; i < input.length; i++) {
			const ch = input[i];

			if (inDollarString) {
				if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
					inDollarString = false;
					tokens.push('$$...$$');
					current = '';
					i++;
				} else {
					current += ch;
				}
				continue;
			}

			if (inString) {
				if (ch === stringChar) {
					inString = false;
				} else {
					current += ch;
				}
				continue;
			}

			if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
				inDollarString = true;
				i++;
				continue;
			}

			if (ch === "'" || ch === '"') {
				inString = true;
				stringChar = ch;
				continue;
			}

			if (ch === ' ' || ch === '\t' || ch === '\n') {
				if (current) {
					tokens.push(current);
					current = '';
				}
				continue;
			}

			if (ch === '(' || ch === ')' || ch === ',' || ch === ';' || ch === '.') {
				if (current) {
					tokens.push(current);
					current = '';
				}
				tokens.push(ch);
				continue;
			}

			// Handle multi-word keywords like "IS NOT", "NOT IN"
			if (ch === 'N' && i + 3 < input.length) {
				const next4 = input.substring(i, i + 4).toUpperCase();
				if (next4 === 'NOT ') {
					if (current) {
						tokens.push(current);
						current = '';
					}
					tokens.push('NOT');
					i += 3;
					continue;
				}
			}

			current += ch;
		}

		if (current) {
			tokens.push(current);
		}

		return tokens;
	}
}