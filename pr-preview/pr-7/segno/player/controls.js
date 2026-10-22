// SPDX-License-Identifier: MIT
// Copyright (C) 2026 The Segno contributors
// https://github.com/jimutt/segno
import { formatTime } from './format.js';
const svgNS = 'http://www.w3.org/2000/svg';
const icons = { play: 'M4 2.5v11l9.5-5.5z', pause: 'M3.5 2h3v12h-3zM9.5 2h3v12h-3z' };
// An element with a class name, a part and some properties
function element(tag, name, part, props = {}) {
    const el = Object.assign(document.createElement(tag), props);
    el.className = name;
    el.setAttribute('part', part);
    return el;
}
/**
 * The built-in controls: play/pause, the time, a seek slider and the tempo, all native elements.
 * @decision(DL-016)
 */
export function createControls(player) {
    const bar = element('div', 'controls', 'controls');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Player');
    const play = element('button', 'play', 'play-button', { type: 'button' });
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNS, 'path');
    icon.append(path);
    play.append(icon);
    play.addEventListener('click', () => {
        if (player.paused)
            player.play().catch(() => { });
        else
            player.pause();
    });
    const time = element('span', 'time', 'time');
    const seek = element('input', 'seek', 'seek', { type: 'range', min: '0', max: '0', step: 'any' });
    seek.setAttribute('aria-label', 'Position');
    seek.addEventListener('input', () => {
        player.currentTime = Number(seek.value);
    });
    const tempo = element('select', 'tempo', 'tempo');
    tempo.setAttribute('aria-label', 'Tempo');
    for (let percent = 50; percent <= 150; percent += 10) {
        tempo.append(new Option(`${percent}%`, String(percent / 100), percent === 100, percent === 100));
    }
    tempo.addEventListener('change', () => {
        player.playbackRate = Number(tempo.value);
    });
    const showState = () => {
        const paused = player.paused;
        path.setAttribute('d', paused ? icons.play : icons.pause);
        play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    };
    const showTime = () => {
        const duration = Number.isFinite(player.duration) ? player.duration : 0;
        seek.max = String(duration);
        seek.value = String(player.currentTime);
        const now = formatTime(player.currentTime);
        const total = formatTime(duration);
        time.textContent = `${now} / ${total}`;
        seek.setAttribute('aria-valuetext', `${now} of ${total}`);
    };
    const showRate = () => {
        const value = String(player.playbackRate);
        // A rate the list doesn't have shows as none of them
        tempo.selectedIndex = [...tempo.options].findIndex((o) => o.value === value);
    };
    for (const type of ['play', 'pause', 'ended', 'emptied'])
        player.addEventListener(type, showState);
    for (const type of ['timeupdate', 'durationchange', 'seeked', 'emptied'])
        player.addEventListener(type, showTime);
    player.addEventListener('ratechange', showRate);
    showState();
    showTime();
    bar.append(play, time, seek, tempo);
    return bar;
}
//# sourceMappingURL=controls.js.map