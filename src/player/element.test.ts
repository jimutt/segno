// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page as browser } from 'vitest/browser';
import type { SyncMap } from '../core/index.js';
import { type BarChangeDetail, SegnoPlayer } from './index.js';
import { blankPage, fixture, next, revokeAll, silentAudio } from './test-assets.js';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  document.body.replaceChildren();
  revokeAll();
  vi.restoreAllMocks();
});

function mount(attributes: Record<string, string | true> = {}): SegnoPlayer {
  const player = document.createElement('segno-player');
  for (const [name, value] of Object.entries(attributes)) player.setAttribute(name, value === true ? '' : value);
  document.body.append(player);
  return player;
}

/** A player with the fixture's positions on a blank page, and 30 s of silence: ready to play */
async function ready(attributes: Record<string, string | true> = {}): Promise<SegnoPlayer> {
  const player = mount({
    pages: blankPage(),
    audio: silentAudio(30),
    positions: fixture.mpos,
    notes: fixture.spos,
    ...attributes,
  });
  await next(player, 'canplay');
  return player;
}

async function seek(player: SegnoPlayer, seconds: number): Promise<void> {
  const seeked = next(player, 'seeked');
  player.currentTime = seconds;
  await seeked;
}

const shadow = (player: SegnoPlayer): ShadowRoot => {
  if (!player.shadowRoot) throw new Error('No shadow root');
  return player.shadowRoot;
};
const query = <T extends Element = HTMLElement>(player: SegnoPlayer, selector: string): T => {
  const el = shadow(player).querySelector<T>(selector);
  if (!el) throw new Error(`No ${selector}`);
  return el;
};
const activeMarker = (player: SegnoPlayer): HTMLElement => query(player, '.bar-marker.on');
/** Expects a CSS percentage to be a page fraction */
const expectPercent = (value: string, fraction: number): void => {
  expect(value).toMatch(/%$/);
  expect(Number.parseFloat(value)).toBeCloseTo(fraction * 100, 3);
};
const syncOf = (player: SegnoPlayer): SyncMap => {
  if (!player.sync) throw new Error('No sync map');
  return player.sync;
};
const startOf = (player: SegnoPlayer, event: number): number => (syncOf(player).events[event]?.[1] ?? 0) / 1000;

describe('pages', () => {
  test('shows each page as an image, with alt text', () => {
    const player = mount({ pages: 'a-1.svg  a-2.svg', alt: 'Hosianna' });
    const images = [...shadow(player).querySelectorAll('img')];
    expect(images.map((img) => new URL(img.src).pathname.split('/').at(-1))).toEqual(['a-1.svg', 'a-2.svg']);
    expect(images.map((img) => img.alt)).toEqual(['Hosianna, page 1 of 2', 'Hosianna, page 2 of 2']);
    player.removeAttribute('alt');
    expect(images[0]?.alt).toBe('Page 1 of 2');
    player.setAttribute('pages', 'b-1.svg');
    expect(shadow(player).querySelectorAll('img')).toHaveLength(1);
  });

  test('takes the pages’ aspect ratio from their SVGs', async () => {
    const player = await ready();
    expect(query(player, '.page').style.aspectRatio).toBe('9921.26 / 14031.5');
  });

  test('defines the element once', async () => {
    expect(customElements.get('segno-player')).toBe(SegnoPlayer);
    await import('./index.js');
    expect(customElements.get('segno-player')).toBe(SegnoPlayer);
  });
});

describe('markers', () => {
  test('builds the sync map and marks the first bar before playing', async () => {
    const player = await ready();
    expect(syncOf(player).bars).toHaveLength(13);
    expect(player.currentBar).toBe(0);
    const [, x, y, w, h] = syncOf(player).bars[0] ?? [];
    const marker = activeMarker(player);
    expectPercent(marker.style.left, (x ?? 0) - 0.012);
    expectPercent(marker.style.top, y ?? 0);
    expectPercent(marker.style.width, (w ?? 0) + 0.024);
    expectPercent(marker.style.height, h ?? 0);
    expect(query(player, '.note-cursor').hidden).toBe(false);
  });

  test('moves to the bar being played and fires barchange, for every pass through a repeat', async () => {
    const player = await ready();
    const changes: BarChangeDetail[] = [];
    player.addEventListener('barchange', (e) => changes.push((e as CustomEvent<BarChangeDetail>).detail));
    await seek(player, startOf(player, 6) + 0.1);
    expect(player.currentBar).toBe(6);
    await seek(player, startOf(player, 12) + 0.1);
    expect(player.currentBar).toBe(6);
    expect(changes).toEqual([
      { bar: 6, event: 6 },
      { bar: 6, event: 12 },
    ]);
    expect(shadow(player).querySelectorAll('.bar-marker.on')).toHaveLength(1);
  });

  test('changes bar slightly before the event, by bar-lead', async () => {
    const player = await ready({ 'bar-lead': '200' });
    await seek(player, startOf(player, 3) - 0.1);
    expect(player.currentBar).toBe(3);
    player.setAttribute('bar-lead', 'nonsense');
    await seek(player, startOf(player, 5) - 0.1);
    expect(player.currentBar).toBe(4);
  });

  test('places the note cursor on the note playing, unless note-cursor is off', async () => {
    const player = await ready();
    const sync = syncOf(player);
    const [note, ms] = sync.noteEvents?.[5] ?? [];
    await seek(player, (ms ?? 0) / 1000);
    const cursor = query(player, '.note-cursor');
    expectPercent(cursor.style.left, sync.notes?.[note ?? 0]?.[1] ?? 0);
    player.setAttribute('note-cursor', 'off');
    expect(cursor.hidden).toBe(true);
  });

  test('has no note cursor without an .spos file', async () => {
    const player = await ready({ notes: '' });
    expect(player.sync?.notes).toBeUndefined();
    expect(shadow(player).querySelector('.note-cursor:not([hidden])')).toBeNull();
  });

  test('uses a sync map set on the property', async () => {
    const map: SyncMap = { v: 1, bars: [[0, 0.1, 0.2, 0.3, 0.1]], events: [[0, 0]] };
    const player = mount({ pages: blankPage(), audio: silentAudio(5) });
    player.sync = map;
    await next(player, 'canplay');
    expect(player.sync).toBe(map);
    expectPercent(activeMarker(player).style.left, 0.1 - 0.012);
  });
});

describe('falling back to plain playback', () => {
  test('when the audio ends before the last bar starts', async () => {
    const player = await ready({ audio: silentAudio(5) });
    expect(player.currentBar).toBe(-1);
    expect(shadow(player).querySelector('.bar-marker.on:not([hidden])')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ends before the last bar starts.*Play repeats/));
    query(player, '.pages').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(player.currentTime).toBe(5);
  });

  test('when the positions do not fit the pages', async () => {
    const player = await ready({ pages: blankPage(3000, 4000) });
    expect(player.sync).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Playing without markers: .*outside its page/));
  });

  test('when a sync map has bars on pages that are missing', async () => {
    const player = mount({ pages: blankPage(), audio: silentAudio(5) });
    player.sync = { v: 1, bars: [[1, 0.1, 0.2, 0.3, 0.1]], events: [[0, 0]] };
    await next(player, 'canplay');
    expect(player.sync).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/pages the player wasn't given/));
  });

  test('when a sync map has an unknown version', async () => {
    const player = mount({ pages: blankPage(), audio: silentAudio(5) });
    player.sync = { v: 2 } as unknown as SyncMap;
    await next(player, 'canplay');
    expect(player.sync).toBeNull();
  });
});

describe('the media element API', () => {
  test('plays, pauses and re-dispatches the audio’s events', async () => {
    const player = await ready();
    expect(player.paused).toBe(true);
    expect(player.duration).toBeCloseTo(30, 1);
    const playing = next(player, 'play');
    await player.play();
    await playing;
    expect(player.paused).toBe(false);
    const paused = next(player, 'pause');
    player.pause();
    await paused;
    expect(player.paused).toBe(true);
    expect(query(player, '.live').textContent).toMatch(/^Bar \d+ of 13$/);
    const rate = next(player, 'ratechange');
    player.playbackRate = 0.5;
    await rate;
    expect(player.playbackRate).toBe(0.5);
    expect(player.error).toBeNull();
  });

  test('playBar plays from a bar, in the pass nearest the current position', async () => {
    const player = await ready();
    await seek(player, startOf(player, 12) - 1);
    await player.playBar(6);
    player.pause();
    expect(player.currentTime).toBeGreaterThanOrEqual(startOf(player, 12));
    await expect(player.playBar(99)).rejects.toThrow(RangeError);
  });

  test('pauses when removed from the page', async () => {
    const player = await ready();
    await player.play();
    player.remove();
    expect(player.paused).toBe(true);
  });
});

describe('interaction', () => {
  test('clicking a bar seeks to it', async () => {
    const player = await ready();
    const [, x, y, w, h] = syncOf(player).bars[4] ?? [];
    const overlay = query(player, '.overlay');
    const rect = overlay.getBoundingClientRect();
    const seeked = next(player, 'seeked');
    overlay.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        composed: true,
        clientX: rect.left + ((x ?? 0) + (w ?? 0) / 2) * rect.width,
        clientY: rect.top + ((y ?? 0) + (h ?? 0) / 2) * rect.height,
      }),
    );
    await seeked;
    expect(player.currentBar).toBe(4);
    const time = player.currentTime;
    overlay.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true, clientX: rect.left + 1, clientY: rect.top + 1 }),
    );
    expect(player.currentTime).toBe(time);
  });

  test('the keyboard plays, pauses and moves between bars', async () => {
    const player = await ready();
    const pages = query(player, '.pages');
    const key = (k: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: k, cancelable: true });
      pages.dispatchEvent(event);
      return event;
    };
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(player.currentTime).toBeCloseTo(startOf(player, 1), 3);
    key('ArrowRight');
    key('ArrowLeft');
    expect(player.currentTime).toBeCloseTo(startOf(player, 1), 3);
    const playing = next(player, 'play');
    key(' ');
    await playing;
    const paused = next(player, 'pause');
    key('k');
    await paused;
    key('Home');
    expect(player.currentTime).toBe(0);
    expect(key('x').defaultPrevented).toBe(false);
  });

  test('without markers, the arrow keys move five seconds', async () => {
    const player = mount({ pages: blankPage(), audio: silentAudio(30) });
    await next(player, 'canplay');
    const pages = query(player, '.pages');
    pages.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    pages.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    pages.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(player.currentTime).toBe(5);
  });

  test('follow scrolls a system that is off screen into view', async () => {
    await browser.viewport(800, 600);
    const player = await ready({ follow: true });
    player.style.width = '1400px';
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    await player.play();
    await seek(player, startOf(player, 10) + 0.1);
    await vi.waitFor(() => expect(scroll).toHaveBeenCalled());
    player.pause();
  });
});

describe('controls', () => {
  test('are hidden without the controls attribute', () => {
    const player = mount({ pages: blankPage() });
    expect(getComputedStyle(query(player, '.controls')).display).toBe('none');
    player.setAttribute('controls', '');
    expect(getComputedStyle(query(player, '.controls')).display).toBe('flex');
  });

  test('play, pause, show the time, seek and set the tempo', async () => {
    const player = await ready({ controls: true });
    const button = query<HTMLButtonElement>(player, '.play');
    expect(button.getAttribute('aria-label')).toBe('Play');
    expect(query(player, '.time').textContent).toBe('0:00 / 0:30');
    const playing = next(player, 'play');
    button.click();
    await playing;
    expect(button.getAttribute('aria-label')).toBe('Pause');
    const paused = next(player, 'pause');
    button.click();
    await paused;

    const range = query<HTMLInputElement>(player, '.seek');
    const seeked = next(player, 'seeked');
    range.value = '12';
    range.dispatchEvent(new Event('input'));
    await seeked;
    expect(player.currentTime).toBe(12);
    expect(query(player, '.time').textContent).toBe('0:12 / 0:30');
    expect(range.getAttribute('aria-valuetext')).toBe('0:12 of 0:30');

    const tempo = query<HTMLSelectElement>(player, '.tempo');
    tempo.value = '0.8';
    tempo.dispatchEvent(new Event('change'));
    expect(player.playbackRate).toBe(0.8);
    player.playbackRate = 1.5;
    await next(player, 'ratechange');
    expect(tempo.value).toBe('1.5');
    player.playbackRate = 1.25;
    await next(player, 'ratechange');
    expect(tempo.value).toBe('1.5');
  });

  test('a site’s own controls replace the built-in ones', async () => {
    const player = mount({ pages: blankPage(), controls: true });
    const own = document.createElement('button');
    own.slot = 'controls';
    player.append(own);
    const slot = query<HTMLSlotElement>(player, 'slot[name="controls"]');
    expect(slot.assignedElements()).toEqual([own]);
  });
});

describe('theming', () => {
  test('custom properties set on the page reach the markers', async () => {
    const player = await ready();
    player.style.setProperty('--segno-accent', 'rgb(0, 0, 255)');
    player.style.setProperty('--segno-bar-strength', '100%');
    // Chromium writes the color-mix() result in the srgb color() form
    expect(getComputedStyle(activeMarker(player)).backgroundColor).toMatch(/^(rgb\(0, 0, 255\)|color\(srgb 0 0 1\))$/);
  });

  test('the compact preset hides the time and the tempo', () => {
    const player = mount({ pages: blankPage(), controls: true });
    expect(getComputedStyle(query(player, '.time')).display).not.toBe('none');
    player.style.setProperty('--segno-controls', 'compact');
    expect(getComputedStyle(query(player, '.time')).display).toBe('none');
    expect(getComputedStyle(query(player, '.tempo')).display).toBe('none');
  });

  test('the controls wrap in a narrow player', () => {
    const player = mount({ pages: blankPage(), controls: true });
    player.style.width = '800px';
    expect(getComputedStyle(query(player, '.controls')).flexWrap).toBe('nowrap');
    player.style.width = '300px';
    expect(getComputedStyle(query(player, '.controls')).flexWrap).toBe('wrap');
    player.style.setProperty('--segno-controls', 'compact');
    expect(getComputedStyle(query(player, '.controls')).flexWrap).toBe('nowrap');
  });
});
