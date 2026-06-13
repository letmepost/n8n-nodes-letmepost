import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LetmepostApi implements ICredentialType {
	name = 'letmepostApi';

	displayName = 'Letmepost API';

	documentationUrl = 'https://docs.letmepost.dev';

	icon: Icon = 'file:letmepost.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			placeholder: 'lmp_live_…',
			description:
				'Your letmepost.dev API key. Create one in the dashboard under Settings → API Keys. Use an lmp_live_ key for production or lmp_test_ for the test environment.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.letmepost.dev',
			placeholder: 'https://api.letmepost.dev',
			description:
				'The letmepost.dev API base URL. Change this only if you run a self-hosted instance.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/accounts',
			method: 'GET',
		},
	};
}
