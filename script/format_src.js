import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前脚本所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置目标目录：../src
let TARGET_DIR = path.resolve(__dirname, '../src');

/**
 * 递归读取目录下所有文件路径
 * @param {string} dirPath 
 * @returns {Promise<string[]>} 文件绝对路径数组
 */
async function getAllFiles(dirPath) {
	let results = [];

	try {
		const list = await fs.readdir(dirPath, { withFileTypes: true });

		for (const item of list) {
			const fullPath = path.join(dirPath, item.name);

			// 跳过隐藏文件或 node_modules 等不需要处理的目录
			if (item.name.startsWith('.') || item.name === 'node_modules') {
				continue;
			}

			if (item.isDirectory()) {
				const subDirFiles = await getAllFiles(fullPath);
				results = results.concat(subDirFiles);
			} else {
				results.push(fullPath);
			}
		}
	} catch (err) {
		console.error(`读取目录失败: ${dirPath}`, err);
	}

	return results;
}

/**
 * 主执行函数
 */
async function main() {
	// 检查目录是否存在
	try {
		await fs.access(TARGET_DIR);
	} catch {
		console.error(`错误: 目录 ${TARGET_DIR} 不存在或无法访问`);
		process.exit(1);
	}

	// 获取所有文件
	const allFiles = await getAllFiles(TARGET_DIR);

	// 按路径排序，保证输出顺序一致
	allFiles.sort();

	// 计算相对路径的基准目录 (即 src 的父目录)
	const basePath = path.dirname(TARGET_DIR);

	for (const filePath of allFiles) {
		// 生成相对路径 (例如: src/utils/helper.js)
		const relativePath = path.relative(basePath, filePath);

		// 标准化路径分隔符为 / (兼容 Windows)
		const normalizedRelativePath = relativePath.split(path.sep).join('/');

		// 读取文件内容
		let content = '';
		try {
			content = await fs.readFile(filePath, 'utf-8');
		} catch (err) {
			console.error(`无法读取文件: ${filePath}`, err.message);
			continue;
		}

		// 按照要求格式输出
		// ## 相对路径
		// ```
		// \t 代码
		// ```

		console.log(`## ${normalizedRelativePath}`);
		console.log('```');

		// 如果需要在每行代码前加 \t，可以使用下面这行：
		const indentedContent = content.split('\n').map(line => `\t${line}`).join('\n');
		console.log(indentedContent);

		// 通常 Markdown 代码块内不需要额外缩进，直接输出内容即可。
		// 如果你的需求确实是字面意义上的 "\t" 缩进，请取消上面注释并注释掉下面这行。
		// console.log(content);

		console.log('```');
		console.log(''); // 文件之间空一行
	}
}

main().then(async () => {
	TARGET_DIR = path.resolve(__dirname, '../bin');
	await main();
}).catch(err => {
	console.error('脚本执行出错:', err);
	process.exit(1);
});