import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'content-type-cache/**',
      'working_dir/**',
      'tests/**',
      '**/*.h5p',
      '**/*.csv',
      '**/tmp/**',
      '**/temp/**',
      '**/.tmp/**',
      '**/test-output/**',
      '30',
    ],
  },
  {
    files: ['src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      // Stage 4A establishes a non-stylistic baseline without rewriting legacy code.
      'prefer-const': 'off',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
      // The ES5-targeted code intentionally wraps errors without Error.cause.
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['src/index.ts'],
    rules: {
      // The yargs expression is intentional and is reserved for Stage 4C review.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
