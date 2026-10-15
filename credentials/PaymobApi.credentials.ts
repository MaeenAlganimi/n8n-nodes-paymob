import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { applyPaymobAuth } from '../nodes/Paymob/auth';
import { DEFAULT_PAYMOB_REGION, PAYMOB_REGIONS } from '../nodes/Paymob/constants';

export class PaymobApi implements ICredentialType {
	name = 'paymobApi';

	displayName = 'Paymob API';

	icon: Icon = { light: 'file:../icons/paymob.svg', dark: 'file:../icons/paymob.dark.svg' };

	documentationUrl = 'https://github.com/MaeenAlganimi/n8n-nodes-paymob#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Legacy API key from the Paymob dashboard. Used to mint the bearer token for transaction lookup.',
		},
		{
			displayName: 'Secret Key',
			name: 'secretKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Secret key sent as "Authorization: Token" on the Intention API, refund, and void calls.',
		},
		{
			displayName: 'HMAC Secret',
			name: 'hmacSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'HMAC secret from the Paymob dashboard. Used to verify transaction processed callbacks.',
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			noDataExpression: true,
			options: PAYMOB_REGIONS.map((region) => ({ name: region.name, value: region.value })),
			default: DEFAULT_PAYMOB_REGION,
			description:
				'Accept API host for the merchant country. Egypt (accept.paymob.com) is the default.',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(requestOptions.headers ?? {})) {
			if (typeof value === 'string') headers[key] = value;
		}

		const body =
			requestOptions.body &&
			typeof requestOptions.body === 'object' &&
			!Array.isArray(requestOptions.body)
				? (requestOptions.body as Record<string, unknown>)
				: undefined;

		const authed = applyPaymobAuth(
			{
				apiKey: typeof credentials.apiKey === 'string' ? credentials.apiKey : '',
				secretKey: typeof credentials.secretKey === 'string' ? credentials.secretKey : '',
			},
			{
				method: requestOptions.method,
				url: requestOptions.url,
				baseURL: requestOptions.baseURL,
				headers,
				body,
			},
		);

		requestOptions.headers = authed.headers;
		if (authed.body) requestOptions.body = authed.body;
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			baseURL: '={{$credentials.region}}',
			url: '/api/auth/tokens',
			body: {
				api_key: '={{$credentials.apiKey}}',
			},
		},
	};
}
