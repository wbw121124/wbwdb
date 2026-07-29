// bin/lib/display.js
import { CliTools } from 'wbw-cli-tools-lib';

/**
 * 将数据格式化为表格字符串并打印
 * @param {object} result - 查询结果对象 { columns: string[], rows: object[], row_count: number }
 */
export function displayTable(result) {
	const cli = CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
	if (!result || !result.columns || result.columns.length === 0) {
		cli.info('No data to display.');
		return;
	}

	const { columns, rows } = result;

	// 1. 计算每列的最大宽度
	const colWidths = {};
	columns.forEach(col => {
		colWidths[col] = col.length;
	});

	rows.forEach(row => {
		columns.forEach(col => {
			const val = row[col];
			const strVal = val === null || val === undefined ? '' : String(val);
			if (strVal.length > colWidths[col]) {
				colWidths[col] = strVal.length;
			}
		});
	});

	// 2. 构建表头
	const headerLine = columns.map(col => padRight(col, colWidths[col])).join(' | ');
	const separator = columns.map(col => '-'.repeat(colWidths[col])).join('-+-');

	cli.print(headerLine);
	cli.print(separator);

	// 3. 构建数据行
	if (rows.length === 0) {
		cli.info('(0 rows)');
	} else {
		rows.forEach(row => {
			const line = columns.map(col => {
				const val = row[col];
				const strVal = val === null || val === undefined ? '' : String(val);
				return padRight(strVal, colWidths[col]);
			}).join(' | ');
			cli.print(line);
		});

		cli.print(`\n(${rows.length} row${rows.length !== 1 ? 's' : ''})`);
	}
}

/**
 * 打印 JSON 数据
 * @param {any} data 
 */
export function displayJSON(data) {
	const cli = CliTools.create({ commandName: 'wbwdb', commandDescription: '' });
	cli.print(JSON.stringify(data, null, 2));
}

/**
 * 字符串右填充
 * @param {string} str 
 * @param {number} len 
 * @returns {string}
 */
function padRight(str, len) {
	const s = String(str);
	if (s.length >= len) return s;
	return s + ' '.repeat(len - s.length);
}