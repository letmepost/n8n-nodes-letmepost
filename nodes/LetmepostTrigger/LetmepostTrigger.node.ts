import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { letmepostApiRequest } from '../Letmepost/transport';

const SIGNATURE_HEADER = 'x-letmepost-signature';
const SIGNATURE_PREFIX = 'sha256=';

export class LetmepostTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Letmepost Trigger',
		name: 'letmepostTrigger',
		icon: 'file:letmepost.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '=Events: {{$parameter["events"].join(", ") || "all"}}',
		description: 'Starts a workflow when letmepost.dev sends a webhook event',
		defaults: {
			name: 'Letmepost Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'letmepostApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: [],
				description:
					'The events to subscribe to. Leave empty to receive every event letmepost.dev sends.',
				options: [
					{ name: 'Post Failed', value: 'post.failed' },
					{ name: 'Post Published', value: 'post.published' },
					{ name: 'Post Queued', value: 'post.queued' },
					{ name: 'Post Rejected', value: 'post.rejected' },
					{ name: 'Post Validated', value: 'post.validated' },
					{ name: 'Token Expiring', value: 'token.expiring' },
					{ name: 'Token Revoked', value: 'token.revoked' },
					{ name: 'Version Deprecated', value: 'version.deprecated' },
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const response = (await letmepostApiRequest.call(
					this,
					'GET',
					'/v1/webhook-endpoints',
				)) as { data?: Array<{ id: string; url: string }> };
				const existing = (response.data ?? []).find((endpoint) => endpoint.url === webhookUrl);

				// Reuse only if we still hold the signing secret — it is returned
				// once at creation and can never be fetched again. If the endpoint
				// exists but we lost the secret, drop it and recreate so we can
				// verify deliveries.
				if (existing && webhookData.signingSecret) {
					webhookData.webhookId = existing.id;
					return true;
				}
				if (existing) {
					try {
						await letmepostApiRequest.call(
							this,
							'DELETE',
							`/v1/webhook-endpoints/${existing.id}`,
						);
					} catch {
						// Best-effort cleanup; create() will register a fresh endpoint.
					}
				}
				delete webhookData.webhookId;
				delete webhookData.signingSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					return false;
				}
				const events = this.getNodeParameter('events', []) as string[];
				const response = (await letmepostApiRequest.call(this, 'POST', '/v1/webhook-endpoints', {
					url: webhookUrl,
					events,
					description: 'Created by n8n (Letmepost Trigger).',
				})) as { id?: string; signingSecret?: string };

				if (!response.id || !response.signingSecret) {
					return false;
				}
				const webhookData = this.getWorkflowStaticData('node');
				webhookData.webhookId = response.id;
				webhookData.signingSecret = response.signingSecret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId) {
					try {
						await letmepostApiRequest.call(
							this,
							'DELETE',
							`/v1/webhook-endpoints/${webhookData.webhookId}`,
						);
					} catch {
						return false;
					}
					delete webhookData.webhookId;
					delete webhookData.signingSecret;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer | string };
		const resp = this.getResponseObject();
		const headers = this.getHeaderData() as IDataObject;
		const webhookData = this.getWorkflowStaticData('node');
		const signingSecret = webhookData.signingSecret as string | undefined;

		const signature = headers[SIGNATURE_HEADER] as string | undefined;
		const rawBody = req.rawBody;

		if (!signingSecret) {
			resp.status(401).json({ message: 'Webhook is not registered with a signing secret.' });
			return { noWebhookResponse: true };
		}
		if (rawBody === undefined) {
			resp.status(400).json({ message: 'Missing raw request body for signature verification.' });
			return { noWebhookResponse: true };
		}
		if (!verifySignature(rawBody, signature, signingSecret)) {
			resp.status(401).json({ message: 'Signature verification failed.' });
			return { noWebhookResponse: true };
		}

		const bodyText = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
		let event: IDataObject;
		try {
			event = JSON.parse(bodyText) as IDataObject;
		} catch {
			resp.status(400).json({ message: 'Webhook body was not valid JSON.' });
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(event)],
		};
	}
}

function verifySignature(
	rawBody: Buffer | string,
	signature: string | undefined,
	secret: string,
): boolean {
	if (typeof signature !== 'string' || signature.length === 0) return false;
	if (typeof secret !== 'string' || secret.length === 0) return false;

	const bodyBytes = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const digest = createHmac('sha256', secret).update(bodyBytes).digest('hex');
	const expected = `${SIGNATURE_PREFIX}${digest}`;
	const presented = signature.startsWith(SIGNATURE_PREFIX)
		? signature
		: `${SIGNATURE_PREFIX}${signature}`;

	if (expected.length !== presented.length) return false;
	try {
		return timingSafeEqual(Buffer.from(expected), Buffer.from(presented));
	} catch {
		return false;
	}
}
