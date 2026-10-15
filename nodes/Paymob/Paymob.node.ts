import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import {
	executePaymobOperation,
	type BillingInput,
	type CreateIntentionInput,
	type IntentionItemInput,
	type PaymobCredentials,
	type PaymobHttpOptions,
} from './api';
import type { PaymobOperation } from './constants';
import { paymobFields, paymobOperationDescription } from './descriptions';

function asRecord(value: unknown): IDataObject {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}
	return { data: value as IDataObject['data'] };
}

export class Paymob implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paymob',
		name: 'paymob',
		icon: { light: 'file:../../icons/paymob.svg', dark: 'file:../../icons/paymob.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle:
			'={{ {"createIntention":"Create payment intention","getTransaction":"Get transaction","refund":"Refund","void":"Void"}[$parameter["operation"]] }}',
		description: 'Create Paymob payment intentions and manage transactions',
		defaults: { name: 'Paymob' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'paymobApi', required: true }],
		properties: [...paymobOperationDescription, ...paymobFields],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = (await this.getCredentials('paymobApi')) as unknown as PaymobCredentials;
		const request = (options: PaymobHttpOptions) =>
			this.helpers.httpRequestWithAuthentication.call(this, 'paymobApi', options);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as PaymobOperation;
				const result = await executePaymobOperation(
					operation,
					credentials,
					buildOperationInput(this, itemIndex, operation),
					request,
				);
				returnData.push({ json: asRecord(result), pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					const message = error instanceof Error ? error.message : 'Unknown Paymob error';
					returnData.push({
						json: { error: message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				const statusCode =
					typeof error === 'object' && error !== null && 'statusCode' in error
						? (error as { statusCode?: unknown }).statusCode
						: undefined;

				if (typeof statusCode === 'number') {
					throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
				}

				const normalized = error instanceof Error ? error : new Error(String(error));
				throw new NodeOperationError(this.getNode(), normalized, { itemIndex });
			}
		}

		return [returnData];
	}
}

function buildOperationInput(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: PaymobOperation,
): { create?: CreateIntentionInput; transactionId?: unknown; amountCents?: unknown } {
	if (operation !== 'createIntention') {
		return {
			transactionId: context.getNodeParameter('transactionId', itemIndex),
			amountCents:
				operation === 'refund' ? context.getNodeParameter('amountCents', itemIndex) : undefined,
		};
	}

	const itemsParameter = context.getNodeParameter('items', itemIndex, {}) as {
		item?: IntentionItemInput[];
	};
	const additionalBilling = context.getNodeParameter('additionalBilling', itemIndex, {}) as Omit<
		BillingInput,
		'firstName' | 'lastName' | 'email' | 'phoneNumber'
	>;
	const additionalFields = context.getNodeParameter('additionalFields', itemIndex, {}) as {
		expiration?: number;
		extras?: unknown;
		notificationUrl?: string;
		publicKey?: string;
		redirectionUrl?: string;
	};

	const billing: BillingInput = {
		firstName: context.getNodeParameter('firstName', itemIndex) as string,
		lastName: context.getNodeParameter('lastName', itemIndex) as string,
		email: context.getNodeParameter('email', itemIndex) as string,
		phoneNumber: context.getNodeParameter('phoneNumber', itemIndex) as string,
		...additionalBilling,
	};

	return {
		create: {
			amount: context.getNodeParameter('amount', itemIndex) as number,
			currency: context.getNodeParameter('currency', itemIndex) as string,
			paymentMethods: context.getNodeParameter('paymentMethods', itemIndex) as string,
			specialReference: context.getNodeParameter('specialReference', itemIndex, '') as string,
			items: itemsParameter.item ?? [],
			billing,
			expiration: additionalFields.expiration,
			notificationUrl: additionalFields.notificationUrl,
			redirectionUrl: additionalFields.redirectionUrl,
			extras: additionalFields.extras,
			publicKey: additionalFields.publicKey,
		},
	};
}
