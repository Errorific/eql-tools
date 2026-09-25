export interface Tool {
	name: string;
	href: string;
	description: string;
}

export const tools: Tool[] = [
	{
		name: 'Gear Upgrade',
		href: '/gear-upgrade',
		description: 'Plan mote, duplicate, and Void-Touched merges to reach a target item tier.'
	},
	{
		name: 'Copy Pyramid',
		href: '/copy-pyramid',
		description: 'Bulk farm math: how many raw copies and Major motes reach a target tier.'
	}
];
