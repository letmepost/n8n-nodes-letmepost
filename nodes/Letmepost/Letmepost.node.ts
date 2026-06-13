import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { letmepostApiRequest, letmepostApiRequestAllItems } from './transport';

const PLATFORM_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Bluesky', value: 'bluesky' },
	{ name: 'Facebook', value: 'facebook' },
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'LinkedIn', value: 'linkedin' },
	{ name: 'Pinterest', value: 'pinterest' },
	{ name: 'Threads', value: 'threads' },
	{ name: 'TikTok', value: 'tiktok' },
	{ name: 'Twitter / X', value: 'twitter' },
];

const STATUS_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Failed', value: 'failed' },
	{ name: 'Published', value: 'published' },
	{ name: 'Publishing', value: 'publishing' },
	{ name: 'Queued', value: 'queued' },
	{ name: 'Rejected', value: 'rejected' },
	{ name: 'Validated', value: 'validated' },
];

export class Letmepost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Letmepost',
		name: 'letmepost',
		icon: 'file:letmepost.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Publish to social platforms through the letmepost.dev API',
		defaults: {
			name: 'Letmepost',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'letmepostApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Media', value: 'media' },
					{ name: 'Post', value: 'post' },
				],
				default: 'post',
			},

			// ─── Post operations ────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['post'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a post',
						description: 'Retrieve a single post and its attempt history',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many posts',
						description: 'Retrieve many posts with optional filters',
					},
					{
						name: 'Publish',
						value: 'publish',
						action: 'Publish a post',
						description: 'Create and publish a post to one or more connected accounts',
					},
				],
				default: 'publish',
			},

			// ─── Account operations ─────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['account'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many accounts',
						description: 'List the social accounts connected to your organization',
					},
				],
				default: 'getAll',
			},

			// ─── Media operations ───────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['media'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many media assets',
						description: 'List previously uploaded media assets',
					},
				],
				default: 'getAll',
			},

			// ─── Post: Publish ──────────────────────────────────────────────
			{
				displayName: 'Account Names or IDs',
				name: 'accountIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				required: true,
				default: [],
				description:
					'The connected accounts to publish to. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['publish'],
					},
				},
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'The post text, applied to every selected account',
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['publish'],
					},
				},
			},
			{
				displayName: 'Media',
				name: 'media',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Media',
				default: {},
				description: 'Images or videos to attach to the post',
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['publish'],
					},
				},
				options: [
					{
						name: 'item',
						displayName: 'Media Item',
						values: [
							{
								displayName: 'Alt Text',
								name: 'altText',
								type: 'string',
								default: '',
								description: 'Accessibility description for the asset',
							},
							{
								displayName: 'Input Binary Field',
								name: 'binaryPropertyName',
								type: 'string',
								default: 'data',
								hint: 'The name of the input binary field containing the file',
								description: 'The binary property to read the media from and send inline',
								displayOptions: { show: { source: ['binary'] } },
							},
							{
								displayName: 'Media ID',
								name: 'mediaId',
								type: 'string',
								default: '',
								placeholder: 'med_…',
								description: 'ID of a media asset already uploaded to letmepost.dev',
								displayOptions: { show: { source: ['mediaId'] } },
							},
							{
								displayName: 'Source',
								name: 'source',
								type: 'options',
								options: [
									{
										name: 'URL',
										value: 'url',
									},
									{
										name: 'Binary Property',
										value: 'binary',
									},
									{
										name: 'Media ID',
										value: 'mediaId',
									},
								],
								default: 'url',
								description: 'Where to read the media from',
							},
							{
								displayName: 'Type',
								name: 'kind',
								type: 'options',
								options: [
									{
										name: 'Image',
										value: 'image',
									},
									{
										name: 'Video',
										value: 'video',
									},
								],
								default: 'image',
								description: 'Whether the asset is an image or a video',
							},
							{
								displayName: 'URL',
								name: 'url',
								type: 'string',
								default: '',
								placeholder: 'https://example.com/image.jpg',
								description: 'Public URL of the media asset',
								displayOptions: { show: { source: ['url'] } },
							},
						],
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['publish'],
					},
				},
				options: [
					{
						displayName: 'First Comment',
						name: 'firstComment',
						type: 'string',
						typeOptions: {
							rows: 2,
						},
						default: '',
						description:
							'Text posted as the first comment after publishing, where the platform supports it',
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						description:
							'A unique key so retries never publish twice. Reuse the same key to safely retry a failed run.',
					},
					{
						displayName: 'Profile ID',
						name: 'profileId',
						type: 'string',
						default: '',
						description: 'The profile to publish under, for organizations with multiple profiles',
					},
					{
						displayName: 'Publish Now',
						name: 'publishNow',
						type: 'boolean',
						default: true,
						description: 'Whether to publish immediately. Turn off and set a schedule to queue it.',
					},
					{
						displayName: 'Schedule At',
						name: 'scheduledAt',
						type: 'dateTime',
						default: '',
						description: 'When to publish the post. Leave empty to publish immediately.',
					},
				],
			},

			// ─── Post: Get ──────────────────────────────────────────────────
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'post_…',
				description: 'The ID of the post to retrieve',
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['get'],
					},
				},
			},

			// ─── Shared: Get Many ───────────────────────────────────────────
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: {
						operation: ['getAll'],
						resource: ['post', 'media'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						operation: ['getAll'],
						resource: ['post', 'media'],
						returnAll: [false],
					},
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['getAll'],
					},
				},
				options: [
					{
						displayName: 'Error Code',
						name: 'errorCode',
						type: 'string',
						default: '',
						description: 'Only return posts that failed with this error code',
					},
					{
						displayName: 'Platforms',
						name: 'platform',
						type: 'multiOptions',
						options: PLATFORM_OPTIONS,
						default: [],
						description: 'Only return posts on these platforms',
					},
					{
						displayName: 'Profile ID',
						name: 'profileId',
						type: 'string',
						default: '',
						description: 'Only return posts under this profile',
					},
					{
						displayName: 'Statuses',
						name: 'status',
						type: 'multiOptions',
						options: STATUS_OPTIONS,
						default: [],
						description: 'Only return posts in these statuses',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['account', 'media'],
						operation: ['getAll'],
					},
				},
				options: [
					{
						displayName: 'Profile ID',
						name: 'profileId',
						type: 'string',
						default: '',
						description: 'Only return results under this profile',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = (await letmepostApiRequest.call(this, 'GET', '/v1/accounts')) as {
					data?: Array<{
						id: string;
						platform: string;
						displayName: string | null;
						platformAccountId: string;
					}>;
				};
				const accounts = response.data ?? [];
				return accounts.map((account) => {
					const label = account.displayName ?? account.platformAccountId;
					return {
						name: `${label} (${account.platform})`,
						value: account.id,
					};
				});
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[];

				if (resource === 'post' && operation === 'publish') {
					responseData = await publishPost.call(this, i);
				} else if (resource === 'post' && operation === 'get') {
					const postId = this.getNodeParameter('postId', i) as string;
					responseData = (await letmepostApiRequest.call(
						this,
						'GET',
						`/v1/posts/${encodeURIComponent(postId)}`,
					)) as IDataObject;
				} else if (resource === 'post' && operation === 'getAll') {
					responseData = await getManyPosts.call(this, i);
				} else if (resource === 'account' && operation === 'getAll') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const qs: IDataObject = {};
					if (filters.profileId) qs.profileId = filters.profileId;
					const response = (await letmepostApiRequest.call(
						this,
						'GET',
						'/v1/accounts',
						{},
						qs,
					)) as { data?: IDataObject[] };
					responseData = response.data ?? [];
				} else if (resource === 'media' && operation === 'getAll') {
					responseData = await getManyMedia.call(this, i);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}".`,
						{ itemIndex: i },
					);
				}

				const results = Array.isArray(responseData) ? responseData : [responseData];
				for (const json of results) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

async function publishPost(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const accountIds = this.getNodeParameter('accountIds', i) as string[];
	if (accountIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Select at least one account to publish to.', {
			itemIndex: i,
		});
	}

	const text = this.getNodeParameter('text', i, '') as string;
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const mediaParam = this.getNodeParameter('media', i, {}) as {
		item?: Array<{
			kind: string;
			source: string;
			url?: string;
			binaryPropertyName?: string;
			mediaId?: string;
			altText?: string;
		}>;
	};

	const body: IDataObject = {
		targets: accountIds.map((id) => ({ accountId: id })),
	};

	if (text) {
		body.text = text;
	}

	const mediaItems = mediaParam.item ?? [];
	if (mediaItems.length > 0) {
		const media: IDataObject[] = [];
		for (const item of mediaItems) {
			const entry: IDataObject = { kind: item.kind };
			if (item.altText) {
				entry.altText = item.altText;
			}
			if (item.source === 'url') {
				if (!item.url) {
					throw new NodeOperationError(this.getNode(), 'A media URL is required.', {
						itemIndex: i,
					});
				}
				entry.url = item.url;
			} else if (item.source === 'mediaId') {
				if (!item.mediaId) {
					throw new NodeOperationError(this.getNode(), 'A media ID is required.', {
						itemIndex: i,
					});
				}
				entry.mediaId = item.mediaId;
			} else {
				const binaryPropertyName = item.binaryPropertyName || 'data';
				const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
				entry.bytesBase64 = buffer.toString('base64');
			}
			media.push(entry);
		}
		body.media = media;
	}

	if (additionalFields.firstComment) {
		body.firstComment = { text: additionalFields.firstComment };
	}
	if (additionalFields.profileId) {
		body.profileId = additionalFields.profileId;
	}
	if (additionalFields.scheduledAt) {
		body.scheduledAt = additionalFields.scheduledAt;
		body.publishNow = false;
	} else if (additionalFields.publishNow !== undefined) {
		body.publishNow = additionalFields.publishNow;
	}

	const options: { headers?: IDataObject } = {};
	if (additionalFields.idempotencyKey) {
		options.headers = { 'Idempotency-Key': additionalFields.idempotencyKey as string };
	}

	return (await letmepostApiRequest.call(
		this,
		'POST',
		'/v1/posts',
		body,
		{},
		options,
	)) as IDataObject;
}

async function getManyPosts(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	const qs: IDataObject = {};
	if (filters.profileId) qs.profileId = filters.profileId;
	if (Array.isArray(filters.platform) && filters.platform.length > 0)
		qs.platform = filters.platform;
	if (Array.isArray(filters.status) && filters.status.length > 0) qs.status = filters.status;
	if (filters.errorCode) qs.errorCode = filters.errorCode;

	if (returnAll) {
		return letmepostApiRequestAllItems.call(this, 'GET', '/v1/posts', qs);
	}

	const limit = this.getNodeParameter('limit', i) as number;
	qs.limit = limit;
	const response = (await letmepostApiRequest.call(this, 'GET', '/v1/posts', {}, qs)) as {
		data?: IDataObject[];
	};
	return (response.data ?? []).slice(0, limit);
}

async function getManyMedia(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	const qs: IDataObject = {};
	if (filters.profileId) qs.profileId = filters.profileId;

	if (returnAll) {
		return letmepostApiRequestAllItems.call(this, 'GET', '/v1/media', qs);
	}

	const limit = this.getNodeParameter('limit', i) as number;
	qs.limit = limit;
	const response = (await letmepostApiRequest.call(this, 'GET', '/v1/media', {}, qs)) as {
		data?: IDataObject[];
	};
	return (response.data ?? []).slice(0, limit);
}
