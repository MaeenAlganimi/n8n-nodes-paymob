/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IWebhookFunctions } from 'n8n-workflow';

import { calculateTransactionHmac } from '../nodes/Paymob/hmac';
import { PaymobTrigger } from '../nodes/PaymobTrigger/PaymobTrigger.node.ts';

const secret = 'example-hmac-secret';

const transaction = {
	id: 2556706,
	pending: false,
	amount_cents: 100,
	success: true,
	is_auth: false,
	is_capture: false,
	is_standalone_payment: true,
	is_voided: false,
	is_refunded: false,
	is_3d_secure: true,
	integration_id: 6741,
	has_parent_transaction: false,
	order: { id: 4778239 },
	created_at: '2020-03-25T18:39:44.719228',
	currency: 'EGP',
	source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
	error_occured: false,
	owner: 4705,
};

type FakeResponse = {
	statusCode?: number;
	payload?: unknown;
	status: (code: number) => FakeResponse;
	json: (body: unknown) => void;
};

function createResponse(): FakeResponse {
	const response = {
		statusCode: undefined as number | undefined,
		payload: undefined as unknown,
		status(code: number) {
			response.statusCode = code;
			return response;
		},
		json(body: unknown) {
			response.payload = body;
		},
	};
	return response;
}

function createContext(options: {
	hmac?: string;
	body: unknown;
	events?: string;
	response: FakeResponse;
}) {
	return {
		getCredentials: async () => ({ hmacSecret: secret }),
		getBodyData: () => options.body,
		getQueryData: () => (options.hmac === undefined ? {} : { hmac: options.hmac }),
		getNodeParameter: (name: string) => (name === 'events' ? (options.events ?? 'all') : 'paymob'),
		getResponseObject: () => options.response,
		helpers: {
			returnJsonArray: (data: unknown) => {
				const rows = Array.isArray(data) ? data : [data];
				return rows.map((json) => ({ json }));
			},
		},
	};
}

describe('Paymob Trigger webhook', () => {
	const trigger = new PaymobTrigger();

	it('starts the workflow for a valid HMAC', async () => {
		const response = createResponse();
		const result = await trigger.webhook.call(
			createContext({
				hmac: calculateTransactionHmac(transaction, secret),
				body: { type: 'TRANSACTION', obj: transaction },
				response,
			}) as unknown as IWebhookFunctions,
		);

		assert.equal(response.statusCode, undefined);
		assert.equal(result.workflowData?.[0]?.[0]?.json.transactionId, 2556706);
		assert.equal(result.workflowData?.[0]?.[0]?.json.success, true);
	});

	it('responds 401 and does not start the workflow when the signature is tampered', async () => {
		const response = createResponse();
		const result = await trigger.webhook.call(
			createContext({
				hmac: calculateTransactionHmac(transaction, secret),
				body: { type: 'TRANSACTION', obj: { ...transaction, success: false } },
				events: 'failed',
				response,
			}) as unknown as IWebhookFunctions,
		);

		assert.equal(response.statusCode, 401);
		assert.deepEqual(response.payload, { message: 'Invalid Paymob HMAC signature' });
		assert.equal(result.workflowData, undefined);
		assert.equal(result.noWebhookResponse, true);
	});

	it('responds 401 when the hmac query parameter is missing', async () => {
		const response = createResponse();
		const result = await trigger.webhook.call(
			createContext({
				body: { type: 'TRANSACTION', obj: transaction },
				response,
			}) as unknown as IWebhookFunctions,
		);

		assert.equal(response.statusCode, 401);
		assert.equal(result.workflowData, undefined);
		assert.match(JSON.stringify(response.payload), /missing the hmac/i);
	});
});
