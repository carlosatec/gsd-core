import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('./mcp-server.cjs');
export default mod;
export const {
  runMcpServer,
  dispatchMcpTool,
} = mod;

