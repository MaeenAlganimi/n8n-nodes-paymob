/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IExecuteFunctions } from 'n8n-workflow';

import {
	buildCheckoutUrl,
	executePaymobOperation,
	type PaymobCredentials,
	type PaymobHttpOptions,
} from '../nodes/Paymob/api';
import { applyPaymobAuth } from '../nodes/Paymob/auth';
import { Paymob } from '../nodes/Paymob/Paymob.node.ts';

const credentials: PaymobCredentials = {
	apiKey: 'example-api-key',
	secretKey: 'example-secret-key',
	hmacSecret: 'example-hmac-secret',
	region: 'https://uae.paymob.com',
};

const intentionInput = {
	amount: 2000,
	currency: 'aed',
	paymentMethods: '158, card',
	specialReference: 'order-42',
	items: [{ name: 'Brass dallah', amount: 2000, description: 'Small pot', quantity: 1 }],
	billing: {
		firstName: 'Layla',
		lastName: 'Hassan',
		email: 'customer@example.com',
		phoneNumber: '+971500000000',
		city: 'Dubai',
		country: 'AE',
	},
	expiration: 3600,
	notificationUrl: 'https://example.com/paymob',
	publicKey: 'pk_example',
};

describe('Paymob request building', () => {
	it('builds an Intention API request and checkout URL', async () => {
		const calls: PaymobHttpOptions[] = [];
		const result = await executePaymobOperation(
			'createIntention',
			credentials,
			{ create: intentionInput },
			async (request) => {
				calls.push(request);
				return { id: 'pi_example', client_secret: 'cs_example', intention_order_id: 99 };
			},
		);

		assert.equal(calls.length, 1);
		assert.equal(calls[0]?.method, 'POST');
		assert.equal(calls[0]?.url, 'https://uae.paymob.com/v1/intention/');
		assert.equal(calls[0]?.headers?.Authorization, 'Token example-secret-key');
		assert.deepEqual(calls[0]?.body, {
			amount: 2000,
			currency: 'AED',
			payment_methods: [158, 'card'],
			items: [{ name: 'Brass dallah', amount: 2000, description: 'Small pot', quantity: 1 }],
			billing_data: {
				first_name: 'Layla',
				last_name: 'Hassan',
				email: 'customer@example.com',
				phone_number: '+971500000000',
				city: 'Dubai',
				country: 'AE',
			},
			special_reference: 'order-42',
			expiration: 3600,
			notification_url: 'https://example.com/paymob',
		});
		assert.equal(
			(result as { checkout_url: string }).checkout_url,
			buildCheckoutUrl('https://uae.paymob.com', 'pk_example', 'cs_example'),
		);
	});

	it('rejects an intention whose items do not add up to the amount', async () => {
		await assert.rejects(
			() =>
				executePaymobOperation(
					'createIntention',
					credentials,
					{ create: { ...intentionInput, amount: 1500 } },
					async () => ({}),
				),
			/Item amounts \(2000\) must equal the intention amount \(1500\)/,
		);
	});

	it('builds refund and void requests with the secret key', async () => {
		const calls: PaymobHttpOptions[] = [];
		const http = async (request: PaymobHttpOptions) => {
			calls.push(request);
			return { success: true };
		};

		await executePaymobOperation(
			'refund',
			credentials,
			{ transactionId: '55', amountCents: 250 },
			http,
		);
		await executePaymobOperation('void', credentials, { transactionId: 55 }, http);

		assert.equal(calls[0]?.url, 'https://uae.paymob.com/api/acceptance/void_refund/refund');
		assert.deepEqual(calls[0]?.body, { transaction_id: 55, amount_cents: 250 });
		assert.equal(calls[0]?.headers?.Authorization, 'Token example-secret-key');
		assert.equal(calls[1]?.url, 'https://uae.paymob.com/api/acceptance/void_refund/void');
		assert.deepEqual(calls[1]?.body, { transaction_id: 55 });
	});

	it('mints an auth token and then gets the transaction with a bearer token', async () => {
		const calls: PaymobHttpOptions[] = [];
		const result = await executePaymobOperation(
			'getTransaction',
			{ ...credentials, region: 'https://accept.paymob.com' },
			{ transactionId: '130837277' },
			async (request) => {
				calls.push(request);
				if (request.url.endsWith('/api/auth/tokens')) return { token: 'minted-token' };
				return { id: 130837277, success: true };
			},
		);

		assert.equal(calls[0]?.method, 'POST');
		assert.equal(calls[0]?.url, 'https://accept.paymob.com/api/auth/tokens');
		assert.deepEqual(calls[0]?.body, { api_key: 'example-api-key' });
		assert.equal(calls[0]?.headers?.Authorization, undefined);
		assert.equal(calls[1]?.method, 'GET');
		assert.equal(calls[1]?.url, 'https://accept.paymob.com/api/acceptance/transactions/130837277');
		assert.equal(calls[1]?.headers?.Authorization, 'Bearer minted-token');
		assert.deepEqual(result, { id: 130837277, success: true });
	});

	it('keeps a bearer token and adds the secret-key token header only when missing', () => {
		const preserved = applyPaymobAuth(
			{ apiKey: 'example-api-key', secretKey: 'example-secret-key' },
			{
				method: 'GET',
				url: 'https://oman.paymob.com/api/acceptance/transactions/9',
				headers: { Authorization: 'Bearer minted-token' },
			},
		);
		assert.equal(preserved.headers?.Authorization, 'Bearer minted-token');

		const signed = applyPaymobAuth(
			{ apiKey: 'example-api-key', secretKey: 'example-secret-key' },
			{ method: 'POST', url: 'https://ksa.paymob.com/v1/intention/', body: { amount: 10 } },
		);
		assert.equal(signed.headers?.Authorization, 'Token example-secret-key');

		const auth = applyPaymobAuth(
			{ apiKey: 'example-api-key', secretKey: 'example-secret-key' },
			{
				method: 'POST',
				url: 'https://pakistan.paymob.com/api/auth/tokens',
				headers: { Authorization: 'Token should-be-removed' },
				body: {},
			},
		);
		assert.equal(auth.headers?.Authorization, undefined);
		assert.equal(auth.body?.api_key, 'example-api-key');
	});

	it('sends the built intention request through the node HTTP helper', async () => {
		const calls: Array<{ credentialType: string; options: PaymobHttpOptions }> = [];
		const node = new Paymob();
		const parameters: Record<string, unknown> = {
			operation: 'createIntention',
			amount: 2000,
			currency: 'AED',
			paymentMethods: '158, card',
			specialReference: 'order-42',
			items: {
				item: [{ name: 'Brass dallah', amount: 2000, description: 'Small pot', quantity: 1 }],
			},
			firstName: 'Layla',
			lastName: 'Hassan',
			email: 'customer@example.com',
			phoneNumber: '+971500000000',
			additionalBilling: { city: 'Dubai', country: 'AE' },
			additionalFields: {
				expiration: 3600,
				notificationUrl: 'https://example.com/paymob',
				publicKey: 'pk_example',
			},
		};

		const context = {
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
				name in parameters ? parameters[name] : fallback,
			getCredentials: async () => credentials,
			continueOnFail: () => false,
			getNode: () => ({ name: 'Paymob', type: 'n8n-nodes-paymob.paymob' }),
			helpers: {
				httpRequestWithAuthentication: async (
					credentialType: string,
					options: PaymobHttpOptions,
				) => {
					calls.push({ credentialType, options });
					return { id: 'pi_example', client_secret: 'cs_example' };
				},
			},
		};

		const output = await node.execute.call(context as unknown as IExecuteFunctions);
		assert.equal(calls.length, 1);
		assert.equal(calls[0]?.credentialType, 'paymobApi');
		assert.equal(calls[0]?.options.url, 'https://uae.paymob.com/v1/intention/');
		assert.equal(calls[0]?.options.headers?.Authorization, 'Token example-secret-key');
		assert.equal(calls[0]?.options.body?.currency, 'AED');
		assert.equal(
			output[0]?.[0]?.json.checkout_url?.toString().includes('clientSecret=cs_example'),
			true,
		);
		assert.deepEqual(output[0]?.[0]?.pairedItem, { item: 0 });
	});
});
