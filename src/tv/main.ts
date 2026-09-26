import './polyfills';
import './styles.css';
import { api, getToken, setToken, loadSettings, saveSettings, UnauthorizedError, TvFolder, TvItem, MediaKind, TvSettings } from './api';
import { Action, FocusManager, actionFor } from './nav';
import { countLabel, t } from './i18n';

/**
 * TV mode: browse project albums with a remote control. Screens are plain
 * DOM (no framework) so the bundle stays small and runs on old TV browsers.
 *
 *   #/                 albums
 *   #/f/<id|recent>    one album as a grid; the viewer opens over it
 *   #/settings         slideshow settings and unlinking
 *   (no token)         pairing screen
 */

const PAGE_SIZE = 60;
/** Presigned media links last 6 hours; reload lists well before that. */
const LINK_MAX_AGE_MS = 4 * 3600 * 1000;

const root = document.getElementById('app') as HTMLElement;
const focus = new FocusManager();
let settings: TvSettings = loadSettings();

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; focusable?: boolean; onOk?: () => void };

function h(tag: string, props?: Props | null, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'focusable') el.setAttribute('data-focus', '');
      else if (key === 'onOk') (el as FocusTarget).onTvOk = value as () => void;
      else if (key === 'onFocus') (el as FocusTarget).onTvFocus = value as () => void;
      else if (key === 'html') el.innerHTML = String(value);
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: (Child | Child[])[]) {
  for (const child of children) {
    if (Array.isArray(child)) append(el, child);
    else if (child !== null && child !== undefined && child !== false) {
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
}

interface FocusTarget extends HTMLElement {
  onTvOk?: () => void;
  onTvFocus?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString();
  } catch (e) {
    return '';
  }
}

/** Loads an <img> only once it is near the visible part of its scroller. */
const lazyObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target as HTMLImageElement;
      const src = img.getAttribute('data-src');
      if (src) {
        img.src = src;
        img.removeAttribute('data-src');
      }
      lazyObserver!.unobserve(img);
    }
  }, { rootMargin: '600px 0px' })
  : null;

function lazyImage(src: string | null): HTMLElement | null {
  if (!src) return null;
  const img = h('img', { alt: '' }) as HTMLImageElement;
  img.onload = () => img.classList.add('is-loaded');
  if (lazyObserver) {
    img.setAttribute('data-src', src);
    lazyObserver.observe(img);
  } else {
    img.src = src;
  }
  return img;
}

function clock(): HTMLElement {
  const el = h('div', { class: 'tv-clock' });
  const tick = () => {
    const now = new Date();
    el.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  tick();
  const timer = window.setInterval(() => {
    if (!document.body.contains(el)) window.clearInterval(timer);
    else tick();
  }, 15000);
  return el;
}

function topBar(crumb: string, extra?: HTMLElement | null): HTMLElement {
  return h('div', { class: 'tv-bar' },
    h('div', { class: 'tv-brand', html: 'Remix <span>Studio</span>' }),
    h('div', { class: 'tv-crumb' }, crumb),
    extra,
    clock(),
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

interface Screen {
  el: HTMLElement;
  /** Returns true when the action was handled. */
  onAction(action: Action): boolean;
  destroy(): void;
}

let screen: Screen | null = null;
/** The viewer is layered over the album it was opened from. */
let overlay: Screen | null = null;

function mount(next: Screen) {
  if (overlay) {
    overlay.destroy();
    overlay = null;
  }
  if (screen) screen.destroy();
  root.innerHTML = '';
  screen = next;
  root.appendChild(next.el);
  focus.setRoot(next.el);
}

function handleUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    setToken(null);
    route();
    return true;
  }
  return false;
}

// ---------- Pairing ----------

function pairingScreen(): Screen {
  const el = h('div', { class: 'tv-screen' });
  let pollTimer = 0;
  let destroyed = false;

  const render = (content: HTMLElement) => {
    el.innerHTML = '';
    el.appendChild(topBar(''));
    el.appendChild(content);
  };

  const retryButton = () => h('div', { class: 'tv-button is-primary', focusable: true, onOk: start }, t('linkRetry'));

  async function start() {
    window.clearTimeout(pollTimer);
    render(h('div', { class: 'tv-pair' }, h('div', { class: 'tv-status' }, '…')));
    let pairing;
    try {
      pairing = await api.startPairing();
    } catch (e) {
      render(h('div', { class: 'tv-pair' }, h('div', { class: 'tv-pair-text' }, h('p', null, t('loadFailed')), retryButton())));
      focus.focusFirst();
      return;
    }
    if (destroyed) return;
    const code = pairing.userCode;
    const status = h('div', { class: 'tv-status' }, t('linkWaiting'));
    const linkBase = pairing.linkUrl.replace(/\?.*$/, '');
    render(h('div', { class: 'tv-pair' },
      h('div', { class: 'tv-pair-text' },
        h('h1', null, t('linkTitle')),
        h('p', null, t('linkStep1')),
        h('div', { class: 'tv-url' }, linkBase.replace(/^https?:\/\//, '')),
        h('p', null, t('linkStep2')),
        h('div', { class: 'tv-code', html: `${code.slice(0, 4)}<span>-</span>${code.slice(4)}` }),
        status,
      ),
      h('div', { class: 'tv-qr', html: pairing.qrSvg }),
    ));

    const poll = async () => {
      if (destroyed) return;
      if (Date.now() > pairing.expiresAt) {
        status.textContent = t('linkExpired');
        pollTimer = window.setTimeout(start, 1500);
        return;
      }
      try {
        const result = await api.pollPairing(pairing.deviceCode);
        if (destroyed) return;
        if (result) {
          setToken(result.token);
          navigate('#/', true);
          return;
        }
      } catch (e) {
        const message = (e as Error).message;
        if (message === 'expired') {
          status.textContent = t('linkExpired');
          pollTimer = window.setTimeout(start, 1500);
          return;
        }
        if (message === 'denied') {
          render(h('div', { class: 'tv-pair' }, h('div', { class: 'tv-pair-text' }, h('h1', null, t('linkDenied')), retryButton())));
          focus.focusFirst();
          return;
        }
        // Network hiccup: keep polling.
      }
      pollTimer = window.setTimeout(poll, pairing.interval * 1000);
    };
    pollTimer = window.setTimeout(poll, pairing.interval * 1000);
  }

  void start();
  return {
    el,
    onAction: () => false,
    destroy() {
      destroyed = true;
      window.clearTimeout(pollTimer);
    },
  };
}

// ---------- Albums ----------

let lastAlbumId: string | null = null;

function albumsScreen(): Screen {
  const scroll = h('div', { class: 'tv-scroll', 'data-scroll': '' });
  const settingsButton = h('div', { class: 'tv-button tv-icon-button', focusable: true, onOk: () => navigate('#/settings') }, `⚙ ${t('settings')}`);
  const el = h('div', { class: 'tv-screen' }, topBar(t('albums'), settingsButton), h('div', { class: 'tv-body' }, scroll));
  let destroyed = false;

  const load = async () => {
    scroll.innerHTML = '';
    scroll.appendChild(h('div', { class: 'tv-message' }, '…'));
    let folders: TvFolder[];
    try {
      folders = (await api.folders()).folders;
    } catch (e) {
      if (handleUnauthorized(e) || destroyed) return;
      scroll.innerHTML = '';
      scroll.appendChild(h('div', { class: 'tv-button is-primary', focusable: true, onOk: load }, t('retry')));
      scroll.appendChild(h('div', { class: 'tv-message' }, t('loadFailed')));
      focus.focusFirst();
      return;
    }
    if (destroyed) return;
    scroll.innerHTML = '';
    if (folders.length === 0) {
      scroll.appendChild(h('div', { class: 'tv-message' }, t('empty')));
      focus.focusFirst();
      return;
    }
    const grid = h('div', { class: 'tv-grid', 'data-grid': '' });
    const total = folders.reduce((sum, folder) => sum + folder.itemCount, 0);
    let recentCover: string | null = null;
    for (const folder of folders) if (!recentCover) recentCover = folder.coverUrl;
    grid.appendChild(albumTile({ id: 'recent', name: t('recent'), itemCount: total, coverUrl: recentCover }, true));
    for (const folder of folders) grid.appendChild(albumTile(folder, false));
    scroll.appendChild(grid);
    focus.focusFirst(lastAlbumId ? `[data-album="${lastAlbumId}"]` : '.tv-album');
  };

  function albumTile(folder: Pick<TvFolder, 'id' | 'name' | 'itemCount' | 'coverUrl'>, isRecent: boolean): HTMLElement {
    const open = () => {
      lastAlbumId = folder.id;
      navigate(`#/f/${encodeURIComponent(folder.id)}`);
    };
    return h('div', { class: `tv-tile tv-album${isRecent ? ' is-recent' : ''}`, focusable: true, onOk: open, 'data-album': folder.id },
      h('div', { class: 'tv-cover' }, folder.coverUrl ? lazyImage(folder.coverUrl) : h('div', { class: 'tv-cover-empty' }, '▦')),
      h('div', { class: 'tv-caption' },
        h('div', { class: 'tv-name' }, isRecent ? `★ ${folder.name}` : folder.name),
        h('div', { class: 'tv-meta' }, countLabel(folder.itemCount)),
      ),
    );
  }

  void load();
  return {
    el,
    onAction: () => false,
    destroy() {
      destroyed = true;
    },
  };
}

// ---------- Album grid ----------

interface AlbumState {
  folderId: string;
  kind?: MediaKind;
  tag?: string;
  items: TvItem[];
  total: number;
  loading: boolean;
  loadedAt: number;
}

function albumScreen(folderId: string): Screen {
  const scroll = h('div', { class: 'tv-scroll', 'data-scroll': '' });
  const crumb = h('div', { class: 'tv-crumb' }, folderId === 'recent' ? t('recent') : '');
  const bar = h('div', { class: 'tv-bar' }, h('div', { class: 'tv-brand', html: 'Remix <span>Studio</span>' }), crumb, clock());
  const el = h('div', { class: 'tv-screen' }, bar, h('div', { class: 'tv-body' }, scroll));
  const toolbar = h('div', { class: 'tv-toolbar' });
  const grid = h('div', { class: 'tv-grid', 'data-grid': '' });
  const footer = h('div', { class: 'tv-more' });
  let destroyed = false;
  let tags: { tag: string; count: number }[] = [];

  const state: AlbumState = { folderId, items: [], total: 0, loading: false, loadedAt: 0 };

  async function loadMore(): Promise<boolean> {
    if (state.loading || (state.loadedAt && state.items.length >= state.total)) return false;
    state.loading = true;
    footer.textContent = '…';
    try {
      const page = await api.items(folderId, { offset: state.items.length, limit: PAGE_SIZE, kind: state.kind, tag: state.tag, order: settings.order });
      if (destroyed) return false;
      if (!state.loadedAt) state.loadedAt = Date.now();
      state.total = page.total;
      const start = state.items.length;
      state.items = state.items.concat(page.items);
      for (let i = 0; i < page.items.length; i++) grid.appendChild(mediaTile(page.items[i], start + i));
      updateCount();
      return page.items.length > 0;
    } catch (e) {
      if (handleUnauthorized(e)) return false;
      footer.textContent = t('loadFailed');
      return false;
    } finally {
      state.loading = false;
      if (!destroyed) footer.textContent = state.items.length < state.total ? '…' : '';
    }
  }

  const countEl = h('span', { class: 'tv-count' });
  function updateCount() {
    countEl.textContent = countLabel(state.total);
  }

  function mediaTile(item: TvItem, index: number): HTMLElement {
    const badge = item.kind === 'video'
      ? h('div', { class: 'tv-badge' }, `▶ ${formatDuration(item.duration)}`)
      : item.kind === 'audio' ? h('div', { class: 'tv-badge' }, '♪') : null;
    return h('div', {
      class: 'tv-tile tv-media',
      focusable: true,
      onOk: () => openViewer(index, false),
      // Fetch the next page before focus reaches the end of what is loaded.
      onFocus: () => {
        if (index >= state.items.length - 30) void loadMore();
      },
    },
    h('div', { class: 'tv-placeholder' }, item.kind === 'image' ? '' : item.kind === 'video' ? '▶' : '♪'),
    lazyImage(item.thumbnailUrl),
    badge,
    );
  }

  function openViewer(index: number, slideshow: boolean) {
    if (state.items.length === 0) return;
    pushViewerState();
    openOverlay(viewerScreen(state, index, slideshow, loadMore, (lastIndex) => {
      // Back in the grid, focus follows what was last on screen.
      const tile = grid.children[lastIndex] as HTMLElement | undefined;
      if (tile) focus.focus(tile);
    }));
  }

  function chip(label: string, active: boolean, onOk: () => void) {
    return h('div', { class: `tv-chip${active ? ' is-active' : ''}`, focusable: true, onOk }, label);
  }

  function renderToolbar() {
    toolbar.innerHTML = '';
    append(toolbar, [
      h('div', { class: 'tv-button is-primary', focusable: true, onOk: () => openViewer(0, true), 'data-play': '' }, `▶ ${t('slideshow')}`),
      chip(t('all'), !state.kind && !state.tag, () => applyFilter(undefined, undefined)),
      chip(t('photos'), state.kind === 'image', () => applyFilter('image', undefined)),
      chip(t('videos'), state.kind === 'video', () => applyFilter('video', undefined)),
      tags.slice(0, 12).map(({ tag }) => chip(`# ${tag}`, state.tag === tag, () => applyFilter(undefined, tag))),
      countEl,
    ]);
  }

  function applyFilter(kind: MediaKind | undefined, tag: string | undefined) {
    state.kind = kind;
    state.tag = tag;
    reset();
    renderToolbar();
    focus.focusFirst('.tv-chip.is-active');
    void loadMore();
  }

  function reset() {
    state.items = [];
    state.total = 0;
    state.loadedAt = 0;
    grid.innerHTML = '';
  }

  async function init() {
    append(scroll, [toolbar, grid, footer]);
    if (folderId !== 'recent') {
      try {
        const info = await api.folder(folderId);
        if (destroyed) return;
        crumb.textContent = info.folder.name;
        tags = info.tags;
      } catch (e) {
        if (handleUnauthorized(e) || destroyed) return;
      }
    }
    renderToolbar();
    await loadMore();
    if (destroyed) return;
    if (state.items.length === 0 && state.total === 0) footer.textContent = t('empty');
    focus.focusFirst(state.items.length > 0 ? '.tv-media' : '[data-play]');
  }

  void init();
  return {
    el,
    onAction(action) {
      if (action === 'play' || action === 'playpause') {
        const current = focus.current;
        let index = 0;
        for (let i = 0; i < grid.children.length; i++) if (grid.children[i] === current) index = i;
        openViewer(index, true);
        return true;
      }
      return false;
    },
    destroy() {
      destroyed = true;
    },
  };
}

// ---------- Viewer ----------

function viewerScreen(
  state: AlbumState,
  startIndex: number,
  startPlaying: boolean,
  loadMore: () => Promise<boolean>,
  onClose: (index: number) => void,
): Screen {
  const layers = [h('img', { alt: '' }) as HTMLImageElement, h('img', { alt: '' }) as HTMLImageElement];
  const video = h('video', { playsinline: '', preload: 'auto' }) as HTMLVideoElement;
  const title = h('div', { class: 'tv-caption-title' });
  const meta = h('div', { class: 'tv-caption-meta' });
  const caption = h('div', { class: 'tv-caption-bar' }, title, meta);
  const progress = h('div', { class: 'tv-progress' });
  const toast = h('div', { class: 'tv-toast' });
  const spinner = h('div', { class: 'tv-spinner' });
  const el = h('div', { class: 'tv-viewer' }, layers[0], layers[1], video, spinner, caption, progress, toast);

  let index = startIndex;
  let front = 0;
  let playing = startPlaying;
  let pinnedInfo = false;
  let slideTimer = 0;
  let captionTimer = 0;
  let toastTimer = 0;
  let destroyed = false;
  let token = 0;

  const current = () => state.items[index];

  /** play() rejects when autoplay is blocked or the codec is missing; the UI copes either way. */
  function playVideo() {
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(() => spinner.classList.remove('is-shown'));
  }

  function showToast(text: string) {
    toast.textContent = text;
    toast.classList.add('is-shown');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-shown'), 2500);
  }

  function showCaption(auto: boolean) {
    const item = current();
    if (!item) return;
    // Untitled items get no caption line rather than a made-up one.
    title.textContent = item.prompt || '';
    title.style.display = item.prompt ? '' : 'none';
    meta.innerHTML = '';
    append(meta, [
      h('span', null, `${index + 1} / ${state.total}`),
      h('span', null, formatDate(item.createdAt)),
      item.duration ? h('span', null, formatDuration(item.duration)) : null,
      item.tags.length ? h('span', null, item.tags.map((tag) => `#${tag}`).join('  ')) : null,
      h('span', null, t('hintViewer')),
    ]);
    window.clearTimeout(captionTimer);
    if (pinnedInfo || (auto && settings.captions) || !auto) {
      caption.classList.add('is-shown');
      if (!pinnedInfo) captionTimer = window.setTimeout(() => caption.classList.remove('is-shown'), 4000);
    }
  }

  function stopProgress() {
    progress.style.transition = 'none';
    progress.style.webkitTransition = 'none';
    progress.style.width = '0';
  }

  function runProgress(ms: number) {
    stopProgress();
    // Force a reflow so the transition starts from zero.
    void progress.offsetWidth;
    const transition = `width ${ms}ms linear`;
    progress.style.transition = transition;
    progress.style.webkitTransition = transition;
    progress.style.width = '100%';
  }

  function scheduleNext() {
    window.clearTimeout(slideTimer);
    stopProgress();
    const item = current();
    if (!playing || !item || item.kind !== 'image') return;
    const ms = settings.intervalSeconds * 1000;
    runProgress(ms);
    slideTimer = window.setTimeout(() => void go(1, true), ms);
  }

  /** Keeps presigned links fresh on long slideshows by reloading the list. */
  async function refreshIfStale() {
    if (Date.now() - state.loadedAt < LINK_MAX_AGE_MS) return;
    const keep = state.items.length;
    state.items = [];
    state.loadedAt = 0;
    state.total = 0;
    while (state.items.length < Math.min(keep, index + 1) && (await loadMore())) {
      // keep loading until the current position is covered again
    }
  }

  function preload(i: number) {
    const item = state.items[i];
    if (item && item.kind === 'image' && item.displayUrl) {
      const img = new Image();
      img.src = item.displayUrl;
    }
  }

  async function show() {
    const my = ++token;
    await refreshIfStale();
    if (destroyed || my !== token) return;
    const item = current();
    if (!item) return;
    window.clearTimeout(slideTimer);
    stopProgress();
    spinner.classList.add('is-shown');

    if (item.kind === 'image') {
      video.pause();
      video.classList.remove('is-shown');
      video.removeAttribute('src');
      const back = layers[1 - front];
      back.onload = () => {
        if (my !== token) return;
        spinner.classList.remove('is-shown');
        back.classList.add('is-shown');
        layers[front].classList.remove('is-shown');
        front = 1 - front;
        scheduleNext();
      };
      back.onerror = () => {
        if (my !== token) return;
        spinner.classList.remove('is-shown');
        scheduleNext();
      };
      back.src = item.displayUrl || item.url || '';
      preload(index + 1);
    } else {
      layers[0].classList.remove('is-shown');
      layers[1].classList.remove('is-shown');
      video.poster = item.posterUrl || '';
      video.src = item.url || '';
      video.classList.add('is-shown');
      video.onplaying = () => spinner.classList.remove('is-shown');
      video.oncanplay = () => spinner.classList.remove('is-shown');
      video.onerror = () => {
        spinner.classList.remove('is-shown');
        showToast(t('videoError'));
        if (playing) window.setTimeout(() => void go(1, true), 1500);
      };
      video.onended = () => {
        if (playing) void go(1, true);
      };
      playVideo();
    }
    showCaption(true);
  }

  async function go(step: number, wrap: boolean) {
    let next = index + step;
    if (next >= state.items.length && state.items.length < state.total) {
      await loadMore();
    }
    if (destroyed) return;
    if (next >= state.items.length) {
      if (!wrap) return;
      next = 0;
    }
    if (next < 0) {
      if (!wrap) return;
      next = state.items.length - 1;
    }
    index = next;
    await show();
  }

  function togglePlaying(value = !playing) {
    playing = value;
    showToast(playing ? `▶ ${t('playing')}` : `❚❚ ${t('paused')}`);
    const item = current();
    if (item && item.kind !== 'image') {
      if (playing && video.paused) playVideo();
    }
    scheduleNext();
  }

  void show();
  if (playing) showToast(`▶ ${t('playing')}`);

  return {
    el,
    onAction(action) {
      const item = current();
      const isMedia = item && item.kind !== 'image';
      switch (action) {
        case 'right':
        case 'next':
          void go(1, playing);
          return true;
        case 'left':
        case 'prev':
          void go(-1, playing);
          return true;
        case 'ok':
          if (isMedia) {
            if (video.paused) playVideo();
            else video.pause();
            return true;
          }
          pinnedInfo = !pinnedInfo;
          if (pinnedInfo) showCaption(false);
          else caption.classList.remove('is-shown');
          return true;
        case 'up':
        case 'down':
        case 'info':
          pinnedInfo = !pinnedInfo;
          if (pinnedInfo) showCaption(false);
          else caption.classList.remove('is-shown');
          return true;
        case 'play':
          if (isMedia && video.paused) playVideo();
          togglePlaying(true);
          return true;
        case 'pause':
          if (isMedia) video.pause();
          togglePlaying(false);
          return true;
        case 'playpause':
          togglePlaying();
          return true;
        case 'stop':
          history.back();
          return true;
        default:
          return false;
      }
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(slideTimer);
      window.clearTimeout(captionTimer);
      window.clearTimeout(toastTimer);
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch (e) {
        // ignore
      }
      onClose(index);
    },
  };
}

function openOverlay(next: Screen) {
  if (overlay) overlay.destroy();
  overlay = next;
  root.appendChild(next.el);
  if (screen) screen.el.classList.add('is-hidden');
}

function closeOverlay() {
  if (!overlay) return;
  const closing = overlay;
  overlay = null;
  if (closing.el.parentNode) closing.el.parentNode.removeChild(closing.el);
  if (screen) screen.el.classList.remove('is-hidden');
  closing.destroy();
}

// ---------- Settings ----------

function settingsScreen(): Screen {
  const list = h('div', { class: 'tv-settings' });
  const scroll = h('div', { class: 'tv-scroll', 'data-scroll': '' }, h('div', { class: 'tv-heading' }, t('settings')), list);
  const el = h('div', { class: 'tv-screen' }, topBar(t('settings')), h('div', { class: 'tv-body' }, scroll));
  const intervals = [3, 5, 8, 15, 30];
  let confirmUnlink = false;
  let deviceName = '';

  function row(label: string, value: string, onOk?: () => void, extraClass = '') {
    return h('div', { class: `tv-row${extraClass}`, focusable: !!onOk, onOk },
      h('span', null, label),
      h('span', { class: 'tv-value' }, value),
    );
  }

  function render(focusIndex = 0) {
    list.innerHTML = '';
    append(list, [
      row(t('interval'), t('seconds', { n: settings.intervalSeconds }), () => {
        const next = intervals[(intervals.indexOf(settings.intervalSeconds) + 1) % intervals.length];
        update({ intervalSeconds: next }, 0);
      }),
      row(t('order'), settings.order === 'newest' ? t('newest') : t('oldest'), () => {
        update({ order: settings.order === 'newest' ? 'oldest' : 'newest' }, 1);
      }),
      row(t('showInfo'), settings.captions ? t('on') : t('off'), () => update({ captions: !settings.captions }, 2)),
      row(t('unlink'), confirmUnlink ? t('unlinkConfirm') : '', unlink, ' is-danger'),
      row(t('device'), deviceName, undefined, ' is-static'),
    ]);
    const rows = focus.focusables();
    focus.focus(rows[Math.min(focusIndex, rows.length - 1)] || null);
  }

  function update(patch: Partial<TvSettings>, focusIndex: number) {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    render(focusIndex);
  }

  async function unlink() {
    if (!confirmUnlink) {
      confirmUnlink = true;
      render(3);
      return;
    }
    try {
      await api.logout();
    } catch (e) {
      // Unlink locally even if the server is unreachable.
    }
    setToken(null);
    navigate('#/', true);
  }

  render();
  api.session().then((session) => {
    deviceName = session.deviceName;
    const rows = focus.focusables();
    let index = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i] === focus.current) index = i;
    render(index);
  }).catch(handleUnauthorized);

  return { el, onAction: () => false, destroy: () => {} };
}

// ---------------------------------------------------------------------------
// Routing and input
// ---------------------------------------------------------------------------

/** How many history entries this app pushed that Back can still pop. */
let depth = 0;
let lastPopAt = 0;

function navigate(hash: string, replace = false) {
  if (replace) history.replaceState(null, '', hash);
  else {
    history.pushState(null, '', hash);
    depth++;
  }
  route();
}

function pushViewerState() {
  history.pushState({ viewer: true }, '', `${location.hash.split('?')[0]}?view`);
  depth++;
}

let currentRoute = '';

function route() {
  const hash = location.hash || '#/';
  const [path, flag] = hash.split('?');

  if (!getToken()) {
    currentRoute = 'pair';
    mount(pairingScreen());
    return;
  }

  // The viewer is history state layered over its album.
  if (path === currentRoute) {
    if (flag !== 'view' && overlay) closeOverlay();
    else if (flag === 'view' && !overlay) history.replaceState(null, '', path);
    return;
  }
  if (flag === 'view') {
    // A reload inside the viewer lands back on its album.
    history.replaceState(null, '', path);
  }
  currentRoute = path;

  const folder = /^#\/f\/(.+)$/.exec(path);
  if (folder) mount(albumScreen(decodeURIComponent(folder[1])));
  else if (path === '#/settings') mount(settingsScreen());
  else mount(albumsScreen());
}

window.addEventListener('popstate', () => {
  lastPopAt = Date.now();
  depth = Math.max(0, depth - 1);
  route();
});

/**
 * Some TV platforms already step back in history on the Back key; wait a
 * moment and only go back ourselves when they did not, so one press never
 * pops two screens.
 */
function goBack() {
  const pressedAt = Date.now();
  window.setTimeout(() => {
    if (lastPopAt >= pressedAt) return;
    if (depth > 0) history.back();
    else if (overlay) closeOverlayToAlbum();
    else if (currentRoute !== '#/' && currentRoute !== 'pair') navigate('#/', true);
  }, 150);
}

function closeOverlayToAlbum() {
  history.replaceState(null, '', currentRoute);
  closeOverlay();
}

document.addEventListener('keydown', (event) => {
  const action = actionFor(event);
  if (!action) return;
  event.preventDefault();

  const active = overlay || screen;
  if (active && active.onAction(action)) return;
  if (overlay) {
    if (action === 'back') goBack();
    return;
  }

  switch (action) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      focus.move(action);
      break;
    case 'ok': {
      const target = focus.current as FocusTarget | null;
      if (target && target.onTvOk) target.onTvOk();
      break;
    }
    case 'back':
      goBack();
      break;
    case 'pageup':
    case 'pagedown':
      for (let i = 0; i < 3; i++) focus.move(action === 'pagedown' ? 'down' : 'up');
      break;
    default:
      break;
  }
});

// The LG Magic Remote and mice point and click.
root.addEventListener('mouseover', (event) => {
  let el = event.target as HTMLElement | null;
  while (el && el !== root && !el.hasAttribute('data-focus')) el = el.parentElement;
  if (el && el !== root && el !== focus.current) focus.focus(el, false);
});

root.addEventListener('click', (event) => {
  if (overlay) {
    // A click on the viewer advances, like a tap on a photo frame.
    overlay.onAction('right');
    return;
  }
  let el = event.target as HTMLElement | null;
  while (el && el !== root && !el.hasAttribute('data-focus')) el = el.parentElement;
  if (el && el !== root && (el as FocusTarget).onTvOk) {
    focus.focus(el, false);
    (el as FocusTarget).onTvOk!();
  }
});

let lastWheelAt = 0;
document.addEventListener('wheel', (event) => {
  const now = Date.now();
  if (overlay || now - lastWheelAt < 180 || Math.abs(event.deltaY) < 4) return;
  lastWheelAt = now;
  focus.move(event.deltaY > 0 ? 'down' : 'up');
}, { passive: true } as AddEventListenerOptions);

route();
