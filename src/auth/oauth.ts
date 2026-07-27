import * as crypto from 'node:crypto';
import type { OAuthConfig, OAuthProvider, OAuthUrlResult, OAuthUserInfo } from './types.js';

const OAUTH_CONFIGS: Record<OAuthProvider, {
	authorizationUrl: string;
	tokenUrl: string;
	userInfoUrl: string;
	defaultScopes: string[];
}> = {
	google: {
		authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
		defaultScopes: ['openid', 'email', 'profile'],
	},
	github: {
		authorizationUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		userInfoUrl: 'https://api.github.com/user',
		defaultScopes: ['user:email'],
	},
	wechat: {
		authorizationUrl: 'https://open.weixin.qq.com/connect/qrconnect',
		tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
		userInfoUrl: 'https://api.weixin.qq.com/sns/userinfo',
		defaultScopes: ['snsapi_login'],
	},
	qq: {
		authorizationUrl: 'https://graph.qq.com/oauth2.0/authorize',
		tokenUrl: 'https://graph.qq.com/oauth2.0/token',
		userInfoUrl: 'https://graph.qq.com/user/get_user_info',
		defaultScopes: [],
	},
};

export class OAuthClient {
	private configs: Map<OAuthProvider, OAuthConfig> = new Map();

	constructor(configs?: Partial<Record<OAuthProvider, OAuthConfig>>) {
		if (configs) {
			for (const [provider, config] of Object.entries(configs)) {
				if (config) {
					this.configs.set(provider as OAuthProvider, config);
				}
			}
		}
	}

	getAuthorizationUrl(provider: OAuthProvider, redirectUri: string, scopes?: string[]): OAuthUrlResult {
		const config = this.configs.get(provider);
		if (!config) throw new Error(`OAuth provider "${provider}" not configured`);

		const providerConfig = OAUTH_CONFIGS[provider];
		const state = crypto.randomBytes(16).toString('hex');
		const scope = (scopes || providerConfig.defaultScopes).join(' ');

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			state,
			...(scope ? { scope } : {}),
		});

		return {
			url: `${providerConfig.authorizationUrl}?${params.toString()}`,
			state,
		};
	}

	async exchangeCode(provider: OAuthProvider, code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
		const config = this.configs.get(provider);
		if (!config) throw new Error(`OAuth provider "${provider}" not configured`);

		const providerConfig = OAUTH_CONFIGS[provider];

		const body: Record<string, string> = {
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		};

		const response = await fetch(providerConfig.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
		}

		const data = await response.json() as Record<string, unknown>;
		return {
			accessToken: data.access_token as string,
			refreshToken: data.refresh_token as string | undefined,
			expiresAt: data.expires_in ? new Date(Date.now() + (data.expires_in as number) * 1000).toISOString() : undefined,
		};
	}

	async getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserInfo> {
		const providerConfig = OAUTH_CONFIGS[provider];

		const response = await fetch(providerConfig.userInfoUrl, {
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Accept': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OAuth user info failed: ${response.status} ${errorText}`);
		}

		const data = await response.json() as Record<string, unknown>;
		return this.normalizeUserInfo(provider, data);
	}

	private normalizeUserInfo(provider: OAuthProvider, data: Record<string, unknown>): OAuthUserInfo {
		switch (provider) {
			case 'google':
				return {
					id: data.id as string,
					username: data.email as string,
					email: data.email as string,
					displayName: data.name as string,
					avatar: data.picture as string,
					provider,
				};
			case 'github':
				return {
					id: String(data.id),
					username: data.login as string,
					email: (data.email as string) || '',
					displayName: data.name as string,
					avatar: data.avatar_url as string,
					provider,
				};
			case 'wechat':
				return {
					id: data.unionid as string,
					username: data.nickname as string,
					email: '',
					displayName: data.nickname as string,
					avatar: data.headimgurl as string,
					provider,
				};
			case 'qq':
				return {
					id: data.openid as string,
					username: data.nickname as string,
					email: '',
					displayName: data.nickname as string,
					avatar: data.figureurl_qq_2 as string,
					provider,
				};
			default:
				throw new Error(`Unknown provider: ${provider}`);
		}
	}
}
