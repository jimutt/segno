// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno

/**
 * `<segno-player>`. Importing this module defines the element (once).
 * @decision(DL-018)
 * @module
 */

import { SegnoPlayer } from './element.js';

if (!customElements.get('segno-player')) customElements.define('segno-player', SegnoPlayer);

export { type BarChangeDetail, SegnoPlayer } from './element.js';
