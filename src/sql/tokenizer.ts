// ── Token Types ────────────────────────────────────────

export type TokenType =
	| 'KEYWORD' | 'IDENT' | 'STRING' | 'NUMBER'
	| 'DOT' | 'COMMA' | 'LPAREN' | 'RPAREN'
	| 'STAR' | 'SEMICOLON' | 'EQ' | 'NEQ'
	| 'LT' | 'GT' | 'LTE' | 'GTE'
	| 'PLUS' | 'MINUS' | 'SLASH' | 'PERCENT'
	| 'BANG' | 'TILDE' | 'LT_GT'
	| 'COLON' | 'ARROW'
	| 'EOF';

export interface Token {
	type: TokenType;
	value: string;
	line: number;
	col: number;
}

const KEYWORDS = new Set([
	'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'TRUE', 'FALSE',
	'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP',
	'ALTER', 'INDEX', 'ON', 'PRIMARY', 'KEY', 'UNIQUE', 'IF', 'EXISTS',
	'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'LATERAL',
	'AS', 'DISTINCT', 'ALL', 'ANY', 'SOME',
	'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC',
	'NULLS', 'FIRST', 'LAST',
	'BETWEEN', 'LIKE', 'ILIKE',
	'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
	'UNION', 'INTERSECT', 'EXCEPT',
	'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'TRANSACTION',
	'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
	'WITH', 'RECURSIVE',
	'GRANT', 'REVOKE', 'TO',
	'ADD', 'COLUMN', 'TYPE',
	'TRUNCATE', 'CASCADE',
	'RETURNING',
	'CURRENT_TIMESTAMP', 'NOW',
	'POLICY', 'PERMISSIVE', 'RESTRICTIVE', 'FOR',
	'USING', 'CHECK',
	'ENABLE', 'DISABLE', 'FORCE', 'ROW', 'LEVEL', 'SECURITY',
	'SET', 'SESSION', 'AUTHORIZATION', 'ROLE',
	'SHARE', 'DO', 'DEFAULT', 'ONLY', 'NATURAL',
	'SERIAL', 'AUTO_INCREMENT',
]);

export class Tokenizer {
	private src: string;
	private pos = 0;
	private line = 1;
	private col = 1;

	constructor(src: string) {
		this.src = src;
	}

	tokenize(): Token[] {
		const tokens: Token[] = [];
		while (true) {
			const tok = this.nextToken();
			tokens.push(tok);
			if (tok.type === 'EOF') break;
		}
		return tokens;
	}

	private nextToken(): Token {
		this.skipWhitespace();
		if (this.pos >= this.src.length) return this.make('EOF', '');

		const ch = this.src[this.pos];
		const startLine = this.line;
		const startCol = this.col;

		// String literal
		if (ch === "'" || ch === '"') return this.readString(startLine, startCol);

		// Number
		if (this.isDigit(ch) || (ch === '.' && this.pos + 1 < this.src.length && this.isDigit(this.src[this.pos + 1]))) {
			return this.readNumber(startLine, startCol);
		}

		// Identifier or keyword
		if (this.isIdentStart(ch)) return this.readIdent(startLine, startCol);

		// Operators and punctuation
		this.advance();
		switch (ch) {
			case '(': return this.make('LPAREN', '(', startLine, startCol);
			case ')': return this.make('RPAREN', ')', startLine, startCol);
			case ',': return this.make('COMMA', ',', startLine, startCol);
			case ';': return this.make('SEMICOLON', ';', startLine, startCol);
			case '.': return this.make('DOT', '.', startLine, startCol);
			case '*': return this.make('STAR', '*', startLine, startCol);
			case '+': return this.make('PLUS', '+', startLine, startCol);
			case '$': return this.readParameter(startLine, startCol);
			case '-':
				if (this.peek() === '>') { this.advance(); return this.make('ARROW', '->', startLine, startCol); }
				return this.make('MINUS', '-', startLine, startCol);
			case '/': return this.make('SLASH', '/', startLine, startCol);
			case '%': return this.make('PERCENT', '%', startLine, startCol);
			case ':':
				if (this.peek() === ':') { this.advance(); return this.make('COLON', '::', startLine, startCol); }
				return this.make('COLON', ':', startLine, startCol);
			case '=': return this.make('EQ', '=', startLine, startCol);
			case '!':
				if (this.peek() === '=') { this.advance(); return this.make('NEQ', '!=', startLine, startCol); }
				return this.make('BANG', '!', startLine, startCol);
			case '<':
				if (this.peek() === '=') { this.advance(); return this.make('LTE', '<=', startLine, startCol); }
				if (this.peek() === '>') { this.advance(); return this.make('LT_GT', '<>', startLine, startCol); }
				return this.make('LT', '<', startLine, startCol);
			case '>':
				if (this.peek() === '=') { this.advance(); return this.make('GTE', '>=', startLine, startCol); }
				return this.make('GT', '>', startLine, startCol);
			case '~': return this.make('TILDE', '~', startLine, startCol);
			default: throw new Error(`Unexpected character '${ch}' at line ${startLine}, col ${startCol}`);
		}
	}

	private readString(line: number, col: number): Token {
		const quote = this.src[this.pos];
		this.advance();
		let val = '';
		while (this.pos < this.src.length && this.src[this.pos] !== quote) {
			if (this.src[this.pos] === '\\') {
				this.advance();
				if (this.pos < this.src.length) {
					val += this.src[this.pos];
					this.advance();
				}
			} else {
				val += this.src[this.pos];
				this.advance();
			}
		}
		if (this.pos >= this.src.length) {
			throw new Error(`Unterminated string at line ${line}, col ${col}`);
		}
		this.advance(); // closing quote
		return this.make('STRING', val, line, col);
	}

	private readNumber(line: number, col: number): Token {
		let val = '';
		while (this.pos < this.src.length && (this.isDigit(this.src[this.pos]) || this.src[this.pos] === '.')) {
			val += this.src[this.pos];
			this.advance();
		}
		return this.make('NUMBER', val, line, col);
	}

	private readParameter(line: number, col: number): Token {
		let val = '$';
		while (this.pos < this.src.length && this.isDigit(this.src[this.pos])) {
			val += this.src[this.pos];
			this.advance();
		}
		return this.make('IDENT', val, line, col);
	}

	private readIdent(line: number, col: number): Token {
		let val = '';
		while (this.pos < this.src.length && this.isIdentChar(this.src[this.pos])) {
			val += this.src[this.pos];
			this.advance();
		}
		const upper = val.toUpperCase();
		if (KEYWORDS.has(upper)) return this.make('KEYWORD', upper, line, col);
		return this.make('IDENT', val, line, col);
	}

	private skipWhitespace(): void {
		while (this.pos < this.src.length) {
			const ch = this.src[this.pos];
			if (ch === ' ' || ch === '\t' || ch === '\r') {
				this.advance();
			} else if (ch === '\n') {
				this.line++;
				this.col = 1;
				this.advance();
			} else if (ch === '-' && this.pos + 1 < this.src.length && this.src[this.pos + 1] === '-') {
				// Line comment
				while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.advance();
			} else if (ch === '/' && this.pos + 1 < this.src.length && this.src[this.pos + 1] === '*') {
				// Block comment
				this.advance(); this.advance();
				while (this.pos < this.src.length - 1 && !(this.src[this.pos] === '*' && this.src[this.pos + 1] === '/')) {
					if (this.src[this.pos] === '\n') { this.line++; this.col = 1; }
					this.advance();
				}
				if (this.pos < this.src.length) this.advance();
				if (this.pos < this.src.length) this.advance();
			} else {
				break;
			}
		}
	}

	private advance(): void {
		this.pos++;
		this.col++;
	}

	private peek(): string {
		return this.pos < this.src.length ? this.src[this.pos] : '';
	}

	private isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
	private isIdentStart(ch: string): boolean { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
	private isIdentChar(ch: string): boolean { return this.isIdentStart(ch) || this.isDigit(ch); }

	private make(type: TokenType, value: string, line?: number, col?: number): Token {
		return { type, value, line: line ?? this.line, col: col ?? this.col };
	}
}
