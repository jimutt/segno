// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno

// Builds the demo site into site/: the pages in demo/, stamped with the commit they were built from.
// Links stay relative, so the site works at the Pages root and under pr-preview/pr-<n>/.
// @decision(DL-013)

import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const commit = (process.env.SEGNO_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }))
  .trim()
  .slice(0, 7);

rmSync('site', { recursive: true, force: true });
cpSync('demo', 'site', { recursive: true });
const index = 'site/index.html';
writeFileSync(index, readFileSync(index, 'utf8').replaceAll('%COMMIT%', commit));
console.log(`Built the demo into site/ (${commit})`);
