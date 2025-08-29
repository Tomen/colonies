import Ajv from 'ajv';
import { Config } from '../types';
import { configSchema } from './schema';

const ajv = new Ajv();
const validate = ajv.compile<Config>(configSchema);

export function loadConfig(raw: unknown): Config {
  if (!validate(raw)) {
    throw new Error('Invalid config: ' + ajv.errorsText(validate.errors));
  }
  return raw;
}
