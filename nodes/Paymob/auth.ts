export type PaymobCredentialSecrets = {
	apiKey?: string;
	secretKey?: string;
};

export type AuthenticatableRequest = {
	url?: string;
	baseURL?: string;
	headers?: Record<string, string | undefined>;
	body?: Record<string, unknown>;
	json?: boolean;
	method?: string;
};

/**
 * Applies Paymob's documented authorization to an outgoing request.
 * Intention, refund, and void calls use `Authorization: Token <secret key>`.
 * Transaction inquiry keeps a caller-supplied bearer token from `/api/auth/tokens`.
 * The auth-token call itself sends the API key in the JSON body.
 */
export function applyPaymobAuth(
	credentials: PaymobCredentialSecrets,
	requestOptions: AuthenticatableRequest,
): AuthenticatableRequest {
	const url = `${requestOptions.baseURL ?? ''}${requestOptions.url ?? ''}`;
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(requestOptions.headers ?? {})) {
		if (typeof value === 'string') headers[key] = value;
	}

	if (url.includes('/api/auth/tokens')) {
		requestOptions.body = {
			...(requestOptions.body ?? {}),
			api_key: credentials.apiKey ?? '',
		};
		delete headers.Authorization;
		delete headers.authorization;
		requestOptions.headers = headers;
		return requestOptions;
	}

	if (!headers.Authorization && !headers.authorization) {
		headers.Authorization = `Token ${credentials.secretKey ?? ''}`;
	}

	requestOptions.headers = headers;
	return requestOptions;
}
