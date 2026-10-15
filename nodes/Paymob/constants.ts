export const PAYMOB_REGIONS = [
	{ name: 'Egypt', value: 'https://accept.paymob.com' },
	{ name: 'KSA', value: 'https://ksa.paymob.com' },
	{ name: 'Oman', value: 'https://oman.paymob.com' },
	{ name: 'Pakistan', value: 'https://pakistan.paymob.com' },
	{ name: 'UAE', value: 'https://uae.paymob.com' },
] as const;

export const DEFAULT_PAYMOB_REGION = 'https://accept.paymob.com';

export const PAYMOB_REGION_URLS = new Set<string>(PAYMOB_REGIONS.map((region) => region.value));

/**
 * Paymob transaction-processed callback fields, in the documented concatenation order.
 * `error_occured` keeps Paymob's spelling. Nested keys are read from `order` and `source_data`.
 * https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
 */
export const TRANSACTION_HMAC_FIELDS = [
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
] as const;

export type PaymobOperation = 'createIntention' | 'getTransaction' | 'refund' | 'void';

export type EventFilter = 'all' | 'failed' | 'success';
