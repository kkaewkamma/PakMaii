import { parseAgencyKeyRing } from '../worker/auth.js';
import { describeHiddenInput, readHiddenInput } from './hidden-prompt.js';

const value = await readHiddenInput({ prompt: 'Secret (hidden): ' });
const metadata = describeHiddenInput(value);
let category = 'OK';
try {
  parseAgencyKeyRing(value);
} catch (error) {
  category = typeof error?.code === 'string' ? error.code : 'INVALID';
}
process.stdout.write(`${JSON.stringify({ ...metadata, category })}\n`);
