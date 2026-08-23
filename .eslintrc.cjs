module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:security/recommended-legacy',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Garde-fous sécurité côté front
    'react/no-danger': 'error',
    'security/detect-object-injection': 'off',
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', 'playwright-report', '*.cjs'],
  overrides: [
    {
      files: ['tests/**/*.{ts,tsx}'],
      rules: { 'no-console': 'off' },
    },
    {
      // Les fixtures Playwright exposent un paramètre nommé `use` que le plugin
      // react-hooks confond avec le hook React `use`.
      files: ['tests/e2e/**/*.ts'],
      rules: { 'react-hooks/rules-of-hooks': 'off' },
    },
  ],
};
