import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const gsdCore = require('./.opencode/plugins/gsd-core.js');
export default gsdCore;

