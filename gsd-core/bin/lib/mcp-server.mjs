import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('./mcp-server.cjs');
export default mod;
export const {
  PROTOCOL_VERSION,
  SERVER_NAME,
  handleMessage,
  runServer,
  callTool,
  runMcpServer,
  dispatchMcpTool,
} = mod;
