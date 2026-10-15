import {
	NodeConnectionTypes,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IDataObject,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import type { EventFilter } from '../Paymob/constants';
import { decideTransactionCallback, readHmacQuery } from '../Paymob/hmac';

export class PaymobTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paymob Trigger',
		name: 'paymobTrigger',
		icon: { light: 'file:../../icons/paymob.svg', dark: 'file:../../icons/paymob.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle:
			'={{ $parameter["events"] === "success" ? "Successful transactions" : $parameter["events"] === "failed" ? "Failed transactions" : "All transactions" }}',
		description: 'Start a workflow from a Paymob transaction processed callback',
		defaults: { name: 'Paymob Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'paymobApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: '={{$parameter["path"]}}',
			},
		],
		properties: [
			{
				displayName:
					'Copy the production URL into the intention notification URL, or into the Paymob dashboard transaction callback. Invalid HMAC signatures are rejected and do not start the workflow.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'All Transactions',
						value: 'all',
						description: 'Run for every callback whose HMAC signature is valid',
					},
					{
						name: 'Failed Only',
						value: 'failed',
						description: 'Run only when the verified transaction has success set to false',
					},
					{
						name: 'Successful Only',
						value: 'success',
						description: 'Run only when the verified transaction has success set to true',
					},
				],
				default: 'all',
				description: 'Which verified transaction callbacks should start the workflow',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: 'paymob',
				required: true,
				placeholder: 'paymob',
				description: 'Path segment appended to the generated n8n webhook URL',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				// Paymob callback URLs are saved in the dashboard or on each intention.
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('paymobApi');
		const query = this.getQueryData() as Record<string, unknown>;
		const decision = decideTransactionCallback({
			body: this.getBodyData(),
			hmac: readHmacQuery(query),
			secret: typeof credentials.hmacSecret === 'string' ? credentials.hmacSecret : '',
			filter: this.getNodeParameter('events') as EventFilter,
		});

		if (decision.action === 'accept') {
			return {
				workflowData: [this.helpers.returnJsonArray([decision.payload as IDataObject])],
			};
		}

		const response = this.getResponseObject();
		response.status(decision.statusCode).json(decision.body);
		return { noWebhookResponse: true };
	}
}
