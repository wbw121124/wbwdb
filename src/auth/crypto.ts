import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string, saltRounds: number = SALT_ROUNDS): Promise<string> {
	return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

export function hashApiKey(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
	const bytes = crypto.randomBytes(32);
	return `wbwdb_${bytes.toString('base64url')}`;
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
	return crypto.randomBytes(32).toString('hex');
}
