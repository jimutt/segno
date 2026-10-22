# Theming `<segno-player>`

<!-- @decision(DL-015) -->

The player renders into a shadow root, so a site's CSS doesn't reach inside it by accident. It is themed on purpose through three things: custom properties, parts, and container queries. All three are public API, changed only with a new major version.

## Custom properties

Set them anywhere a normal CSS property can go: on `segno-player`, on a class, on `:root`, inside a media or container query. The player reads each with its default as a fallback and never sets them itself, so your values always win.

```css
segno-player {
  --segno-accent: #2f5d8a;
  --segno-page-gap: 2rem;
  --segno-controls-radius: 999px;
}
```

| Property                      | Default                                          | What it sets                                                           |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `--segno-accent`              | `#b3261e`                                        | The colour of the bar marker, the note cursor and the controls' accent |
| `--segno-bar-strength`        | `7%`                                             | How much of the accent tints the bar marker                            |
| `--segno-bar-fade-in`         | `90ms`                                           | How fast the bar marker appears on a new bar                           |
| `--segno-bar-fade-out`        | `260ms`                                          | How fast it leaves the previous one                                    |
| `--segno-cursor-width`        | `2px`                                            | The note cursor's width                                                |
| `--segno-cursor-strength`     | `55%`                                            | How much of the accent colours the note cursor                         |
| `--segno-page-gap`            | `1rem`                                           | Space between pages                                                    |
| `--segno-page-background`     | `#fff`                                           | The sheet behind each page                                             |
| `--segno-page-shadow`         | a soft shadow                                    | The pages' shadow (`none` for flat pages)                              |
| `--segno-controls-background` | `light-dark()` of a white and a dark translucent | The built-in controls' background                                      |
| `--segno-controls-color`      | `light-dark()` of a dark and a light grey        | The built-in controls' text and icons                                  |
| `--segno-controls-accent`     | `--segno-accent`                                 | The play button and the slider's fill                                  |
| `--segno-controls-radius`     | `0.75rem`                                        | The controls' corner radius                                            |
| `--segno-controls-gap`        | `0.5rem`                                         | Space between the controls                                             |
| `--segno-font`                | `inherit`                                        | The controls' font                                                     |

The markers are blended with `multiply`, so the notes under them stay black whatever the colour.

The controls follow the page's `color-scheme`: with `color-scheme: light dark` on the page, they turn dark in dark mode on their own.

## Presets

A preset switches a set of values with one property. Presets use container style queries, which every current browser supports (Firefox from version 151); older browsers ignore them and keep the defaults.

| Property           | Values                      | Effect                                                                 |
| ------------------ | --------------------------- | ---------------------------------------------------------------------- |
| `--segno-controls` | `full` (default), `compact` | `compact` shows only the play button and the seek slider, on one line  |
| `--segno-markers`  | `soft` (default), `strong`  | `strong` doubles the bar marker's tint and strengthens the note cursor |

```css
@media (pointer: coarse) {
  segno-player {
    --segno-controls: compact;
  }
}
```

## Parts

For anything the properties don't cover, style the parts with `::part()`:

| Part                                   | Element                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `pages`                                | The scrolling column of pages (focusable, with the keyboard shortcuts)                  |
| `page`                                 | Each page's sheet                                                                       |
| `page-image`                           | Each page's image                                                                       |
| `bar-marker`                           | The bar marker (two elements that crossfade)                                            |
| `note-cursor`                          | The note cursor                                                                         |
| `controls-area`                        | The area below the pages that holds the controls (sticky at the bottom of the viewport) |
| `controls`                             | The built-in controls bar                                                               |
| `play-button`, `time`, `seek`, `tempo` | The built-in controls                                                                   |

```css
segno-player::part(page) {
  border-radius: 4px;
}
segno-player::part(controls-area) {
  position: static;
}
```

## Container queries

The player is a size container named `segno-player`: its built-in controls lay out by the player's own width, wrapping onto two lines below 28rem. A site can do the same around the player with its own containers:

```css
.sidebar {
  container-type: inline-size;
}
@container (width < 30rem) {
  segno-player {
    --segno-page-gap: 0.5rem;
    --segno-controls: compact;
  }
}
```

## Your own controls

Put your own controls in the `controls` slot; they replace the built-in ones, and drive the player through its API:

```html
<segno-player pages="…" audio="…" positions="…">
  <button slot="controls" onclick="this.parentElement.paused ? this.parentElement.play() : this.parentElement.pause()">
    Play / pause
  </button>
</segno-player>
```
