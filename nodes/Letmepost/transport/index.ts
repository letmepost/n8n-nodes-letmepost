import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type LetmepostContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

const DEFAULT_BASE_URL = 'https://api.letmepost.dev';

/**
 * Make an authenticated request against the letmepost.dev API. The
 * `letmepostApi` credential injects the `Authorization: Bearer` header, so the
 * API key never has to be touched here. Errors are mapped to NodeApiError with
 * the transparent error envelope (rule + remediation) surfaced to the user.
 */
export async function letmepostApiRequest(
	this: LetmepostContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
	options: Partial<IHttpRequestOptions> = {},
): Promise<JsonObject> {
	const credentials = await this.getCredentials('letmepostApi');
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const requestOptions: IHttpRequestOptions = {
		...options,
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		headers: { Accept: 'application/json', ...(options.headers ?? {}) },
	};

	if (Object.keys(body).length > 0) {
		requestOptions.body = body;
	}
	if (Object.keys(query).length > 0) {
		requestOptions.qs = query;
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'letmepostApi',
			requestOptions,
		)) as JsonObject;
	} catch (error) {
		throw toNodeApiError.call(this, error);
	}
}

/**
 * Walk the cursor-paginated list endpoints (`{ data, nextCursor }`) and collect
 * every item. Used by the "Return All" toggle on list operations.
 */
export async function letmepostApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	query: IDataObject = {},
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;

	do {
		const pageQuery: IDataObject = { ...query };
		if (cursor) {
			pageQuery.cursor = cursor;
		}
		const response = (await letmepostApiRequest.call(this, method, endpoint, {}, pageQuery)) as {
			data?: IDataObject[];
			nextCursor?: string | null;
		};
		if (Array.isArray(response.data)) {
			items.push(...response.data);
		}
		cursor = response.nextCursor ?? undefined;
	} while (cursor);

	return items;
}

interface LetmepostErrorEnvelope {
	code: string;
	message: string;
	rule?: string;
	remediation?: string;
	platform?: string;
	docUrl?: string;
	requestId?: string;
}

const CODE_TITLES: Record<string, string> = {
	validation_failed: 'Validation failed',
	preflight_failed: 'Preflight check failed',
	platform_auth_failed: 'Platform authentication failed',
	platform_rejected: 'Platform rejected the post',
	platform_unavailable: 'Platform temporarily unavailable',
	platform_not_enabled: 'Platform not enabled',
	internal_error: 'Internal error',
	unauthenticated: 'Authentication failed',
	unauthorized: 'Not authorized',
	not_found: 'Not found',
	idempotency_conflict: 'Idempotency conflict',
	rate_limited: 'Rate limited',
};

function toNodeApiError(this: LetmepostContext, error: unknown): NodeApiError {
	const err = error as {
		statusCode?: number;
		response?: { statusCode?: number; body?: unknown };
		cause?: { response?: { statusCode?: number; body?: unknown } };
	};

	const body = err.response?.body ?? err.cause?.response?.body;
	const status = err.statusCode ?? err.response?.statusCode ?? err.cause?.response?.statusCode;
	const envelope = extractEnvelope(body);

	if (envelope) {
		const description: string[] = [];
		if (envelope.rule) {
			description.push(`Rule: ${envelope.rule}`);
		}
		if (envelope.remediation) {
			description.push(envelope.remediation);
		}
		if (envelope.docUrl) {
			description.push(`See ${envelope.docUrl}`);
		}
		if (envelope.requestId) {
			description.push(`Request ID: ${envelope.requestId}`);
		}

		const title = CODE_TITLES[envelope.code] ?? 'Letmepost API error';
		const options: { message: string; description?: string; httpCode?: string } = {
			message: `${title} (${envelope.code}): ${envelope.message}`,
		};
		if (description.length > 0) {
			options.description = description.join(' — ');
		}
		if (status !== undefined) {
			options.httpCode = String(status);
		}

		return new NodeApiError(this.getNode(), (body as JsonObject) ?? {}, options);
	}

	return new NodeApiError(this.getNode(), error as JsonObject);
}

function extractEnvelope(body: unknown): LetmepostErrorEnvelope | null {
	let parsed: unknown = body;
	if (typeof body === 'string') {
		try {
			parsed = JSON.parse(body);
		} catch {
			return null;
		}
	}
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}
	const maybe = (parsed as { error?: unknown }).error;
	if (!maybe || typeof maybe !== 'object') {
		return null;
	}
	const e = maybe as Record<string, unknown>;
	if (typeof e.code !== 'string' || typeof e.message !== 'string') {
		return null;
	}
	const out: LetmepostErrorEnvelope = { code: e.code, message: e.message };
	if (typeof e.rule === 'string') out.rule = e.rule;
	if (typeof e.remediation === 'string') out.remediation = e.remediation;
	if (typeof e.platform === 'string') out.platform = e.platform;
	if (typeof e.docUrl === 'string') out.docUrl = e.docUrl;
	if (typeof e.requestId === 'string') out.requestId = e.requestId;
	return out;
}
