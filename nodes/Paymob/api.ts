import { DEFAULT_PAYMOB_REGION, PAYMOB_REGION_URLS, type PaymobOperation } from './constants';

export type PaymobHttpOptions = {
	method: 'GET' | 'POST';
	url: string;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	json?: boolean;
};

export type PaymobCredentials = {
	apiKey: string;
	secretKey: string;
	hmacSecret: string;
	region: string;
};

export type IntentionItemInput = {
	name?: string;
	amount?: number;
	description?: string;
	quantity?: number;
};

export type BillingInput = {
	firstName: string;
	lastName: string;
	email: string;
	phoneNumber: string;
	apartment?: string;
	street?: string;
	building?: string;
	floor?: string;
	city?: string;
	state?: string;
	country?: string;
};

export type CreateIntentionInput = {
	amount: number;
	currency: string;
	paymentMethods: string;
	specialReference?: string;
	items: IntentionItemInput[];
	billing: BillingInput;
	expiration?: number;
	notificationUrl?: string;
	redirectionUrl?: string;
	extras?: unknown;
	publicKey?: string;
};

export type PaymobHttpClient = (request: PaymobHttpOptions) => Promise<unknown>;

export function normalizeBaseUrl(region: string | undefined): string {
	const normalized = (region || DEFAULT_PAYMOB_REGION).trim().replace(/\/+$/, '');
	if (!PAYMOB_REGION_URLS.has(normalized)) {
		throw new Error(
			`Unsupported Paymob region "${region ?? ''}". Choose Egypt, KSA, UAE, Oman, or Pakistan.`,
		);
	}
	return normalized;
}

export function assertPositiveInteger(value: unknown, label: string): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive integer`);
	}
	return parsed;
}

export function parsePaymentMethods(value: string): Array<number | string> {
	const parts = value
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.length === 0) {
		throw new Error('At least one payment method integration ID or name is required');
	}

	return parts.map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function parseUrl(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}

function assertHttpUrl(value: string, label: string): string {
	const trimmed = value.trim();
	const url = parseUrl(trimmed);
	if (!url) throw new Error(`${label} must be a valid URL`);
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error(`${label} must use http or https`);
	}
	return trimmed;
}

function parseJson(value: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(value) as unknown };
	} catch {
		return { ok: false };
	}
}

export function parseExtras(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	let record: unknown = value;
	if (typeof value === 'string') {
		const parsed = parseJson(value);
		if (!parsed.ok) throw new Error('Extras must be a JSON object');
		record = parsed.value;
	}

	if (typeof record !== 'object' || record === null || Array.isArray(record)) {
		throw new Error('Extras must be a JSON object');
	}

	const extras = record as Record<string, unknown>;
	return Object.keys(extras).length > 0 ? extras : undefined;
}

function jsonHeaders(authorization?: string): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
	};
	if (authorization) headers.Authorization = authorization;
	return headers;
}

export function buildCreateIntentionRequest(
	credentials: PaymobCredentials,
	input: CreateIntentionInput,
): PaymobHttpOptions {
	const baseUrl = normalizeBaseUrl(credentials.region);
	if (!credentials.secretKey) {
		throw new Error('Paymob secret key is required to create a payment intention');
	}

	const amount = assertPositiveInteger(input.amount, 'Amount');
	const currency = input.currency.trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) {
		throw new Error('Currency must be a 3-letter ISO code, such as EGP or SAR');
	}

	const items = input.items.map((item, index) => {
		const label = `Item ${index + 1}`;
		const name = item.name?.trim() ?? '';
		if (!name) throw new Error(`${label} is missing a name`);
		const itemAmount = assertPositiveInteger(item.amount, `${label} amount`);
		const built: Record<string, unknown> = { name, amount: itemAmount };
		const description = item.description?.trim();
		if (description) built.description = description;
		if (item.quantity !== undefined && item.quantity !== null && String(item.quantity) !== '') {
			built.quantity = assertPositiveInteger(item.quantity, `${label} quantity`);
		}
		return built;
	});

	if (items.length === 0) {
		throw new Error('At least one item is required');
	}

	const itemTotal = items.reduce((sum, item) => sum + Number(item.amount), 0);
	if (itemTotal !== amount) {
		throw new Error(
			`Item amounts (${itemTotal}) must equal the intention amount (${amount}) in minor units`,
		);
	}

	const firstName = input.billing.firstName.trim();
	const lastName = input.billing.lastName.trim();
	const email = input.billing.email.trim();
	const phoneNumber = input.billing.phoneNumber.trim();
	if (!firstName) throw new Error('Billing first name is required');
	if (!lastName) throw new Error('Billing last name is required');
	if (!email.includes('@')) throw new Error('Billing email is required');
	if (!phoneNumber) throw new Error('Billing phone number is required');

	const billingData: Record<string, string> = {
		first_name: firstName,
		last_name: lastName,
		email,
		phone_number: phoneNumber,
	};
	const optionalBilling: Array<[keyof BillingInput, string]> = [
		['apartment', 'apartment'],
		['street', 'street'],
		['building', 'building'],
		['floor', 'floor'],
		['city', 'city'],
		['state', 'state'],
		['country', 'country'],
	];
	for (const [source, target] of optionalBilling) {
		const field = input.billing[source];
		if (typeof field === 'string' && field.trim()) billingData[target] = field.trim();
	}

	const body: Record<string, unknown> = {
		amount,
		currency,
		payment_methods: parsePaymentMethods(input.paymentMethods),
		items,
		billing_data: billingData,
	};

	const specialReference = input.specialReference?.trim();
	if (specialReference) body.special_reference = specialReference;
	if (
		input.expiration !== undefined &&
		input.expiration !== null &&
		String(input.expiration) !== ''
	) {
		body.expiration = assertPositiveInteger(input.expiration, 'Expiration');
	}
	if (input.notificationUrl?.trim()) {
		body.notification_url = assertHttpUrl(input.notificationUrl, 'Notification URL');
	}
	if (input.redirectionUrl?.trim()) {
		body.redirection_url = assertHttpUrl(input.redirectionUrl, 'Redirection URL');
	}
	const extras = parseExtras(input.extras);
	if (extras) body.extras = extras;

	return {
		method: 'POST',
		url: `${baseUrl}/v1/intention/`,
		headers: jsonHeaders(`Token ${credentials.secretKey}`),
		body,
		json: true,
	};
}

export function buildCheckoutUrl(baseUrl: string, publicKey: string, clientSecret: string): string {
	const url = new URL('/unifiedcheckout/', `${normalizeBaseUrl(baseUrl)}/`);
	url.searchParams.set('publicKey', publicKey);
	url.searchParams.set('clientSecret', clientSecret);
	return url.toString();
}

export function buildRefundRequest(
	credentials: PaymobCredentials,
	transactionId: unknown,
	amountCents: unknown,
): PaymobHttpOptions {
	if (!credentials.secretKey)
		throw new Error('Paymob secret key is required to refund a transaction');
	return {
		method: 'POST',
		url: `${normalizeBaseUrl(credentials.region)}/api/acceptance/void_refund/refund`,
		headers: jsonHeaders(`Token ${credentials.secretKey}`),
		body: {
			transaction_id: assertPositiveInteger(transactionId, 'Transaction ID'),
			amount_cents: assertPositiveInteger(amountCents, 'Amount'),
		},
		json: true,
	};
}

export function buildVoidRequest(
	credentials: PaymobCredentials,
	transactionId: unknown,
): PaymobHttpOptions {
	if (!credentials.secretKey)
		throw new Error('Paymob secret key is required to void a transaction');
	return {
		method: 'POST',
		url: `${normalizeBaseUrl(credentials.region)}/api/acceptance/void_refund/void`,
		headers: jsonHeaders(`Token ${credentials.secretKey}`),
		body: {
			transaction_id: assertPositiveInteger(transactionId, 'Transaction ID'),
		},
		json: true,
	};
}

export function buildAuthTokenRequest(credentials: PaymobCredentials): PaymobHttpOptions {
	if (!credentials.apiKey) {
		throw new Error('Paymob API key is required to retrieve a transaction');
	}
	return {
		method: 'POST',
		url: `${normalizeBaseUrl(credentials.region)}/api/auth/tokens`,
		headers: jsonHeaders(),
		body: { api_key: credentials.apiKey },
		json: true,
	};
}

export function buildGetTransactionRequest(
	credentials: PaymobCredentials,
	transactionId: unknown,
	token: string,
): PaymobHttpOptions {
	const id = assertPositiveInteger(transactionId, 'Transaction ID');
	return {
		method: 'GET',
		url: `${normalizeBaseUrl(credentials.region)}/api/acceptance/transactions/${id}`,
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
		json: true,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function executePaymobOperation(
	operation: PaymobOperation,
	credentials: PaymobCredentials,
	input: {
		create?: CreateIntentionInput;
		transactionId?: unknown;
		amountCents?: unknown;
	},
	request: PaymobHttpClient,
): Promise<unknown> {
	if (operation === 'createIntention') {
		if (!input.create) throw new Error('Payment intention details are required');
		const response = await request(buildCreateIntentionRequest(credentials, input.create));
		const publicKey = input.create.publicKey?.trim();
		if (publicKey && isRecord(response) && typeof response.client_secret === 'string') {
			return {
				...response,
				checkout_url: buildCheckoutUrl(credentials.region, publicKey, response.client_secret),
			};
		}
		return response;
	}

	if (operation === 'refund') {
		return request(buildRefundRequest(credentials, input.transactionId, input.amountCents));
	}

	if (operation === 'void') {
		return request(buildVoidRequest(credentials, input.transactionId));
	}

	const authResponse = await request(buildAuthTokenRequest(credentials));
	if (!isRecord(authResponse) || typeof authResponse.token !== 'string' || !authResponse.token) {
		throw new Error('Paymob auth token response did not include a token');
	}
	return request(buildGetTransactionRequest(credentials, input.transactionId, authResponse.token));
}
