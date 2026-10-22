// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno

import { defineConfig } from 'vitest/config';

// @decision(DL-011)
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      reporter: ['text', 'html', 'json-summary'],
      // A floor that only goes up
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
