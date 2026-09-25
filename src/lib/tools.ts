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
	}
];
