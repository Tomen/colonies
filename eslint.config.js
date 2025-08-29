import pluginTs from '@typescript-eslint/eslint-plugin';
import parserTs from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: parserTs,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      // Add project-specific rules here
    },
  },
];
