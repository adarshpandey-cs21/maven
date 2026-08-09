const PREFIX = '[maven-mcp]';

export const logger = {
	info: (...args: unknown[]) => console.error(PREFIX, ...args),
	warn: (...args: unknown[]) => console.error(PREFIX, 'WARN', ...args),
	error: (...args: unknown[]) => console.error(PREFIX, 'ERROR', ...args),
	debug: (...args: unknown[]) => {
		if (process.env.MAVEN_DEBUG) console.error(PREFIX, 'DEBUG', ...args);
	},
};
