import { createHmac, timingSafeEqual } from 'node:crypto';

import { TRANSACTION_HMAC_FIELDS, type EventFilter } from './constants';

export type CallbackDecision =
	| {
			action: 'accept';
			payload: Record<string, unknown>;
	  }
	| {
			action: 'ignore';
			statusCode: 200;
			body: { message: string };
	  }
	| {
			action: 'reject';
			statusCode: 400 | 401;
			body: { message: string };
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(source: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((current, key) => {
		if (!isRecord(current)) return undefined;
		return current[key];
	}, source);
}

/** Booleans become the literals `true` and `false`, matching Paymob's published sample string. */
export function stringifyHmacValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value === 'string') return value;
	return '';
}

export function buildTransactionHmacString(transaction: Record<string, unknown>): string {
	return TRANSACTION_HMAC_FIELDS.map((field) =>
		stringifyHmacValue(readPath(transaction, field)),
	).join('');
}

export function calculateTransactionHmac(
	transaction: Record<string, unknown>,
	secret: string,
): string {
	return createHmac('sha512', secret).update(buildTransactionHmacString(transaction)).digest('hex');
}

export function verifyTransactionHmac(
	transaction: Record<string, unknown>,
	secret: string,
	received: string | undefined,
): boolean {
	if (!secret || !received) return false;

	const expected = calculateTransactionHmac(transaction, secret);
	const actual = received.trim().toLowerCase();
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const actualBuffer = Buffer.from(actual, 'utf8');
	if (expectedBuffer.length !== actualBuffer.length) return false;
	return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function readHmacQuery(query: Record<string, unknown>): string | undefined {
	const value = query.hmac ?? query.HMAC;
	if (typeof value === 'string') return value;
	if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
	return undefined;
}

function extractTransaction(body: unknown): {
	callback: Record<string, unknown>;
	transaction: Record<string, unknown>;
} | null {
	if (!isRecord(body)) return null;
	if (isRecord(body.obj)) {
		return { callback: body, transaction: body.obj };
	}
	if ('amount_cents' in body && 'id' in body) {
		return { callback: body, transaction: body };
	}
	return null;
}

function matchesFilter(success: unknown, filter: EventFilter): boolean {
	if (filter === 'all') return true;
	if (filter === 'success') return success === true || success === 'true';
	return success === false || success === 'false';
}

export function decideTransactionCallback(options: {
	body: unknown;
	hmac: string | undefined;
	secret: string;
	filter: EventFilter;
}): CallbackDecision {
	const extracted = extractTransaction(options.body);
	if (!extracted) {
		return {
			action: 'reject',
			statusCode: 400,
			body: { message: 'Paymob callback is missing the transaction object' },
		};
	}

	if (!options.secret) {
		return {
			action: 'reject',
			statusCode: 401,
			body: { message: 'Paymob HMAC secret is not configured' },
		};
	}

	if (!options.hmac) {
		return {
			action: 'reject',
			statusCode: 401,
			body: { message: 'Paymob callback is missing the hmac query parameter' },
		};
	}

	if (!verifyTransactionHmac(extracted.transaction, options.secret, options.hmac)) {
		return {
			action: 'reject',
			statusCode: 401,
			body: { message: 'Invalid Paymob HMAC signature' },
		};
	}

	if (!matchesFilter(extracted.transaction.success, options.filter)) {
		return {
			action: 'ignore',
			statusCode: 200,
			body: { message: 'Callback ignored by the Paymob Trigger event filter' },
		};
	}

	const order = extracted.transaction.order;
	return {
		action: 'accept',
		payload: {
			type: typeof extracted.callback.type === 'string' ? extracted.callback.type : 'TRANSACTION',
			transactionId: extracted.transaction.id,
			success: extracted.transaction.success === true || extracted.transaction.success === 'true',
			pending: extracted.transaction.pending === true || extracted.transaction.pending === 'true',
			amountCents: extracted.transaction.amount_cents,
			currency: extracted.transaction.currency,
			orderId: isRecord(order) ? order.id : undefined,
			transaction: extracted.transaction,
			callback: extracted.callback,
		},
	};
}
