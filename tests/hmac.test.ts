/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { TRANSACTION_HMAC_FIELDS } from '../nodes/Paymob/constants';
import {
	buildTransactionHmacString,
	calculateTransactionHmac,
	decideTransactionCallback,
	verifyTransactionHmac,
} from '../nodes/Paymob/hmac';

const secret = 'example-hmac-secret';

const documentedTransaction = {
	id: 192036465,
	pending: false,
	amount_cents: 100000,
	success: true,
	is_auth: false,
	is_capture: false,
	is_standalone_payment: true,
	is_voided: false,
	is_refunded: false,
	is_3d_secure: true,
	integration_id: 4097558,
	has_parent_transaction: false,
	order: { id: 217503754 },
	created_at: '2024-06-13T11:33:44.592345',
	currency: 'EGP',
	source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
	error_occured: false,
	owner: 302852,
};

const documentedConcatenation =
	'1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue';

function signedCallback(transaction: Record<string, unknown>, hmacSecret = secret) {
	const hmac = calculateTransactionHmac(transaction, hmacSecret);
	return {
		body: { type: 'TRANSACTION', obj: transaction },
		hmac,
	};
}

describe('Paymob transaction HMAC', () => {
	it('concatenates the documented field order for the published sample', () => {
		assert.deepEqual(TRANSACTION_HMAC_FIELDS, [
			'amount_cents',
			'created_at',
			'currency',
			'error_occured',
			'has_parent_transaction',
			'id',
			'integration_id',
			'is_3d_secure',
			'is_auth',
			'is_capture',
			'is_refunded',
			'is_standalone_payment',
			'is_voided',
			'order.id',
			'owner',
			'pending',
			'source_data.pan',
			'source_data.sub_type',
			'source_data.type',
			'success',
		]);
		assert.equal(buildTransactionHmacString(documentedTransaction), documentedConcatenation);
	});

	it('accepts a valid SHA-512 signature', () => {
		const { body, hmac } = signedCallback(documentedTransaction);
		const decision = decideTransactionCallback({
			body,
			hmac,
			secret,
			filter: 'all',
		});

		assert.equal(decision.action, 'accept');
		assert.equal(
			calculateTransactionHmac(documentedTransaction, secret),
			createHmac('sha512', secret).update(documentedConcatenation).digest('hex'),
		);
		assert.equal(verifyTransactionHmac(documentedTransaction, secret, hmac.toUpperCase()), true);
		if (decision.action === 'accept') {
			assert.equal(decision.payload.transactionId, 192036465);
			assert.equal(decision.payload.success, true);
			assert.equal(decision.payload.orderId, 217503754);
		}
	});

	it('rejects a tampered callback', () => {
		const { hmac } = signedCallback(documentedTransaction);
		const tampered = { ...documentedTransaction, amount_cents: 100 };
		const decision = decideTransactionCallback({
			body: { type: 'TRANSACTION', obj: tampered },
			hmac,
			secret,
			filter: 'all',
		});

		assert.equal(verifyTransactionHmac(tampered, secret, hmac), false);
		assert.deepEqual(decision, {
			action: 'reject',
			statusCode: 401,
			body: { message: 'Invalid Paymob HMAC signature' },
		});
	});

	it('rejects a missing signature before applying the event filter', () => {
		const decision = decideTransactionCallback({
			body: { type: 'TRANSACTION', obj: { ...documentedTransaction, success: false } },
			hmac: undefined,
			secret,
			filter: 'failed',
		});

		assert.equal(decision.action, 'reject');
		if (decision.action === 'reject') {
			assert.equal(decision.statusCode, 401);
			assert.match(decision.body.message, /missing the hmac/i);
		}
	});

	it('ignores a verified callback that does not match the success filter', () => {
		const failed = { ...documentedTransaction, success: false };
		const { body, hmac } = signedCallback(failed);
		const decision = decideTransactionCallback({ body, hmac, secret, filter: 'success' });
		assert.equal(decision.action, 'ignore');
		if (decision.action === 'ignore') assert.equal(decision.statusCode, 200);
	});
});
