// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno

import { createTimeline, type PageSize, type SyncMap, type Timeline } from '../core/index.js';
import { createControls } from './controls.js';
import { checkSyncMap, loadSync } from './load.js';
import { styles } from './styles.js';

/** `detail` of the `barchange` event */
export interface BarChangeDetail {
  /** Index into the sync map's bars */
  bar: number;
  /** Index into the sync map's events: which pass through the bar */
  event: number;
}

interface Page {
  page: HTMLElement;
  image: HTMLImageElement;
  overlay: HTMLElement;
}

/** Events of the audio element that the player re-dispatches as its own */
const MEDIA_EVENTS = [
  'play',
  'pause',
  'playing',
  'waiting',
  'seeking',
  'seeked',
  'timeupdate',
  'ratechange',
  'durationchange',
  'loadedmetadata',
  'ended',
  'error',
] as const;

/** How far the bar marker reaches into the neighbouring bars, as a fraction of the page width */
// @decision(DL-006)
const BAR_OVERLAP = 0.012;
const DEFAULT_BAR_LEAD = 20;
const DEFAULT_NOTE_LEAD = 0;

const percent = (fraction: number): string => `${(fraction * 100).toFixed(4)}%`;

function numberAttribute(value: string | null, fallback: number): number {
  const n = value === null || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * `<segno-player>`: plays a score's audio on its engraved SVG pages, with a marker on the bar being played and a
 * cursor that flows from note to note. Its playback API follows `HTMLMediaElement`.
 * @decision(DL-005) @decision(DL-014) @decision(DL-017)
 */
export class SegnoPlayer extends HTMLElement {
  static readonly observedAttributes = ['pages', 'audio', 'positions', 'notes', 'sync', 'alt', 'note-cursor'];

  readonly #audio = document.createElement('audio');
  readonly #pagesEl = document.createElement('div');
  readonly #live = document.createElement('div');
  readonly #markers: [HTMLElement, HTMLElement];
  readonly #cursor = document.createElement('div');
  #pages: Page[] = [];
  #activeMarker = 0;

  #syncProperty: SyncMap | null = null;
  #sync: SyncMap | null = null;
  #timeline: Timeline | null = null;
  #lastEventMs = 0;
  #audioTooShort = false;
  #event = -1;
  #bar = -1;

  #load: AbortController | null = null;
  #loadQueued = false;
  #loadSettled = false;
  #audioReady = false;
  #canplayFired = false;
  #frame = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [styles()];

    this.#pagesEl.className = 'pages';
    this.#pagesEl.setAttribute('part', 'pages');
    this.#pagesEl.tabIndex = 0;
    this.#pagesEl.setAttribute('role', 'group');
    this.#pagesEl.setAttribute('aria-label', 'Score');
    this.#pagesEl.addEventListener('click', (e) => this.#onClick(e));
    this.#pagesEl.addEventListener('keydown', (e) => this.#onKey(e));

    const marker = (): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'bar-marker';
      el.setAttribute('part', 'bar-marker');
      el.hidden = true;
      return el;
    };
    this.#markers = [marker(), marker()];
    this.#cursor.className = 'note-cursor';
    this.#cursor.setAttribute('part', 'note-cursor');
    this.#cursor.hidden = true;

    const controlsArea = document.createElement('div');
    controlsArea.className = 'controls-area';
    controlsArea.setAttribute('part', 'controls-area');
    const slot = document.createElement('slot');
    slot.name = 'controls';
    slot.append(createControls(this));
    controlsArea.append(slot);

    this.#live.className = 'live';
    this.#live.setAttribute('aria-live', 'polite');

    root.append(this.#pagesEl, controlsArea, this.#live);

    const audio = this.#audio;
    audio.preload = 'metadata';
    audio.addEventListener('canplay', () => {
      this.#audioReady = true;
      this.#maybeCanPlay();
    });
    audio.addEventListener('durationchange', () => this.#checkAudioLength());
    audio.addEventListener('play', () => this.#startLoop());
    audio.addEventListener('pause', () => {
      this.#stopLoop();
      this.#update();
      this.#announce();
    });
    audio.addEventListener('seeked', () => {
      this.#update();
      if (audio.paused) this.#announce();
    });
    audio.addEventListener('timeupdate', () => {
      if (audio.paused) this.#update();
    });
    // After the player's own handlers, so its state is current when the page hears the event
    for (const type of MEDIA_EVENTS) audio.addEventListener(type, () => this.dispatchEvent(new Event(type)));
  }

  connectedCallback(): void {
    this.#renderPages();
    this.#setAudioSource();
    this.#queueLoad();
  }

  disconnectedCallback(): void {
    this.#audio.pause();
    this.#stopLoop();
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (!this.isConnected || previous === value) return;
    if (name === 'pages') this.#renderPages();
    if (name === 'audio') this.#setAudioSource();
    if (name === 'alt') this.#updateAlt();
    if (name === 'note-cursor') this.#update();
    if (name === 'pages' || name === 'positions' || name === 'notes' || name === 'sync') this.#queueLoad();
  }

  // The media element API

  get currentTime(): number {
    return this.#audio.currentTime;
  }
  set currentTime(seconds: number) {
    this.#audio.currentTime = seconds;
  }
  get duration(): number {
    return this.#audio.duration;
  }
  get paused(): boolean {
    return this.#audio.paused;
  }
  get playbackRate(): number {
    return this.#audio.playbackRate;
  }
  set playbackRate(rate: number) {
    this.#audio.preservesPitch = true;
    this.#audio.playbackRate = rate;
  }
  /** The audio's error, as on a media element */
  get error(): MediaError | null {
    return this.#audio.error;
  }
  play(): Promise<void> {
    return this.#audio.play();
  }
  pause(): void {
    this.#audio.pause();
  }

  // What Segno adds

  /** The bar being played, as an index into the sync map's bars; -1 without markers */
  get currentBar(): number {
    return this.#bar;
  }

  /** The sync map in use: the one set on this property, or the one loaded from the attributes */
  get sync(): SyncMap | null {
    return this.#sync;
  }
  set sync(map: SyncMap | null) {
    this.#syncProperty = map;
    this.#queueLoad();
  }

  /** Plays from a bar; inside repeats, from the pass nearest the current position. */
  playBar(bar: number): Promise<void> {
    const ms = this.#timeline?.seekTimeForBar(bar, this.currentTime * 1000) ?? -1;
    if (ms < 0) return Promise.reject(new RangeError(`Bar ${bar} is never played`));
    this.currentTime = ms / 1000;
    return this.play();
  }

  // Pages

  #pageUrls(): string[] {
    return (this.getAttribute('pages') ?? '').split(/\s+/).filter(Boolean);
  }

  #renderPages(): void {
    for (const marker of [...this.#markers, this.#cursor]) {
      marker.remove();
      marker.hidden = true;
    }
    this.#pages = this.#pageUrls().map((url) => {
      const page = document.createElement('div');
      page.className = 'page';
      page.setAttribute('part', 'page');
      const image = document.createElement('img');
      image.setAttribute('part', 'page-image');
      image.decoding = 'async';
      image.src = new URL(url, document.baseURI).href;
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      page.append(image, overlay);
      return { page, image, overlay };
    });
    this.#pagesEl.replaceChildren(...this.#pages.map((p) => p.page));
    this.#updateAlt();
    this.#event = -1;
    this.#bar = -1;
  }

  #updateAlt(): void {
    const alt = this.getAttribute('alt');
    const count = this.#pages.length;
    this.#pages.forEach(({ image }, i) => {
      image.alt = alt ? `${alt}, page ${i + 1} of ${count}` : `Page ${i + 1} of ${count}`;
    });
  }

  #setPageSizes(sizes: PageSize[]): void {
    sizes.forEach((size, i) => {
      const page = this.#pages[i];
      if (page) page.page.style.aspectRatio = `${size.w} / ${size.h}`;
    });
  }

  // Loading

  #setAudioSource(): void {
    const src = this.getAttribute('audio');
    this.#audioReady = false;
    this.#canplayFired = false;
    this.#audioTooShort = false;
    if (src) this.#audio.src = new URL(src, document.baseURI).href;
    else this.#audio.removeAttribute('src');
    this.#audio.load();
  }

  #queueLoad(): void {
    if (this.#loadQueued || !this.isConnected) return;
    this.#loadQueued = true;
    queueMicrotask(() => {
      this.#loadQueued = false;
      void this.#loadSync();
    });
  }

  async #loadSync(): Promise<void> {
    this.#load?.abort();
    const load = new AbortController();
    this.#load = load;
    this.#loadSettled = false;
    this.#canplayFired = false;
    this.#setSync(null);
    let sync: SyncMap | null = null;
    try {
      if (this.#syncProperty) {
        sync = checkSyncMap(this.#syncProperty);
      } else {
        const result = await loadSync(
          {
            pages: this.#pageUrls(),
            positions: this.getAttribute('positions'),
            notes: this.getAttribute('notes'),
            sync: this.getAttribute('sync'),
          },
          load.signal,
        );
        if (load.signal.aborted) return;
        for (const warning of result.warnings) this.#warn(warning);
        this.#setPageSizes(result.pageSizes);
        sync = result.sync;
      }
      const pages = this.#pages.length;
      if (sync?.bars.some(([page]) => page >= pages)) {
        throw new Error(`The sync map has bars on pages the player wasn't given (${pages} pages)`);
      }
    } catch (error) {
      if (load.signal.aborted) return;
      this.#warn(`Playing without markers: ${error instanceof Error ? error.message : String(error)}`);
      sync = null;
    }
    this.#setSync(sync);
    this.#loadSettled = true;
    this.#maybeCanPlay();
  }

  #setSync(sync: SyncMap | null): void {
    this.#sync = sync;
    this.#timeline = sync ? createTimeline(sync) : null;
    this.#lastEventMs = sync?.events.at(-1)?.[1] ?? 0;
    this.#event = -1;
    this.#bar = -1;
    this.#checkAudioLength();
    this.#update();
  }

  #checkAudioLength(): void {
    const duration = this.#audio.duration;
    const tooShort = this.#timeline !== null && Number.isFinite(duration) && duration * 1000 < this.#lastEventMs;
    if (tooShort && !this.#audioTooShort) {
      this.#warn(
        `Playing without markers: the audio (${duration.toFixed(1)} s) ends before the last bar starts ` +
          `(${(this.#lastEventMs / 1000).toFixed(1)} s). Was "Play repeats" off when it was exported?`,
      );
    }
    this.#audioTooShort = tooShort;
    this.#update();
  }

  #maybeCanPlay(): void {
    if (this.#audioReady && this.#loadSettled && !this.#canplayFired) {
      this.#canplayFired = true;
      this.dispatchEvent(new Event('canplay'));
    }
  }

  #warn(message: string): void {
    console.warn(`<segno-player>: ${message}`);
  }

  // Following the audio

  #startLoop(): void {
    const tick = (): void => {
      this.#update();
      this.#frame = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(tick);
  }

  #stopLoop(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** Moves the markers to where the audio is */
  #update(): void {
    const timeline = this.#audioTooShort ? null : this.#timeline;
    this.#pagesEl.toggleAttribute('data-markers', timeline !== null);
    if (!timeline) {
      for (const el of [...this.#markers, this.#cursor]) el.hidden = true;
      this.#event = -1;
      this.#bar = -1;
      return;
    }
    const audio = this.#audio;
    const rate = audio.playbackRate || 1;
    const ms = audio.currentTime * 1000;
    const endMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined;
    const barLead = numberAttribute(this.getAttribute('bar-lead'), DEFAULT_BAR_LEAD);
    const noteLead = numberAttribute(this.getAttribute('note-lead'), DEFAULT_NOTE_LEAD);

    const now = timeline.at(ms + barLead * rate, endMs);
    if (now && now.event !== this.#event) {
      const changedBar = now.bar !== this.#bar;
      this.#event = now.event;
      this.#bar = now.bar;
      if (changedBar) this.#placeBar(now.page, now.box);
      this.dispatchEvent(new CustomEvent<BarChangeDetail>('barchange', { detail: { bar: now.bar, event: now.event } }));
      if (!audio.paused) this.#follow();
    }

    const note = this.getAttribute('note-cursor') === 'off' ? null : timeline.noteAt(ms + noteLead * rate, endMs);
    const cursor = this.#cursor;
    cursor.hidden = !note;
    if (note) {
      const overlay = this.#pages[note.page]?.overlay;
      if (overlay && cursor.parentElement !== overlay) overlay.append(cursor);
      cursor.style.left = percent(note.x);
      cursor.style.top = percent(note.y);
      cursor.style.height = percent(note.h);
    }
  }

  /** Crossfades the bar marker to a bar: the current one fades out, the other fades in on the new bar */
  // @decision(DL-006)
  #placeBar(page: number, [x, y, w, h]: [number, number, number, number]): void {
    const previous = this.#markers[this.#activeMarker];
    this.#activeMarker = 1 - this.#activeMarker;
    const next = this.#markers[this.#activeMarker];
    const overlay = this.#pages[page]?.overlay;
    if (!previous || !next || !overlay) return;
    previous.classList.remove('on');
    if (next.parentElement !== overlay) overlay.append(next);
    const width = w + 2 * BAR_OVERLAP;
    Object.assign(next.style, {
      left: percent(x - BAR_OVERLAP),
      top: percent(y),
      width: percent(width),
      height: percent(h),
    });
    next.style.setProperty('--fade', percent(BAR_OVERLAP / width));
    next.hidden = false;
    next.classList.add('on');
  }

  /** With `follow`, scrolls the playing system into view when it leaves the viewport */
  #follow(): void {
    const marker = this.#markers[this.#activeMarker];
    if (!this.hasAttribute('follow') || !marker?.isConnected) return;
    const rect = marker.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    marker.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }

  // Interaction

  #onClick(event: MouseEvent): void {
    const timeline = this.#timeline;
    const index = this.#pages.findIndex(({ page }) => event.composedPath().includes(page));
    const page = this.#pages[index];
    if (!timeline || !page || this.#audioTooShort) return;
    const rect = page.overlay.getBoundingClientRect();
    const bar = timeline.barAtPoint(
      index,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
    const ms = bar < 0 ? -1 : timeline.seekTimeForBar(bar, this.currentTime * 1000);
    if (ms >= 0) this.currentTime = ms / 1000;
  }

  // @decision(DL-016)
  #onKey(event: KeyboardEvent): void {
    const timeline = this.#audioTooShort ? null : this.#timeline;
    const seekToEvent = (i: number): void => {
      const event = timeline?.events[Math.max(0, i)];
      this.currentTime = event ? event[1] / 1000 : 0;
    };
    switch (event.key) {
      case ' ':
      case 'k':
        if (this.paused) this.play().catch(() => {});
        else this.pause();
        break;
      case 'ArrowRight':
        if (timeline) seekToEvent(timeline.eventIndexAt(this.currentTime * 1000) + 1);
        else this.currentTime += 5;
        break;
      case 'ArrowLeft':
        if (timeline) seekToEvent(timeline.eventIndexAt(this.currentTime * 1000) - 1);
        else this.currentTime = Math.max(0, this.currentTime - 5);
        break;
      case 'Home':
        this.currentTime = 0;
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Tells screen readers where playback is: on pause and after seeking, never during playback */
  #announce(): void {
    if (this.#bar < 0 || !this.#timeline) return;
    this.#live.textContent = `Bar ${this.#bar + 1} of ${this.#timeline.bars.length}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'segno-player': SegnoPlayer;
  }
}
