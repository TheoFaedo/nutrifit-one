const angular = require('angular-eslint');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
      curly: ['error', 'all'],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {
      'max-len': [
        'error',
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignorePattern: '^\\s*d="',
        },
      ],
    },
  },
  {
    ignores: ['.angular/**', 'dist/**', 'coverage/**'],
  },
]);
