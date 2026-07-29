import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * 数据库类型定义接口
 * @template T - 类型参数，表示对应的 TypeScript 类型
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DBType<T = any> {
	/** 类型名称 */
	name: string;
	/** 将值转换为数据库存储对象的函数 */
	toObj: (value: T) => object;
	/** 从数据库存储对象还原为原始值的函数 */
	fromObj: (value: object) => T;
	/** 转 string */
	toStr: (value: T) => string;
	/** string 转 T */
	fromStr: (value: string) => T;
	/** 新建值 */
	newVal: () => T;
}

/**
 * 数据库类型定义类
 * @template T - 类型参数，表示对应的 TypeScript 类型
 * @public
 */
class DBTypeDef<T> implements DBType<T> {
	/**
	 * 创建一个数据库类型定义
	 * @param name - 类型名称
	 * @param toObj - 值到数据库对象的转换函数
	 * @param fromObj - 数据库对象到值的转换函数
	 * @param newVal - 新建值的函数
	 * @public
	 */
	constructor(
		public name: string,
		public toObj: (value: T) => object,
		public fromObj: (value: object) => T,
		public toStr: (value: T) => string,
		public fromStr: (value: string) => T,
		public newVal: () => T
	) { }
}

/**
 * 电子邮件地址类
 * 提供电子邮件地址的验证和封装
 * @public
 * @example
 * ```typescript
 * const email = new Email('user@example.com');
 * console.log(email.toString()); // 'user@example.com'
 * ```
 */
class Email {
	/** 存储的电子邮件地址值 */
	private readonly _value: string;

	/**
	 * 创建一个电子邮件实例
	 * @param value - 电子邮件地址字符串或 Email 实例
	 * @throws {Error} 当电子邮件地址格式无效时抛出错误
	 * @example
	 * ```typescript
	 * const email1 = new Email('user@example.com');
	 * const email2 = new Email(email1); // 从另一个实例创建
	 * ```
	 */
	constructor(value: string | Email) {
		this._value = value instanceof Email ? value._value : value.toString();
		this.validate(this._value);
	}

	/**
	 * 验证电子邮件地址格式
	 * @param email - 要验证的电子邮件字符串
	 * @throws {Error} 当格式无效时抛出错误
	 * @private
	 */
	private validate(email: string): void {
		const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
		if (!emailRegex.test(email)) {
			throw new Error(`错误：字符串（\`${email}\`）不是有效的电子邮件地址`);
		}
	}

	/**
	 * 转换为字符串
	 * @returns 电子邮件地址字符串
	 */
	toString(): string {
		return this._value;
	}

	/**
	 * 值类型转换（用于类型强制转换）
	 * @returns 电子邮件地址字符串
	 */
	valueOf(): string {
		return this.toString();
	}
}


function escapeJsonString(str: string): string {
	const result = str
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t')
		.replace(/[\b]/g, '\\b')
		.replace(/\f/g, '\\f');
	// Escape remaining control characters (U+0000 to U+001F)
	let out = '';
	for (let i = 0; i < result.length; i++) {
		const code = result.charCodeAt(i);
		if (code < 0x20) {
			out += code < 16 ? `\\u000${code.toString(16)}` : `\\u00${code.toString(16)}`;
		} else {
			out += result[i];
		}
	}
	return out;
}

function isToStringable(value: unknown): value is { toString(): string } {
	return value !== null &&
		value !== undefined &&
		typeof (value as Record<string, unknown>).toString === 'function';
}

/**
 * 创建数据库类型定义的工厂函数
 * @template T - 类型参数
 * @param name - 类型名称
 * @returns 数据库类型定义实例
 * @public
 * @example
 * ```typescript
 * const numberType = dbtypeMaker<number>('Number');
 * const stringType = dbtypeMaker<string>('String');
 * ```
 */
function dbtypeMaker<T>(name: string, defaultValue?: T): DBTypeDef<T> {
	return new DBTypeDef<T>(
		name,
		(value: T): object => {
			// 对于基本类型，包装为对象；对于对象类型，直接返回
			return typeof value === 'object' && value !== null
				? value as object
				: Object(value);
		},
		(value: object): T => {
			// 从数据库对象还原为原始类型
			return value as T;
		},
		(value: T): string => {
			return isToStringable(value) ? (value as { toString(): string }).toString() :
				(typeof value === 'object' && value !== null
					? value as object
					: Object(value)).toString();
		},
		(value: string): T => {
			if (name === 'Number') return Number(value) as T;
			if (name === 'Boolean') return (value === 'true') as T;
			return value as T;
		},
		(_nullable?: boolean): T => {
			if (defaultValue !== undefined) return defaultValue;
			return null as T;
		}
	);
}

/**
 * 电话号码类
 * 提供电话号码的验证和封装
 * @public
 * @example
 * ```typescript
 * const phone = new Phone('13800138000');
 * console.log(phone.toString()); // '13800138000'
 * ```
 */
class Phone {
	/** 存储的电话号码值 */
	private readonly _value: string;

	/**
	 * 创建一个电话号码实例
	 * @param value - 电话号码字符串或 Phone 实例
	 * @throws {Error} 当电话号码格式无效时抛出错误
	 */
	constructor(value: string | Phone) {
		this._value = value instanceof Phone ? value._value : value.toString();
		this.validate(this._value);
	}

	/**
	 * 验证电话号码格式（支持中国大陆手机号）
	 * @param phone - 要验证的电话号码字符串
	 * @throws {Error} 当格式无效时抛出错误
	 * @private
	 */
	private validate(phone: string): void {
		// 支持中国大陆手机号（11位，1开头）
		// 也支持带区号的固话格式：区号-号码
		// 还有带国际电话区号
		const phoneRegex = /^(1[3-9]\d{9})$|^(\d{3,4}-?\d{7,8})|(\+\d{1,3}-?\d{7,11})$/;
		if (!phoneRegex.test(phone)) {
			throw new Error(`错误：字符串（\`${phone}\`）不是有效的电话号码`);
		}
	}

	/**
	 * 转换为字符串
	 * @returns 电话号码字符串
	 */
	toString(): string {
		return this._value;
	}

	/**
	 * 值类型转换（用于类型强制转换）
	 * @returns 电话号码字符串
	 */
	valueOf(): string {
		return this.toString();
	}
}

/**
 * UUID 类
 * 提供 UUID 的生成和验证封装
 * @public
 * @example
 * ```typescript
 * const uuid1 = new UUID(); // 自动生成
 * const uuid2 = new UUID('550e8400-e29b-41d4-a716-446655440000');
 * const uuid3 = UUID.generate(); // 使用静态方法
 * ```
 */
class UUID {
	/** 存储的 UUID 值 */
	private readonly _value: string;

	/**
	 * 创建一个 UUID 实例
	 * @param value - UUID 字符串或 UUID 实例，如果不传则自动生成
	 * @throws {Error} 当 UUID 格式无效时抛出错误
	 */
	constructor(value?: string | UUID) {
		if (!value) {
			// 自动生成 UUID
			this._value = uuidv4();
		} else if (value instanceof UUID) {
			this._value = value._value;
		} else {
			this._value = value.toString();
			this.validate(this._value);
		}
	}

	/**
	 * 验证 UUID 格式
	 * @param uuid - 要验证的 UUID 字符串
	 * @throws {Error} 当格式无效时抛出错误
	 * @private
	 */
	private validate(uuid: string): void {
		if (!uuidValidate(uuid)) {
			throw new Error(`错误：字符串（\`${uuid}\`）不是有效的 UUID`);
		}
	}

	/**
	 * 转换为字符串
	 * @returns UUID 字符串
	 */
	toString(): string {
		return this._value;
	}

	/**
	 * 值类型转换（用于类型强制转换）
	 * @returns UUID 字符串
	 */
	valueOf(): string {
		return this.toString();
	}

	/**
	 * 静态方法：生成新的 UUID
	 * @returns 新的 UUID 实例
	 * @example
	 * ```typescript
	 * const uuid = UUID.generate();
	 * console.log(uuid.toString());
	 * ```
	 */
	static generate(): UUID {
		return new UUID();
	}
}

/** 全局数据库类型注册表 */
export const dbtypes: Map<string, DBType> = new Map();

/**
 * 向数据库类型注册表添加类型
 * @template T - 要添加的类型
 * @param name - 类型名称
 * @public
 * @example
 * ```typescript
 * addType<number>('Number');
 * addType<Email>('Email');
 * addType<UUID>('UUID');
 * ```
 */
export function addType<T>(name: string, defaultVal?: T): void {
	dbtypes.set(name, dbtypeMaker<T>(name, defaultVal));
}

// 注册内置类型
addType<number>('Number', 0);
addType<string>('String', "");
addType<Date>('Date', new Date(0));
addType<boolean>('Boolean', false);
addType<Email>('Email', new Email("user@example.com"));
addType<Phone>('Phone', new Phone("+86-12345678901"));
addType<UUID>('UUID', new UUID());

class DBFullType<T> {
	constructor(public t: DBType<T>, public nullable: boolean, public defaultVal: (() => T) | T | null = nullable ? null : t.newVal()) { }
}

class DBSchema {
	constructor(public map: Map<string, DBFullType<unknown>>) { }
	toString() {
		const a = [];
		for (const [key, value] of this.map.entries())
			a.push(`"${escapeJsonString(key)}":"${escapeJsonString(value.t.name)}"`);
		return `{${a.join(',')}}`
	}
	static fromStrMap(v: Map<string, string>): DBSchema {
		// 将 Map<string,string> 转换为 Map<string, DBFullType<any>>
		const map = new Map<string, DBFullType<unknown>>();
		for (const [key, value] of v.entries()) {
			// 需要根据字符串值找到对应的DBType
			const dbType = dbtypes.get(value);
			if (dbType) {
				map.set(key, new DBFullType(dbType, false));
			} else {
				// 处理未知类型，默认使用String
				const stringType = dbtypes.get('String');
				if (stringType) {
					map.set(key, new DBFullType(stringType, false));
				}
			}
		}
		return new DBSchema(map);
	}
}

/** 数据表行类型 */
class DBRow {
	constructor(public row: Map<string, any>) { } // eslint-disable-line @typescript-eslint/no-explicit-any
	static fromObject(obj: Record<string, any>): DBRow { // eslint-disable-line @typescript-eslint/no-explicit-any
		const map = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
		for (const [key, value] of Object.entries(obj)) {
			map.set(key, value);
		}
		return new DBRow(map);
	}
	updateT(schema: DBSchema) {
		for (const [name, t] of schema.map.entries()) {
			if (!this.row.has(name)) {
				if (typeof t.defaultVal === "function")
					this.row.set(name, t.defaultVal());
				else
					this.row.set(name, t.defaultVal);
			} else {
				const currentValue = this.row.get(name);
				try {
					if (currentValue != null || !t.nullable) {
						this.row.set(name, t.t.fromStr(String(currentValue)));
					}
				} catch {
					if (typeof t.defaultVal === "function")
						this.row.set(name, t.defaultVal());
					else
						this.row.set(name, t.defaultVal);
				}
			}
		}
		for (const [key] of this.row.entries()) {
			if (!schema.map.has(key))
				this.row.delete(key);
		}
	}
	get(str: string) {
		return this.row.get(str)
	}
}

class DBRowWithID extends DBRow {
	constructor(row: Map<string, any>, public id: number) { // eslint-disable-line @typescript-eslint/no-explicit-any
		super(row);
	}
	toString() {
		const a = [];
		for (const [key, value] of this.row.entries())
			if (value !== null && value !== undefined)
				a.push(`"${escapeJsonString(key)}":"${escapeJsonString(value.toString())}"`);
		return `{"id":${this.id},"row":{${a.join(',')}}}`;
	}
	valueOf() {
		return {
			id: this.id,
			row: this.row
		}
	}
	static fromJSON(json: any): DBRowWithID { // eslint-disable-line @typescript-eslint/no-explicit-any
		const parsed: Record<string, any> = typeof json === 'string' ? JSON.parse(json) : json; // eslint-disable-line @typescript-eslint/no-explicit-any

		// 处理 {"id": 1, "row": {...}}
		if (parsed && typeof parsed === 'object' && 'id' in parsed && 'row' in parsed) {
			const row = DBRow.fromObject(parsed.row);
			return new DBRowWithID(row.row, parsed.id);
		}

		throw new Error('Invalid DBRowWithID JSON format');
	}
};

/** Hook 定义 */
interface TableHook {
	name: string;
	table: string;
	event: 'INSERT' | 'UPDATE' | 'DELETE';
	timing: 'BEFORE' | 'AFTER';
	language: 'js' | 'sql';
	body: string;
	enabled: boolean;
}

/** RLS 策略 */
interface RLSPolicyData {
	name: string;
	cmd: string;
	permissive: boolean;
	roles: string[];
	using: unknown;
	withCheck: unknown;
}

/** 数据表类型 */
class DBTable {
	rlsEnabled = false;
	rlsForced = false;
	policies: RLSPolicyData[] = [];
	hooks: TableHook[] = [];

	constructor(
		public name: string,
		public schema: DBSchema,
		public cnt: number = 0,
		public rows: DBRowWithID[] = [],
		extra?: { rlsEnabled?: boolean; rlsForced?: boolean; policies?: RLSPolicyData[]; hooks?: TableHook[] }
	) {
		for (const e of this.rows)
			e.updateT(this.schema);
		if (extra) {
			if (extra.rlsEnabled !== undefined) this.rlsEnabled = extra.rlsEnabled;
			if (extra.rlsForced !== undefined) this.rlsForced = extra.rlsForced;
			if (extra.policies) this.policies = extra.policies;
			if (extra.hooks) this.hooks = extra.hooks;
		}
	}
	valueOf() {
		return {
			name: this.name,
			schema: this.schema,
			rows: this.rows,
			cnt: this.cnt,
			rlsEnabled: this.rlsEnabled,
			rlsForced: this.rlsForced,
			policies: this.policies,
			hooks: this.hooks,
		}
	}
	toString() {
		const parts: string[] = [];
		parts.push(`"name":"${escapeJsonString(this.name)}"`);
		parts.push(`"schema":${this.schema.toString()}`);
		parts.push(`"rows":[${this.rows.map((e) => e.toString()).join(',')}]`);
		parts.push(`"cnt":${this.cnt}`);
		if (this.rlsEnabled) parts.push(`"rlsEnabled":true`);
		if (this.rlsForced) parts.push(`"rlsForced":true`);
		if (this.policies.length > 0) {
			const polStrs = this.policies.map(p => {
				const pe: string[] = [];
				pe.push(`"name":"${escapeJsonString(p.name)}"`);
				pe.push(`"cmd":"${escapeJsonString(p.cmd)}"`);
				pe.push(`"permissive":${p.permissive}`);
				pe.push(`"roles":[${p.roles.map(r => `"${escapeJsonString(r)}"`).join(',')}]`);
				if (p.using !== null && p.using !== undefined) pe.push(`"using":${JSON.stringify(p.using)}`);
				if (p.withCheck !== null && p.withCheck !== undefined) pe.push(`"withCheck":${JSON.stringify(p.withCheck)}`);
				return `{${pe.join(',')}}`;
			});
			parts.push(`"policies":[${polStrs.join(',')}]`);
		}
		if (this.hooks.length > 0) {
			const hookStrs = this.hooks.map(h => {
				const he: string[] = [];
				he.push(`"name":"${escapeJsonString(h.name)}"`);
				he.push(`"table":"${escapeJsonString(h.table)}"`);
				he.push(`"event":"${escapeJsonString(h.event)}"`);
				he.push(`"timing":"${escapeJsonString(h.timing)}"`);
				he.push(`"language":"${escapeJsonString(h.language)}"`);
				he.push(`"body":"${escapeJsonString(h.body)}"`);
				he.push(`"enabled":${h.enabled}`);
				return `{${he.join(',')}}`;
			});
			parts.push(`"hooks":[${hookStrs.join(',')}]`);
		}
		return `{${parts.join(',')}}`;
	}
	setAll(rows: DBRowWithID[]) {
		this.rows = rows;
		for (const e of this.rows)
			e.updateT(this.schema);
	}
	insert(val: DBRow) {
		const tmp = new DBRowWithID(val.row, ++this.cnt);
		tmp.updateT(this.schema);
		this.rows.push(tmp);
	}
	delete(id: number) {
		const index = this.rows.findIndex((v) => v.id === id);
		if (index !== -1) {
			this.rows.splice(index, 1);
		}
	}
	find(f: (row: DBRowWithID) => boolean): DBRowWithID[] {
		return this.rows.filter((v) => f(v));
	}
	sort(f: (a: DBRowWithID, b: DBRowWithID) => number): DBRowWithID[] {
		return this.rows.sort((a, b) => f(a, b));
	}
}

function importDBTableFromString(str: string): DBTable {
	let a: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	try {
		a = JSON.parse(str) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	} catch {
		throw new Error('Failed to parse table JSON data');
	}
	if (!a || typeof a !== 'object') throw new Error('Invalid table data format');
	if (typeof a.name !== 'string') throw new Error('Table data missing "name" field');
	if (!a.schema || typeof a.schema !== 'object') throw new Error('Table data missing "schema" field');
	const policies: RLSPolicyData[] = Array.isArray(a.policies) ? a.policies.map((p: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
		name: p.name || '',
		cmd: p.cmd || 'ALL',
		permissive: p.permissive !== false,
		roles: Array.isArray(p.roles) ? p.roles : [],
		using: p.using ?? null,
		withCheck: p.withCheck ?? null,
	})) : [];
	const hooks: TableHook[] = Array.isArray(a.hooks) ? a.hooks.map((h: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
		name: h.name || '',
		table: h.table || '',
		event: h.event || 'INSERT',
		timing: h.timing || 'BEFORE',
		language: h.language || 'js',
		body: h.body || '',
		enabled: h.enabled !== false,
	})) : [];
	return new DBTable(
		a.name,
		DBSchema.fromStrMap(new Map<string, string>(Object.entries(a.schema))),
		a.cnt ?? 0,
		(a.rows as Array<any> ?? []).map((e) => DBRowWithID.fromJSON(e)), // eslint-disable-line @typescript-eslint/no-explicit-any
		{ rlsEnabled: !!a.rlsEnabled, rlsForced: !!a.rlsForced, policies, hooks }
	);
}

// 导出类型定义
export type { DBType, TableHook, RLSPolicyData };
export { DBTypeDef, Email, Phone, UUID, dbtypeMaker, DBFullType, DBRow, DBTable, DBSchema, DBRowWithID, importDBTableFromString, escapeJsonString };