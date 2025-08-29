import { expect, test } from 'vitest';
import { loadConfig, defaultConfig } from '../src/config';

test('loadConfig accepts default config', () => {
  const cfg = loadConfig(defaultConfig);
  expect(cfg.seed).toBe(133742);
});

test('loadConfig rejects unknown keys', () => {
  expect(() => loadConfig({ ...defaultConfig, extra: true } as any)).toThrow();
});
