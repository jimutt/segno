// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno
// The player's shadow styles. Every themable value is a --segno-* custom property read with its default as the
// var() fallback, never set on :host, so values from the page inherit and win.
// @decision(DL-015) @decision(DL-006)
export const css = /* css */ `
:host {
  display: block;
  position: relative;
  container: segno-player / inline-size;
  font: var(--segno-font, inherit);
}
:host([hidden]),
[hidden] {
  display: none !important;
}

.pages {
  display: flex;
  flex-direction: column;
  gap: var(--segno-page-gap, 1rem);
  border-radius: 2px;
}
.pages:focus-visible {
  outline: 2px solid var(--segno-accent, #b3261e);
  outline-offset: 4px;
}
.page {
  position: relative;
  background: var(--segno-page-background, #fff);
  box-shadow: var(--segno-page-shadow, 0 1px 2px rgb(0 0 0 / 0.12), 0 4px 16px rgb(0 0 0 / 0.08));
}
.page img {
  display: block;
  width: 100%;
  height: auto;
}
.overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.pages[data-markers] .overlay {
  cursor: pointer;
}

.bar-marker {
  position: absolute;
  pointer-events: none;
  mix-blend-mode: multiply;
  background: color-mix(in srgb, var(--segno-accent, #b3261e) var(--segno-bar-strength, 7%), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  opacity: 0;
  transition: opacity var(--segno-bar-fade-out, 260ms) ease-out;
  scroll-margin-top: 25vh;
}
.bar-marker.on {
  opacity: 1;
  transition-duration: var(--segno-bar-fade-in, 90ms);
  @starting-style {
    opacity: 0;
  }
}
:host([bar-change="jump"]) .bar-marker {
  transition: none;
}
.note-cursor {
  position: absolute;
  width: var(--segno-cursor-width, 2px);
  translate: -50% 0;
  pointer-events: none;
  mix-blend-mode: multiply;
  background: color-mix(in srgb, var(--segno-accent, #b3261e) var(--segno-cursor-strength, 55%), transparent);
}
@container style(--segno-markers: strong) {
  .bar-marker {
    background: color-mix(
      in srgb,
      var(--segno-accent, #b3261e) calc(2 * var(--segno-bar-strength, 7%)),
      transparent
    );
  }
  .note-cursor {
    background: color-mix(
      in srgb,
      var(--segno-accent, #b3261e) min(100%, calc(1.6 * var(--segno-cursor-strength, 55%))),
      transparent
    );
  }
}
@media (prefers-reduced-motion: reduce) {
  .bar-marker {
    transition: none;
  }
}

.controls-area {
  position: sticky;
  bottom: 0.75rem;
  z-index: 1;
}
:host(:not([controls])) .controls {
  display: none;
}
.controls {
  display: flex;
  align-items: center;
  margin-top: 0.75rem;
  gap: var(--segno-controls-gap, 0.5rem);
  padding: 0.5rem 0.75rem;
  border-radius: var(--segno-controls-radius, 0.75rem);
  background: var(--segno-controls-background, light-dark(rgb(255 255 255 / 0.92), rgb(30 29 27 / 0.92)));
  color: var(--segno-controls-color, light-dark(#1d1c1a, #ecebe7));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 4px 16px rgb(0 0 0 / 0.1);
  backdrop-filter: blur(8px);
  accent-color: var(--segno-controls-accent, var(--segno-accent, #b3261e));
  font-variant-numeric: tabular-nums;
}
.play {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--segno-controls-accent, var(--segno-accent, #b3261e));
  color: #fff;
  cursor: pointer;
}
.play:focus-visible,
.seek:focus-visible,
.tempo:focus-visible {
  outline: 2px solid var(--segno-controls-accent, var(--segno-accent, #b3261e));
  outline-offset: 2px;
}
.play svg {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}
.time {
  white-space: nowrap;
}
.seek {
  flex: 1;
  min-width: 6rem;
  margin: 0;
}
.tempo {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 0.375rem;
  padding: 0.125rem 0.25rem;
}
@container segno-player (width < 28rem) {
  .controls {
    flex-wrap: wrap;
  }
  .seek {
    order: 3;
    flex-basis: 100%;
  }
}
@container style(--segno-controls: compact) {
  .controls {
    flex-wrap: nowrap;
  }
  .seek {
    order: 0;
    flex-basis: auto;
  }
  .time,
  .tempo {
    display: none;
  }
}

.live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
let sheet;
/** The stylesheet, shared by every player on the page */
export function styles() {
    if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
    }
    return sheet;
}
//# sourceMappingURL=styles.js.map