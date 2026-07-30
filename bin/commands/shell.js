import * as readline from 'node:readline';
import { CliTools } from 'wbw-cli-tools-lib';
import { initDB } from '../lib/db.js';
import { displayTable, displayJSON } from '../lib/display.js';
// import { SQLHintEngine } from '../lib/sql-hint.js';

const SQL_KEYWORDS = [
	'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
	'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT',
	'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS',
	'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
	'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
	'ASC', 'DESC', 'TRUE', 'FALSE', 'PRIMARY', 'KEY', 'DEFAULT',
];

// [FIX] Check if SQL statement is complete (balanced parentheses, quotes, and $$ strings)
function isSQLComplete(input) {
	let parentheses = 0;
	let inString = false;
	let stringChar = null;
	let inDollarString = false;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }

		if (inDollarString) {
			// Check for closing $$
			if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
				inDollarString = false;
				i++; // skip next $
			}
			continue;
		}

		if (inString) {
			if (ch === stringChar) inString = false;
			continue;
		}

		// Check for opening $$ string
		if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
			inDollarString = true;
			i++; // skip next $
			continue;
		}

		if (ch === "'" || ch === '"') {
			inString = true;
			stringChar = ch;
			continue;
		}

		if (ch === '(') parentheses++;
		else if (ch === ')') parentheses--;
	}

	return parentheses === 0 && !inString && !inDollarString;
}

export function registerShellCommand(parent, cli) {
	parent
		.command('shell')
		.alias('sh')
		.description('Interactive SQL shell')
		.action(async function () {
			const opts = this.parent.opts();
			await shell(opts.db, cli);
		});

	parent
		.command('query')
		.alias('q')
		.argument('<sql...>', 'SQL statement')
		.description('Execute a SQL statement')
		.action(async function (sqlParts) {
			const opts = this.parent.opts();
			const sql = sqlParts.join(' ');
			await query(opts.db, sql, opts, cli);
		});
}

export async function shell(dbPath, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb-shell', commandDescription: 'Interactive SQL Shell' });
	const db = await initDB(dbPath);

	const tableNames = [...db.dbTables.keys()];

	// [FIX] Multi-line SQL state
	let multiLineBuffer = '';
	let inMultiLine = false;

	// [FIX] Hint engine state
	// const hintEngine = new SQLHintEngine(db);
	// let hintMode = 'inline'; // 'inline' | 'list'
	// let currentSuggestions = [];
	// let selectedSuggestionIndex = 0;
	// let scrollOffset = 0;
	// const VISIBLE_COUNT = 3;
	// let currentInput = '';
	// let lastCursorPos = 0;
	// let lastListLineCount = 0; // 追踪上次列表打印的行数
	// let rendering = false; // 防止重入渲染

	cli.printBanner('WBWDB SQL Shell');
	cli.info('Type SQL statements or use meta-commands:');
	cli.print('  \\help           Show all commands');
	cli.print('  \\help <cmd>     Show help for a command');
	cli.print('  \\dt             List all tables');
	cli.print('  \\d <name>       Describe table');
	cli.print('  \\schema <name>  Show table schema as JSON');
	cli.print('  \\clear           Clear screen');
	cli.print('  \\q              Quit');
	cli.newline();

	const rl = readline.createInterface({
		// eslint-disable-next-line no-undef
		input: process.stdin,
		// eslint-disable-next-line no-undef
		output: process.stdout,
		prompt: 'wbwdb> ',
		completer: (line) => {
			const trimmed = line.trimStart();
			const hits = [];

			if (trimmed.startsWith('\\d ')) {
				const prefix = trimmed.slice(3);
				for (const name of tableNames) {
					if (name.startsWith(prefix)) hits.push(`\\d ${name}`);
				}
			} else if (trimmed.startsWith('\\')) {
				const meta = ['\\help ', '\\help', '\\h ', '\\h', '\\?', '\\dt', '\\d ', '\\schema ', '\\clear', '\\q'];
				for (const m of meta) {
					if (m.startsWith(trimmed)) hits.push(m);
				}
			} else {
				const upper = trimmed.toUpperCase();
				for (const kw of SQL_KEYWORDS) {
					if (kw.startsWith(upper)) hits.push(line.slice(0, line.trimStart().length - trimmed.length) + kw);
				}
				for (const name of tableNames) {
					if (name.toUpperCase().startsWith(upper)) hits.push(line.slice(0, line.trimStart().length - trimmed.length) + name);
				}
			}

			return [hits.length ? hits : [line], line];
		},
	});

	// // [FIX] Enable keypress events for hint rendering
	// // eslint-disable-next-line no-undef
	// readline.emitKeypressEvents(process.stdin);
	// // eslint-disable-next-line no-undef
	// if (process.stdin.isTTY) {
	// 	// eslint-disable-next-line no-undef
	// 	process.stdin.setRawMode(true);
	// }

	// // [FIX] Hint rendering functions using rl.output for compatibility with readline
	// function getPrompt() {
	// 	return inMultiLine ? '...> ' : 'wbwdb> ';
	// }

	// function hintPrint(text) {
	// 	rl.output.write(text);
	// }

	// // 直接写入 stdout，绕过 readline 光标追踪
	// function rawPrint(text) {
	// 	// eslint-disable-next-line no-undef
	// 	process.stdout.write(text);
	// }

	// function clearInlineHint() {
	// 	// \x1b[2K = clear entire line, \r = carriage return
	// 	hintPrint('\x1b[2K\r' + getPrompt() + currentInput);
	// }

	// function renderInlineHint(suggestions) {
	// 	if (suggestions.length === 0) {
	// 		clearInlineHint();
	// 		return;
	// 	}

	// 	const suggestion = suggestions[0];
	// 	const remaining = suggestion.text.slice(currentInput.length);

	// 	// \x1b[2K = clear entire line, \r = carriage return
	// 	let line = '\x1b[2K\r' + getPrompt() + currentInput;
	// 	if (remaining) {
	// 		line += `\x1b[90m${remaining}\x1b[0m`; // 灰色
	// 	}
	// 	// \x1b[nG = move to column n (1-indexed)
	// 	const cursorCol = getPrompt().length + currentInput.length + 1;
	// 	line += `\x1b[${cursorCol}G`;
	// 	hintPrint(line);
	// }

	// function renderListView(suggestions) {
	// 	// 先清除上次打印的列表区域
	// 	clearListArea();

	// 	if (suggestions.length === 0) {
	// 		clearInlineHint();
	// 		return;
	// 	}

	// 	// Adjust scroll offset to keep selected item visible
	// 	if (selectedSuggestionIndex < scrollOffset) {
	// 		scrollOffset = selectedSuggestionIndex;
	// 	} else if (selectedSuggestionIndex >= scrollOffset + VISIBLE_COUNT) {
	// 		scrollOffset = selectedSuggestionIndex - VISIBLE_COUNT + 1;
	// 	}

	// 	const visibleItems = suggestions.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);

	// 	// 重写干净的输入行
	// 	clearInlineHint();

	// 	// 计算本次要打印的总行数（不含输入行本身）
	// 	let lineCount = 1; // header
	// 	lineCount += visibleItems.length;
	// 	if (suggestions.length > VISIBLE_COUNT) {
	// 		const moreCount = suggestions.length - scrollOffset - VISIBLE_COUNT;
	// 		if (moreCount > 0) lineCount++;
	// 	}
	// 	if (scrollOffset > 0) lineCount++;
	// 	lineCount++; // footer

	// 	// 用 rawPrint 直接输出，绕过 readline 光标追踪
	// 	rawPrint('\n');
	// 	rawPrint('\x1b[90m┌─ Suggestions ──────────────────────────────────┐\x1b[0m\r\n');

	// 	for (let i = 0; i < visibleItems.length; i++) {
	// 		const globalIndex = scrollOffset + i;
	// 		const s = visibleItems[i];
	// 		const prefix = globalIndex === selectedSuggestionIndex ? '│ > ' : '│   ';
	// 		const text = s.text.padEnd(25);
	// 		rawPrint(`\x1b[90m${prefix}\x1b[0m${text} \x1b[90m${s.description || ''}\x1b[0m\r\n`);
	// 	}

	// 	if (suggestions.length > VISIBLE_COUNT) {
	// 		const moreCount = suggestions.length - scrollOffset - VISIBLE_COUNT;
	// 		if (moreCount > 0) {
	// 			rawPrint(`\x1b[90m│   ↓ ${moreCount} more below...\x1b[0m\r\n`);
	// 		}
	// 	}

	// 	if (scrollOffset > 0) {
	// 		rawPrint(`\x1b[90m│   ↑ ${scrollOffset} above...\x1b[0m\r\n`);
	// 	}

	// 	rawPrint('\x1b[90m└────────────────────────────────────────────────┘\x1b[0m\r\n');

	// 	// 移动光标回到输入行末尾
	// 	const promptLen = getPrompt().length + currentInput.length;
	// 	rawPrint(`\x1b[${lineCount + 1}A`);
	// 	rawPrint(`\x1b[${promptLen + 1}G`);

	// 	// 记录本次打印的行数，下次清除用
	// 	lastListLineCount = lineCount;
	// 	if (lineCount)
	// 		lastListLineCount++;
	// }

	// // 清除上次打印的列表区域（在输入行下方）
	// function clearListArea(u = 0) {
	// 	if (lastListLineCount === 0) return;
	// 	// 逐行清除输入行下方的内容
	// 	for (let i = 0; i < lastListLineCount; i++) {
	// 		rawPrint('\x1b[2K\x1b[1B'); // 清除当前行，下移一行
	// 	}
	// 	// 上移回到输入行
	// 	rawPrint(`\x1b[${lastListLineCount}A`);
	// 	if (u === 1)
	// 		rawPrint('\x1b[1B');
	// 	lastListLineCount = 0;
	// }

	// function renderHints() {
	// 	if (rendering) return; // 防止重入
	// 	rendering = true;
	// 	try {
	// 		if (hintMode === 'inline') {
	// 			clearListArea();
	// 			renderInlineHint(currentSuggestions);
	// 		} else {
	// 			renderListView(currentSuggestions);
	// 		}
	// 	} finally {
	// 		rendering = false;
	// 	}
	// }

	// function updateHints() {
	// 	if (rendering) return; // 防止重入
	// 	currentSuggestions = hintEngine.getSuggestions(currentInput, lastCursorPos);
	// 	selectedSuggestionIndex = 0;
	// 	scrollOffset = 0;
	// 	renderHints();
	// }

	// [FIX] Key press handling for hints - use process.stdin directly
	// // eslint-disable-next-line no-undef
	// process.stdin.on('keypress', (str, key) => {
	// 	if (!key) return;

	// 	// // F2 切换显示模式
	// 	// if (key.name === 'f2') {
	// 	// 	hintMode = hintMode === 'inline' ? 'list' : 'inline';
	// 	// 	renderHints();
	// 	// 	return;
	// 	// }

	// 	// // Tab 接受建议
	// 	// if (key.name === 'tab') {
	// 	// 	if (currentSuggestions.length > 0) {
	// 	// 		const suggestion = currentSuggestions[selectedSuggestionIndex];
	// 	// 		const a = currentInput.split(' ').slice(0, -1);
	// 	// 		a.push(suggestion.text)
	// 	// 		currentInput = a.join(' ');
	// 	// 		rl.line = currentInput;
	// 	// 		rl.cursor = currentInput.length;
	// 	// 		lastCursorPos = currentInput.length;
	// 	// 		updateHints();
	// 	// 	}
	// 	// 	return;
	// 	// }

	// 	// // Right 箭头接受 InlineView 建议
	// 	// if (key.name === 'right' && hintMode === 'inline' && key.ctrl !== true) {
	// 	// 	// Only accept if at end of line
	// 	// 	if (rl.cursor === rl.line.length && currentSuggestions.length > 0) {
	// 	// 		const suggestion = currentSuggestions[0];
	// 	// 		currentInput = suggestion.text;
	// 	// 		rl.line = currentInput;
	// 	// 		rl.cursor = currentInput.length;
	// 	// 		lastCursorPos = currentInput.length;
	// 	// 		updateHints();
	// 	// 		return;
	// 	// 	}
	// 	// }

	// 	// // 上/下箭头在 ListView 中选择
	// 	// if (hintMode === 'list' && currentSuggestions.length > 0) {
	// 	// 	if (key.name === 'up') {
	// 	// 		selectedSuggestionIndex = Math.max(0, selectedSuggestionIndex - 1);
	// 	// 		renderHints();
	// 	// 		return;
	// 	// 	}
	// 	// 	if (key.name === 'down') {
	// 	// 		selectedSuggestionIndex = Math.min(currentSuggestions.length - 1, selectedSuggestionIndex + 1);
	// 	// 		renderHints();
	// 	// 		return;
	// 	// 	}
	// 	// }

	// 	// 每次输入后更新提示
	// 	// // eslint-disable-next-line no-undef
	// 	// setTimeout(() => {
	// 	// 	currentInput = rl.line || '';
	// 	// 	lastCursorPos = rl.cursor || 0;
	// 	// 	// updateHints();
	// 	// }, 0);
	// });

	rl.prompt();

	rl.on('line', (line) => {

		// clearListArea(1);
		const input = line.trim();

		// [FIX] Handle multi-line SQL input
		if (inMultiLine) {
			multiLineBuffer += '\n' + line;
			if (isSQLComplete(multiLineBuffer)) {
				inMultiLine = false;
				rl.setPrompt('wbwdb> ');
				executeQuery(db, multiLineBuffer, cli);
				multiLineBuffer = '';
			} else {
				rl.setPrompt('...> ');
			}
			rl.prompt();
			return;
		}

		if (!input) {
			rl.prompt();
			return;
		}

		if (input === '\\q' || input === '\\quit') {
			cli.success('Bye!');
			rl.close();
			return;
		}

		// [FIX] Help system
		if (input === '\\help' || input === '\\h' || input === '\\?') {
			cli.info('Available commands:');
			cli.print('');
			cli.print('  \\help           Show this help message');
			cli.print('  \\help <cmd>     Show detailed help for a command');
			cli.print('  \\dt             List all tables');
			cli.print('  \\d <name>       Describe table (columns, row count, sample data)');
			cli.print('  \\schema <name>  Show table schema as JSON');
			cli.print('  \\clear          Clear screen');
			cli.print('  \\q              Quit the shell');
			cli.print('');
			// cli.info('Keyboard shortcuts:');
			// cli.print('  Tab             Accept suggestion');
			// cli.print('  F2              Toggle inline/list view');
			// cli.print('  Right arrow     Accept inline suggestion');
			// cli.print('  ↑/↓             Navigate list view');
			// cli.print('');
			cli.info('SQL features:');
			cli.print('  - Multi-line SQL (auto-detect incomplete statements)');
			cli.print('  - Smart hints for keywords, tables, columns, functions');
			cli.print('  - Parameter hints for functions');
			rl.prompt();
			return;
		}

		if (input.startsWith('\\help ') || input.startsWith('\\h ')) {
			const cmd = input.split(/\s+/)[1];
			const helpTexts = {
				'dt': {
					name: '\\dt',
					syntax: '\\dt',
					description: 'List all tables in the database',
					example: '\\dt',
				},
				'd': {
					name: '\\d',
					syntax: '\\d <table_name>',
					description: 'Describe a table (columns, row count, sample data)',
					example: '\\d users',
				},
				'schema': {
					name: '\\schema',
					syntax: '\\schema <table_name>',
					description: 'Show table schema as JSON',
					example: '\\schema users',
				},
				'clear': {
					name: '\\clear',
					syntax: '\\clear',
					description: 'Clear the terminal screen',
					example: '\\clear',
				},
				'q': {
					name: '\\q',
					syntax: '\\q',
					description: 'Quit the SQL shell and save changes',
					example: '\\q',
				},
				'help': {
					name: '\\help',
					syntax: '\\help [command]',
					description: 'Show help information',
					example: '\\help \\d',
				},
			};

			const help = helpTexts[cmd];
			if (help) {
				cli.print('');
				cli.print(`  ${help.name} - ${help.description}`);
				cli.print('');
				cli.print('  Syntax:');
				cli.print(`    ${help.syntax}`);
				cli.print('');
				cli.print('  Example:');
				cli.print(`    ${help.example}`);
				cli.print('');
			} else {
				cli.warn(`Unknown command: ${cmd}`);
				cli.info('Available commands: \\help, \\dt, \\d, \\schema, \\clear, \\q');
			}
			rl.prompt();
			return;
		}

		if (input === '\\clear') {
			// \x1b[2J = clear screen, \x1b[H = move cursor to top-left
			// hintPrint('\x1b[2J\x1b[H');
			rl.prompt();
			return;
		}

		if (input === '\\dt') {
			const tables = db.dbTables.size;
			if (tables === 0) {
				cli.info('No tables found.');
			} else {
				for (const [name, table] of db.dbTables) {
					const cols = [...table.schema.map.keys()].join(', ');
					cli.print(`  ${name} (${table.rows.length} rows) [${cols}]`);
				}
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\d ')) {
			const tableName = input.slice(3).trim();
			const table = db.dbTables.get(tableName);
			if (!table) {
				cli.error(`Table "${tableName}" not found.`);
			} else {
				cli.print(`Table: ${tableName}`);
				cli.print(`Rows:  ${table.rows.length}`);
				cli.print('Schema:');
				for (const [col, type] of table.schema.map.entries()) {
					cli.print(`  ${col}: ${type.t.name}`);
				}
				if (table.rows.length > 0) {
					cli.print('\nSample data:');
					displayTable({
						columns: [...table.schema.map.keys()],
						rows: table.rows.slice(0, 5).map(r => Object.fromEntries(r.row)),
						row_count: table.rows.length,
					});
				}
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\schema ')) {
			const tableName = input.slice(8).trim();
			const table = db.dbTables.get(tableName);
			if (!table) {
				cli.error(`Table "${tableName}" not found.`);
			} else {
				displayJSON({ table: tableName, schema: Object.fromEntries([...table.schema.map.entries()].map(([k, v]) => [k, v.t.name])) });
			}
			rl.prompt();
			return;
		}

		if (input.startsWith('\\')) {
			cli.error(`Unknown command: ${input}`);
			cli.info('Available commands: \\help, \\dt, \\d <name>, \\schema <name>, \\clear, \\q');
			rl.prompt();
			return;
		}

		// [FIX] Check if SQL is complete or needs multi-line
		if (!isSQLComplete(input)) {
			inMultiLine = true;
			multiLineBuffer = input;
			rl.setPrompt('...> ');
			rl.prompt();
			return;
		}

		executeQuery(db, input, cli);
		rl.prompt();
	});

	rl.on('close', async () => {
		await db.save();
		// eslint-disable-next-line no-undef
		process.exit(0);
	});
}

// [FIX] Extract query execution to separate function
function executeQuery(db, sql, cli) {
	try {
		const result = db.query(sql);
		displayTable(result);
	} catch (err) {
		cli.error(err);
	}
}

export async function query(dbPath, sql, opts, parentCli) {
	const cli = parentCli || CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
	const db = await initDB(dbPath);
	try {
		const result = db.query(sql);
		await db.save();
		if (opts?.json) {
			displayJSON(result);
		} else {
			displayTable(result);
		}
	} catch (err) {
		if (opts?.json) {
			displayJSON({ error: err.message });
		} else {
			cli.error(err.message);
		}
		// eslint-disable-next-line no-undef
		process.exit(1);
	}
}
