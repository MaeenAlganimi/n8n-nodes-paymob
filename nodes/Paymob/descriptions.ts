import type { INodeProperties } from 'n8n-workflow';

const createIntention = { operation: ['createIntention'] };
const refund = { operation: ['refund'] };
const transactionIdOperations = { operation: ['getTransaction', 'refund', 'void'] };

export const paymobOperationDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Create Payment Intention',
				value: 'createIntention',
				action: 'Create a payment intention',
				description: 'Create an Intention API payment and receive a client secret',
			},
			{
				name: 'Get Transaction',
				value: 'getTransaction',
				action: 'Get a transaction',
				description: 'Retrieve a transaction by its Paymob transaction ID',
			},
			{
				name: 'Refund',
				value: 'refund',
				action: 'Refund a transaction',
				description: 'Refund all or part of a successful transaction',
			},
			{
				name: 'Void',
				value: 'void',
				action: 'Void a transaction',
				description: 'Void a card transaction before settlement',
			},
		],
		default: 'createIntention',
	},
];

export const paymobFields: INodeProperties[] = [
	{
		displayName: 'Amount (Minor Units)',
		name: 'amount',
		type: 'number',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		required: true,
		displayOptions: { show: createIntention },
		default: 1000,
		description:
			'Total charged amount in minor units (cents, piastres, or halalas). 1000 is 10.00 in a two-decimal currency.',
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: 'EGP',
		placeholder: 'EGP',
		description: 'ISO currency code. It must match the currency of the selected integration ID.',
	},
	{
		displayName: 'Payment Methods',
		name: 'paymentMethods',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: '',
		placeholder: '158, card',
		description:
			'Comma-separated integration IDs or names. Numeric values are sent as integers. Their live or test status must match the secret key.',
	},
	{
		displayName: 'Special Reference',
		name: 'specialReference',
		type: 'string',
		displayOptions: { show: createIntention },
		default: '',
		description:
			'Unique merchant reference. Paymob returns it on the transaction callback as merchant_order_id.',
	},
	{
		displayName: 'Items',
		name: 'items',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		displayOptions: { show: createIntention },
		default: {},
		placeholder: 'Add Item',
		description:
			'Line items whose amounts, in minor units, must add up to the intention amount. At least one item is required.',
		options: [
			{
				displayName: 'Item',
				name: 'item',
				values: [
					{
						displayName: 'Amount (Minor Units)',
						name: 'amount',
						type: 'number',
						typeOptions: { minValue: 1, numberPrecision: 0 },
						default: 1000,
						description:
							'Item amount in minor units. The maximum name length Paymob accepts is 50 characters.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Optional item description, up to 255 characters',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Item name, up to 50 characters',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						typeOptions: { minValue: 1, numberPrecision: 0 },
						default: 1,
						description: 'Number of units of this item',
					},
				],
			},
		],
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: '',
		description: 'Customer first name, up to 50 characters',
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: '',
		description: 'Customer last name, up to 50 characters',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: '',
		placeholder: 'customer@example.com',
		description: 'Customer email address sent in billing_data',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		displayOptions: { show: createIntention },
		default: '',
		placeholder: '+201000000000',
		description: 'Customer phone number, including the country code',
	},
	{
		displayName: 'Additional Billing Fields',
		name: 'additionalBilling',
		type: 'collection',
		placeholder: 'Add Billing Field',
		displayOptions: { show: createIntention },
		default: {},
		description: 'Optional billing_data fields accepted by the Intention API',
		options: [
			{
				displayName: 'Apartment',
				name: 'apartment',
				type: 'string',
				default: '',
				description: 'Apartment or unit, sent as billing_data.apartment',
			},
			{
				displayName: 'Building',
				name: 'building',
				type: 'string',
				default: '',
				description: 'Building identifier, sent as billing_data.building',
			},
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
				description: 'City, sent as billing_data.city',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				description: 'Country, sent as billing_data.country',
			},
			{
				displayName: 'Floor',
				name: 'floor',
				type: 'string',
				default: '',
				description: 'Floor, sent as billing_data.floor',
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'string',
				default: '',
				description: 'State or governorate, sent as billing_data.state',
			},
			{
				displayName: 'Street',
				name: 'street',
				type: 'string',
				default: '',
				description: 'Street address, sent as billing_data.street',
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: createIntention },
		default: {},
		description:
			'Optional Intention API fields and a public key used only to build the checkout URL',
		options: [
			{
				displayName: 'Expiration (Seconds)',
				name: 'expiration',
				type: 'number',
				typeOptions: { minValue: 1, numberPrecision: 0 },
				default: 3600,
				description: 'How long the intention stays payable, in seconds',
			},
			{
				displayName: 'Extras',
				name: 'extras',
				type: 'json',
				default: '{}',
				description:
					'JSON object of custom values. Paymob returns them on callbacks under the payment key claims.',
			},
			{
				displayName: 'Notification URL',
				name: 'notificationUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/paymob/webhook',
				description:
					'URL that receives the transaction callback. Paymob supports this for card integration IDs.',
			},
			{
				displayName: 'Public Key',
				name: 'publicKey',
				type: 'string',
				default: '',
				description:
					'Paymob public key. When set, the node adds checkout_url for Unified Checkout and does not send the key to Paymob.',
			},
			{
				displayName: 'Redirection URL',
				name: 'redirectionUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/orders/return',
				description:
					'URL the customer returns to after payment. Supported for card and wallet methods.',
			},
		],
	},
	{
		displayName: 'Transaction ID',
		name: 'transactionId',
		type: 'string',
		required: true,
		displayOptions: { show: transactionIdOperations },
		default: '',
		description: 'Paymob transaction ID from a verified callback or a previous node',
	},
	{
		displayName: 'Amount (Minor Units)',
		name: 'amountCents',
		type: 'number',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		required: true,
		displayOptions: { show: refund },
		default: 1000,
		description: 'Amount to refund in minor units. It cannot exceed the remaining captured amount.',
	},
];
