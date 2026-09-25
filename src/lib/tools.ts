export interface Tool {
	name: string;
	href: string;
	description: string;
}

export const tools: Tool[] = [
	{
		name: 'Hello World',
		href: '/hello',
		description: 'A placeholder tool that verifies the skeleton is working.'
	}
];
