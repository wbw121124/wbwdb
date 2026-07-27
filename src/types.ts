import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * 数据库类型定义接口
 * @template T - 类型参数，表示对应的 TypeScript 类型
 * @public
 */
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
		.replace(/\b/g, '\\b')
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
		typeof (value as any).toString === 'function';
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
			return isToStringable(value) ? (value as any).toString() :
				(typeof value === 'object' && value !== null
					? value as object
					: Object(value)).toString();
		},
		(value: string): T => {
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
	constructor(public map: Map<string, DBFullType<any>>) { }
	toString() {
		const a = [];
		for (const [key, value] of this.map.entries())
			a.push(`"${escapeJsonString(key)}":"${escapeJsonString(value.t.name)}"`);
		return `{${a.join(',')}}`
	}
	static fromStrMap(v: Map<string, string>): DBSchema {
		// 将 Map<string,string> 转换为 Map<string, DBFullType<any>>
		const map = new Map<string, DBFullType<any>>();
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
	constructor(public row: Map<string, any>) { }
	static fromObject(obj: Record<string, any>): DBRow {
		const map = new Map<string, any>();
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
	constructor(row: Map<string, any>, public id: number) {
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
	static fromJSON(json: any): DBRowWithID {
		if (typeof json === 'string') {
			json = JSON.parse(json);
		}

		// 处理 {"id": 1, "row": {...}}
		if (json && typeof json === 'object' && 'id' in json && 'row' in json) {
			const row = DBRow.fromObject(json.row);
			return new DBRowWithID(row.row, json.id);
		}

		throw new Error('Invalid DBRowWithID JSON format');
	}
};

/** 数据表类型 */
class DBTable {
	constructor(public name: string, public schema: DBSchema, public cnt: number = 0, public rows: DBRowWithID[] = []) {
		for (const e of this.rows)
			e.updateT(this.schema);
	}
	valueOf() {
		return {
			name: this.name,
			schema: this.schema,
			rows: this.rows,
			cnt: this.cnt,
		}
	}
	toString() {
		return `{"name":"${escapeJsonString(this.name)}","schema":${this.schema.toString()},"rows":[${this.rows.map((e) => e.toString()).join(',')}],"cnt":${this.cnt}}`;
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
	let a: any;
	try {
		a = JSON.parse(str);
	} catch {
		throw new Error('Failed to parse table JSON data');
	}
	if (!a || typeof a !== 'object') throw new Error('Invalid table data format');
	if (typeof a.name !== 'string') throw new Error('Table data missing "name" field');
	if (!a.schema || typeof a.schema !== 'object') throw new Error('Table data missing "schema" field');
	return new DBTable(a.name, DBSchema.fromStrMap(new Map<string, string>(Object.entries(a.schema))), a.cnt ?? 0, (a.rows as Array<any> ?? []).map((e) => DBRowWithID.fromJSON(e)));
}

// 导出类型定义
export type { DBType };
export { DBTypeDef, Email, Phone, UUID, dbtypeMaker, DBFullType, DBRow, DBTable, DBSchema, DBRowWithID, importDBTableFromString };