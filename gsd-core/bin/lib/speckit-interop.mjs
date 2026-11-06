import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('./speckit-interop.cjs');
export default mod;
export const {
  parseRfc2119Requirement,
  sanitizeExternalSpecContent,
  parseSpecKitDocument,
  parseConstitution,
  validateAgainstConstitution,
  exportToSpecKit,
} = mod;

