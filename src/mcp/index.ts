#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { closeDb, getDb } from '../core/db.js';
import { logger } from '../core/logger.js';
import { registerTools } from './tools.js';

const server = new McpServer({
	name: 'maven-mcp',
	version: '1.0.0',
});

getDb();
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('Maven MCP server running on stdio');

process.on('SIGINT', () => {
	closeDb();
	process.exit(0);
});
