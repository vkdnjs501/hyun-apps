/* Hyun-apps 1.3.0 — Progressive, framework-free portfolio controller. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = (number) => String(number).padStart(2, '0');
  const track = $('#projectTrack');
  const body = document.body;
  const root = document.documentElement;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const config = window.HYUN_APPS || {};
  const visuals = window.HYUN_VISUALS || {};
  const ids = new Set();
  const visited = new Set();
  const logicControllers = new Map();
  const projects = (Array.isArray(config.projects) ? config.projects : []).filter((p) => {
    if (!p || !/^[a-z0-9][a-z0-9-]*$/i.test(p.id || '') || !p.title || ids.has(p.id)) return false;
    ids.add(p.id);
    return true;
  });
  let current = -1;
  let offsets = [];
  let frame = 0;
  let animationFrame = 0;
  let settleTimer = 0;
  let toastTimer = 0;
  let resizeFrame = 0;
  let cards = [];
  let tabs = [];
  let ambientLayers = [];
  let isProgrammatic = false;
  let drag = null;
  let suppressClickUntil = 0;
  let announceTimer = 0;
  let wheelAccum = 0;
  let wheelLast = 0;
  let wheelLockUntil = 0;
  let touchStarted = false;

  // Motion is always enabled, independently of OS preferences and legacy saved OFF values.
  // Only offscreen cards, a hidden page, or the showcase behind a dialog are suspended.

  /** Render text as text, never as user-supplied HTML. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function validLink(value) {
    try {
      const url = new URL(value);
      return /^(https:|http:)$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function safeImage(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    // Single-file preview contains only packaged raster assets, never user HTML/SVG.
    if (window.HYUN_STANDALONE && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    try {
      const url = new URL(value, location.href);
      if (/^(https:|http:|file:)$/.test(url.protocol)) return url.href;
    } catch (_) { /* Invalid images fall back to the presentation visual. */ }
    return '';
  }
  function color(value) {
    return /^#[a-f0-9]{6}$/i.test(value || '') ? value : '#c7ee87';
  }
  function icon(kind = 'arrow') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.6');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', kind === 'code' ? 'm8 7-5 5 5 5m8-10 5 5-5 5m-5 3 2-16' : 'M6 18 18 6M6 6h12v12');
    node.append(path);
    return node;
  }
  function externalLink(href, text, className, label, kind) {
    const url = validLink(href);
    if (!url) return null;
    const node = el('a', className);
    node.href = url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    node.setAttribute('aria-label', label || `${text}, 새 탭`);
    node.append(el('span', '', text), icon(kind));
    return node;
  }

  /** Read-only illustration preview. No original-game scripts, storage, or progress are loaded. */
  function mountLogic(project, card, object, caption) {
    const scene = $('.logic-showcase', object);
    const members = (Array.isArray(project.characters) ? project.characters : []).slice(0, 3);
    if (!scene || !members.length) {
      object.replaceChildren(el('div', 'logic-static-fallback', '✦ 논리탐험대'));
      return { hydrate() {} };
    }
    const cast = $('.logic-cast', scene);
    const env = $('.logic-environments', scene);
    const choices = $('.logic-character-buttons', scene);
    const topic = $('.logic-topic', scene);
    const status = $('.logic-media-status', scene);
    const buttons = [], frames = [], portraits = [], rooms = [];
    const states = members.map(() => ({ portrait: 'idle', room: 'idle' }));
    let selected = 0;
    let hydrated = false;
    topic.id = `${project.id}-character-topic`;
    const describeMedia = () => {
      const failed = states[selected].portrait === 'failed';
      scene.classList.toggle('has-media-error', failed);
      caption.textContent = failed ? '이미지 없이 보기 · 탐험 시작 가능' : '원본 일러스트를 활용한 소개 연출';
      status.textContent = failed ? `${members[selected].name}의 그림을 불러오지 못했습니다. 탐험 시작 버튼으로 원본 앱을 열 수 있습니다.` : '';
    };
    const loadImage = (index, type) => {
      if (states[index][type] !== 'idle') return;
      const image = type === 'portrait' ? portraits[index] : rooms[index];
      const url = safeImage(members[index][type]);
      states[index][type] = 'loading';
      const fail = () => {
        states[index][type] = 'failed';
        image.classList.add('is-failed');
        if (index === selected) describeMedia();
      };
      image.addEventListener('load', () => {
        if (!image.naturalWidth) { fail(); return; }
        states[index][type] = 'loaded';
        image.classList.add('is-loaded');
        if (type === 'portrait') frames[index].classList.add('has-portrait');
        if (index === selected) describeMedia();
      }, { once: true });
      image.addEventListener('error', fail, { once: true });
      if (url) image.src = url;
      else fail();
    };
    const select = (index, moveFocus = false, announce = true) => {
      selected = (index + members.length) % members.length;
      scene.dataset.character = members[selected].id;
      scene.style.setProperty('--character-accent', color(members[selected].accent));
      members.forEach((member, i) => {
        const distance = (i - selected + members.length) % members.length;
        frames[i].dataset.slot = distance === 0 ? 'center' : distance === 1 ? 'right' : 'left';
        buttons[i].setAttribute('aria-pressed', String(i === selected));
        rooms[i].classList.toggle('is-selected', i === selected);
      });
      topic.textContent = members[selected].topic;
      topic.setAttribute('aria-label', `${members[selected].name} — ${members[selected].topic}`);
      if (hydrated) loadImage(selected, 'room');
      if (announce) describeMedia();
      if (moveFocus) buttons[selected].focus({ preventScroll: true });
    };
    members.forEach((member, i) => {
      const room = el('img', 'logic-room');
      room.alt = ''; room.decoding = 'async'; room.width = room.height = 627;
      room.draggable = false;
      rooms.push(room); env.append(room);
      const frame = el('div', 'logic-frame');
      frame.dataset.character = member.id;
      const enter = el('div', 'logic-frame-enter');
      const floating = el('div', 'logic-frame-float ambient-motion');
      floating.style.setProperty('--float-delay', `${i * -1.8}s`);
      const portrait = el('div', 'logic-portrait');
      const fallback = el('div', 'logic-portrait-fallback');
      fallback.append(el('span', 'logic-symbol', '✦'), el('span', '', member.name), el('small', '', 'LOGIC EXPEDITION'));
      const image = el('img', 'logic-portrait-image');
      image.alt = ''; image.decoding = 'async'; image.width = image.height = 627;
      image.draggable = false;
      portrait.append(fallback, image);
      const label = el('div', 'logic-frame-label');
      label.append(el('strong', '', member.name), el('span', '', member.role || 'EXPLORE'));
      floating.append(portrait, label); enter.append(floating); frame.append(enter); cast.append(frame);
      frames.push(frame); portraits.push(image);
      const button = el('button', 'logic-character-button');
      button.type = 'button'; button.dataset.character = member.id;
      button.tabIndex = -1;
      button.style.setProperty('--choice-accent', color(member.accent));
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${member.name} — ${member.topic}`);
      button.setAttribute('aria-describedby', topic.id);
      const dot = el('i'); dot.setAttribute('aria-hidden', 'true');
      button.append(dot, el('span', '', member.name));
      button.addEventListener('click', () => select(i));
      button.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const key = event.key;
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = key === 'Home' ? 0 : key === 'End' ? members.length - 1 : i + (key === 'ArrowRight' ? 1 : -1);
        select(next, true);
      });
      choices.append(button); buttons.push(button);
    });
    select(0, false, false);
    return {
      hydrate() {
        if (hydrated) return;
        hydrated = true;
        scene.classList.add('is-hydrated');
        members.forEach((_, i) => loadImage(i, 'portrait'));
        loadImage(selected, 'room');
      }
    };
  }

  function render() {
    if (!projects.length) {
      const notice = el('div', 'noscript-panel');
      notice.append(el('h2', '', '프로젝트를 추가해 주세요.'), el('p', '', 'projects.js의 프로젝트 목록을 확인해 주세요.'));
      track.append(notice);
      $('#prevButton').disabled = $('#nextButton').disabled = true;
      return;
    }
    const fragment = document.createDocumentFragment();
    projects.forEach((p, index) => {
      const accent = color(p.accent);
      const card = el('article', 'project');
      card.id = `project-${p.id}`;
      card.dataset.projectId = p.id;
      card.dataset.index = String(index);
      if (p.visual === 'logic') card.classList.add('project--logic');
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', '슬라이드');
      card.setAttribute('aria-label', `${projects.length}개 중 ${index + 1}. ${p.title}`);
      card.style.setProperty('--accent', accent);
      const surface = el('div', 'project-surface');
      const copy = el('div', 'project-copy');
      const meta = el('div', 'project-meta');
      meta.append(el('span', 'project-index', pad(index + 1)), el('span', '', p.categoryEn || p.category || 'WEB APPLICATION'));
      const title = el('h2', 'project-title');
      const lines = Array.isArray(p.displayTitle) && p.displayTitle.length ? p.displayTitle : [p.title];
      if (lines.some((line) => String(line).length > 6)) title.classList.add('long-title');
      title.setAttribute('aria-label', p.title);
      lines.forEach((line) => {
        const wrap = el('span', 'title-line');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.append(el('span', '', line));
        title.append(wrap);
      });
      const tags = el('div', 'project-tags');
      (Array.isArray(p.tags) ? p.tags : []).slice(0, 4).forEach((tag) => tags.append(el('span', 'project-tag', tag)));
      const actions = el('div', 'project-actions');
      const launch = externalLink(p.launch, p.launchLabel || '앱 열기', 'launch-button', `${p.title} ${p.launchLabel || '앱 열기'}, 새 탭`);
      const repo = externalLink(p.repository, 'GitHub', 'code-link', `${p.title} 소스코드, 새 탭`, 'code');
      if (launch) actions.append(launch);
      if (repo) actions.append(repo);
      const details = el('button', 'details-button');
      details.type = 'button';
      details.dataset.detail = String(index);
      details.setAttribute('aria-haspopup', 'dialog');
      details.setAttribute('aria-controls', 'detailDialog');
      details.setAttribute('aria-label', `${p.title} 프로젝트 이야기`);
      details.append(el('span', '', '프로젝트 이야기'), el('span', '', '→'));
      copy.append(meta, title, el('p', 'project-subtitle', p.subtitle || ''), el('p', 'project-description', p.description || ''), tags, actions, details);
      if (p.localTitle) title.after(el('p', 'project-local-title', p.localTitle));
      const stage = el('div', 'art-stage');
      if (p.visual !== 'logic') stage.setAttribute('aria-hidden', 'true');
      const top = el('div', 'art-topline');
      top.setAttribute('aria-hidden', 'true');
      top.append(el('span', '', 'HYUN-APPS / PROJECT STUDY'), el('span', '', `No. ${pad(index + 1)}`));
      const object = el('div', 'art-object');
      const caption = el('div', 'visual-caption');
      const captionLeft = el('span');
      captionLeft.append(el('i', 'caption-dot'), el('span', 'caption-text', '소개용 모션 비주얼'));
      caption.append(captionLeft, el('span', '', 'EXPLORE THE IDEA ↗'));
      const showVisual = () => {
        object.replaceChildren();
        // Only authored SVG strings in visuals.js are parsed here. No project strings are injected.
        const template = document.createElement('template');
        const knownKey = Object.prototype.hasOwnProperty.call(visuals, p.visual) ? p.visual : 'stock';
        template.innerHTML = visuals[knownKey] || '';
        object.append(template.content.cloneNode(true));
        // Future cards may reuse a visual. Prefix SVG IDs and local references to avoid collisions.
        $$('[id]', object).forEach((node) => {
          const old = node.id;
          const replacement = `${p.id}-${old}`;
          $$('*', object).forEach((item) => {
            [...item.attributes].forEach((attr) => {
              if (attr.value.includes(`url(#${old})`)) item.setAttribute(attr.name, attr.value.replaceAll(`url(#${old})`, `url(#${replacement})`));
            });
          });
          node.id = replacement;
        });
        $$('.art-project-number', object).forEach((number) => { number.textContent = pad(index + 1); });
        if (knownKey === 'logic') {
          stage.removeAttribute('aria-hidden');
          const controller = mountLogic(p, card, object, $('.caption-text', caption));
          logicControllers.set(p.id, controller);
          if (current >= 0 && Math.abs(index - current) <= 1) controller.hydrate();
          $('.caption-text', caption).textContent = '원본 일러스트를 활용한 소개 연출';
        } else $('.caption-text', caption).textContent = '소개용 모션 비주얼';
      };
      const image = safeImage(p.screenshot);
      if (image) {
        const img = el('img');
        img.src = image;
        img.alt = p.screenshotAlt || `${p.title} 화면`;
        img.decoding = 'async';
        img.loading = index ? 'lazy' : 'eager';
        img.addEventListener('error', showVisual, { once: true });
        object.append(img);
        $('.caption-text', caption).textContent = '앱 스크린샷';
      } else showVisual();
      stage.append(top, object, caption);
      surface.append(copy, stage);
      const peek = el('button', 'peek-hit');
      peek.type = 'button';
      peek.tabIndex = -1;
      peek.dataset.go = String(index);
      peek.setAttribute('aria-label', `${p.title} 프로젝트로 이동`);
      card.append(surface, peek);
      fragment.append(card);

      const tab = el('button', 'project-tab');
      tab.type = 'button';
      tab.dataset.go = String(index);
      tab.style.setProperty('--tab-accent', accent);
      tab.setAttribute('aria-label', `${index + 1}. ${p.title} 보기`);
      tab.setAttribute('aria-controls', card.id);
      tab.append(el('span', 'tab-index', pad(index + 1)), el('span', 'tab-name', p.shortTitle || p.title));
      $('#projectTabs').append(tab);

      const item = el('button', 'index-item');
      item.type = 'button';
      item.dataset.go = String(index);
      item.dataset.fromIndex = 'true';
      item.style.setProperty('--item-accent', accent);
      const itemText = el('span');
      itemText.append(el('span', 'index-item-title', p.title), el('span', 'index-item-category', p.category || '웹앱'));
      item.append(el('span', 'index-item-number', pad(index + 1)), itemText, el('span', 'index-item-arrow', '↗'));
      $('#indexList').append(item);

      const wash = el('div', 'ambient-layer');
      wash.style.setProperty('--wash', accent);
      $('#ambient').append(wash);
    });
    track.append(fragment);
    cards = $$('.project', track);
    tabs = $$('.project-tab');
    ambientLayers = $$('.ambient-layer');
    $('#totalHeader').textContent = $('#totalNumber').textContent = pad(projects.length);
    const github = validLink(config.github);
    if (github) $('.github-link').href = github;
  }

  function measure() {
    const gutter = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
    // offsetLeft/offsetWidth ignore animated transforms; safe while parallax is active.
    offsets = cards.map((card) => card.offsetLeft - gutter);
  }
  function nearestIndex() {
    let index = 0;
    let distance = Infinity;
    offsets.forEach((offset, i) => {
      const nextDistance = Math.abs(offset - track.scrollLeft);
      if (nextDistance < distance) { distance = nextDistance; index = i; }
    });
    return index;
  }
  function setCurrent(index, announce = true) {
    if (index === current || !projects[index]) return;
    const previous = current;
    current = index;
    cards.forEach((card, i) => {
      const active = i === index;
      card.classList.toggle('is-active', active);
      card.classList.remove('is-entering');
      $$('.project-copy a,.project-copy button,.logic-character-buttons button', card).forEach((control) => { control.tabIndex = active ? 0 : -1; });
      if (Math.abs(i - index) <= 1) logicControllers.get(projects[i].id)?.hydrate();
      tabs[i].setAttribute('aria-current', active ? 'true' : 'false');
      ambientLayers[i].classList.toggle('is-active', active);
    });
    const firstVisit = !visited.has(projects[index].id);
    visited.add(projects[index].id);
    if (projects[index].visual !== 'logic' || firstVisit) {
      requestAnimationFrame(() => { if (current === index) cards[index].classList.add('is-entering'); });
    }
    root.style.setProperty('--accent', color(projects[index].accent));
    $('#currentNumber').textContent = pad(index + 1);
    $('#prevButton').disabled = index === 0;
    $('#nextButton').disabled = index === projects.length - 1;
    $('#prevButton').setAttribute('aria-label', index > 0 ? `이전 프로젝트: ${projects[index - 1].title}` : '첫 번째 프로젝트입니다');
    $('#nextButton').setAttribute('aria-label', index < projects.length - 1 ? `다음 프로젝트: ${projects[index + 1].title}` : '마지막 프로젝트입니다');
    if (previous !== -1) document.title = `${projects[index].title} — Hyun-apps`;
    if (announce) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { $('#slideAnnouncement').textContent = `${projects.length}개 중 ${index + 1}번째, ${projects[index].title}`; }, 350);
    }
  }
  function updateScroll() {
    frame = 0;
    if (!cards.length) return;
    const position = track.scrollLeft;
    const width = cards[0].offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
    cards.forEach((card, index) => {
      const distance = clamp((offsets[index] - position) / width, -1.5, 1.5);
      card.style.setProperty('--parallax', `${(distance * 35).toFixed(2)}px`);
      card.style.setProperty('--card-scale', (1 - Math.min(Math.abs(distance), 1) * .028).toFixed(4));
      card.style.setProperty('--card-opacity', String(1 - Math.min(Math.abs(distance), 1) * .37));
    });
    const progress = projects.length === 1 ? 1 : clamp((position / Math.max(1, offsets[offsets.length - 1])) * (1 - 1 / projects.length) + 1 / projects.length, 1 / projects.length, 1);
    $('#journeyProgress').style.width = `${progress * 100}%`;
    setCurrent(nearestIndex());
  }
  function scheduleScroll() {
    if (!frame) frame = requestAnimationFrame(updateScroll);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!drag && !isProgrammatic) persistHash();
    }, 220);
  }
  function persistHash() {
    if (current < 0) return;
    const hash = `#${projects[current].id}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (_) { /* file:// and embedded preview may restrict History. */ }
    }
  }
  function stopAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    isProgrammatic = false;
    track.classList.remove('is-programmatic');
  }
  function go(index, { instant = false, focus = false } = {}) {
    if (!cards.length) return;
    index = clamp(index, 0, cards.length - 1);
    stopAnimation();
    track.classList.add('is-programmatic');
    const from = track.scrollLeft;
    const target = offsets[index] || 0;
    const delta = target - from;
    const finish = () => {
      track.scrollLeft = target;
      stopAnimation();
      setCurrent(index);
      updateScroll();
      persistHash();
      if (focus) $('.launch-button, .code-link, .details-button', cards[index])?.focus({ preventScroll: true });
    };
    if (instant || Math.abs(delta) < 1) { finish(); return; }
    const duration = clamp(Math.abs(delta) * .12 + 520, 560, 980);
    const start = performance.now();
    isProgrammatic = true;
    track.classList.add('is-programmatic');
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      // Quintic ease-out: responsive start, gentle settling. No continuous idle JS loop.
      const ease = 1 - Math.pow(1 - t, 5);
      track.scrollLeft = from + delta * ease;
      if (t < 1) animationFrame = requestAnimationFrame(step);
      else finish();
    };
    animationFrame = requestAnimationFrame(step);
  }

  function toast(message) {
    const node = $('#toast');
    clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('is-visible');
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 3100);
  }

  function syncSuspended() {
    body.classList.toggle('is-suspended', document.hidden || !!$('dialog[open]'));
  }
  function openDialog(dialog) {
    if (dialog.open) return;
    dialog.classList.remove('is-closing');
    dialog.showModal();
    syncSuspended();
  }
  function closeDialog(dialog, after) {
    if (!dialog?.open || dialog.classList.contains('is-closing')) return;
    const finish = () => {
      dialog.close();
      dialog.classList.remove('is-closing');
      syncSuspended();
      if (after) after();
    };
    // Suspend only the showcase, not the dialog's enter/exit transition.
    dialog.classList.add('is-closing');
    setTimeout(finish, 190);
  }
  function showDetails(index) {
    const p = projects[index];
    if (!p) return;
    const dialog = $('#detailDialog');
    dialog.style.setProperty('--accent', color(p.accent));
    $('#detailCategory').textContent = `${pad(index + 1)} / ${p.categoryEn || 'PROJECT NOTES'}`;
    $('#detailTitle').textContent = p.title;
    $('#detailPurpose').textContent = p.purpose || p.description || '';
    const features = $('#detailFeatures');
    features.replaceChildren();
    (Array.isArray(p.features) ? p.features : []).forEach((feature, i) => {
      const item = el('div', 'detail-feature');
      item.append(el('span', '', pad(i + 1)), el('div', '', feature));
      features.append(item);
    });
    $('#detailNote').textContent = p.note || '이 비주얼은 앱을 소개하기 위한 개념도입니다.';
    const actions = $('#detailActions');
    actions.replaceChildren();
    const launch = externalLink(p.launch, p.launchLabel || '앱 열기', 'launch-button', `${p.title} ${p.launchLabel || '앱 열기'}, 새 탭`);
    const repo = externalLink(p.repository, 'GitHub', 'code-link', `${p.title} 소스코드, 새 탭`, 'code');
    if (launch) actions.append(launch);
    if (repo) actions.append(repo);
    openDialog(dialog);
  }

  document.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil && event.target.closest('.project-track')) { event.preventDefault(); event.stopPropagation(); return; }
    const goButton = event.target.closest('[data-go]');
    if (goButton) {
      const index = Number(goButton.dataset.go);
      if (goButton.dataset.fromIndex) closeDialog($('#indexDialog'), () => go(index, { focus: true }));
      else go(index);
    }
    const detail = event.target.closest('[data-detail]');
    if (detail) showDetails(Number(detail.dataset.detail));
    const close = event.target.closest('.close-dialog');
    if (close) closeDialog(close.closest('dialog'));
  }, true);
  $('#indexButton').addEventListener('click', () => openDialog($('#indexDialog')));
  $('#developerButton').addEventListener('click', () => {
    $('#developerTitle').textContent = 'Hyun seock Son 의 소개링크로 이동합니다';
    $('#developerDescription').textContent = '다음 화면에서 간단한 소개와 상세 CV를 선택하실 수 있습니다.';
    $('#developerEntryActions').hidden = false;
    $('#developerChoices').hidden = true;
    openDialog($('#developerDialog'));
  });
  $('#developerContinue').addEventListener('click', () => {
    $('#developerTitle').textContent = 'Hyun seock Son의 소개';
    $('#developerDescription').textContent = '원하시는 문서를 선택해 주세요. 각 PDF는 새 탭에서 열립니다.';
    $('#developerEntryActions').hidden = true;
    $('#developerChoices').hidden = false;
    $('#developerIntroduction').focus({ preventScroll: true });
  });
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('close', syncSuspended);
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  });
  document.addEventListener('visibilitychange', syncSuspended);

  $('#prevButton').addEventListener('click', () => go(current - 1));
  $('#nextButton').addEventListener('click', () => go(current + 1));
  $('.brand').addEventListener('click', (event) => { event.preventDefault(); go(0); });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || $('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const focusInCard = !!event.target.closest('.project-copy, .logic-character-buttons');
    if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1, { focus: focusInCard }); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1, { focus: focusInCard }); }
    if (event.key === 'Home' && track.contains(event.target)) { event.preventDefault(); go(0, { focus: focusInCard }); }
    if (event.key === 'End' && track.contains(event.target)) { event.preventDefault(); go(projects.length - 1, { focus: focusInCard }); }
  });

  // Keep real horizontal trackpad/touch gestures native. Map vertical wheel only over the cards.
  track.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey || $('dialog[open]')) return; // Pinch zoom must remain intact.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * .7 && Math.abs(event.deltaX) > 0) {
      if (isProgrammatic) stopAnimation();
      return;
    }
    if (event.shiftKey && event.deltaX === 0) return; // Native Shift+wheel horizontal scrolling.
    // At zoom/short-height fallback, vertical page scroll takes priority.
    if (document.documentElement.scrollHeight > innerHeight + 6) return;
    if (!event.deltaY) return;
    const direction = Math.sign(event.deltaY);
    if ((current === 0 && direction < 0) || (current === projects.length - 1 && direction > 0)) return;
    event.preventDefault();
    const now = performance.now();
    const normalized = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (now - wheelLast > 160 || Math.sign(wheelAccum) !== direction) wheelAccum = 0;
    wheelLast = now;
    if (now < wheelLockUntil) return;
    wheelAccum += normalized;
    if (Math.abs(wheelAccum) >= 28) {
      go(current + direction);
      wheelAccum = 0;
      wheelLockUntil = now + 760;
    }
  }, { passive: false });

  // Mouse-only drag. Touch is delegated to native scrolling for Safari momentum and pinch zoom.
  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a, button, input, select, textarea')) return;
    stopAnimation();
    drag = { id: event.pointerId, startX: event.clientX, startScroll: track.scrollLeft, lastX: event.clientX, lastTime: performance.now(), velocity: 0, moved: false };
  });
  track.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      track.classList.add('is-dragging');
      track.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastTime);
    drag.velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastTime = now;
    track.scrollLeft = drag.startScroll - dx;
  });
  function finishDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const state = drag;
    drag = null;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    track.classList.remove('is-dragging');
    if (!state.moved) return;
    suppressClickUntil = performance.now() + 180;
    const velocity = performance.now() - state.lastTime > 100 ? 0 : state.velocity;
    const predicted = track.scrollLeft - clamp(velocity * 200, -cards[0].offsetWidth * .6, cards[0].offsetWidth * .6);
    let targetIndex = 0;
    offsets.forEach((offset, index) => { if (Math.abs(offset - predicted) < Math.abs(offsets[targetIndex] - predicted)) targetIndex = index; });
    // Prevent native snap from jumping before the custom settling motion starts.
    track.classList.add('is-programmatic');
    go(targetIndex);
  }
  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('pointercancel', finishDrag);
  track.addEventListener('lostpointercapture', (event) => { if (drag) finishDrag(event); });
  window.addEventListener('pointerup', finishDrag);
  track.addEventListener('dragstart', (event) => { if (event.target.tagName === 'IMG') event.preventDefault(); });
  track.addEventListener('touchstart', () => { touchStarted = true; stopAnimation(); }, { passive: true });
  track.addEventListener('touchend', () => { touchStarted = false; }, { passive: true });
  track.addEventListener('touchcancel', () => { touchStarted = false; }, { passive: true });
  track.addEventListener('scroll', scheduleScroll, { passive: true });

  // Lightweight eased pointer tilt: runs only during pointer movement/settling, never on touch.
  let tiltFrame = 0;
  let tiltX = 0, tiltY = 0, targetTiltX = 0, targetTiltY = 0;
  let tiltStage = null;
  function tiltTick() {
    tiltFrame = 0;
    if (!tiltStage) return;
    tiltX += (targetTiltX - tiltX) * .13;
    tiltY += (targetTiltY - tiltY) * .13;
    tiltStage.style.setProperty('--tilt-x', `${tiltX.toFixed(3)}deg`);
    tiltStage.style.setProperty('--tilt-y', `${tiltY.toFixed(3)}deg`);
    if (Math.abs(targetTiltX - tiltX) + Math.abs(targetTiltY - tiltY) > .018) tiltFrame = requestAnimationFrame(tiltTick);
  }
  track.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || drag?.moved || event.pointerType !== 'mouse') return;
    const stage = event.target.closest('.art-stage');
    if (!stage || !stage.closest('.project').classList.contains('is-active')) return;
    if (tiltStage !== stage) {
      if (tiltStage) { tiltStage.style.setProperty('--tilt-x', '0deg'); tiltStage.style.setProperty('--tilt-y', '0deg'); }
      tiltStage = stage;
      tiltX = tiltY = 0;
    }
    const rect = stage.getBoundingClientRect();
    const logicTilt = stage.closest('.project--logic');
    targetTiltY = ((event.clientX - rect.left) / rect.width - .5) * (logicTilt ? 4 : 8);
    targetTiltX = -((event.clientY - rect.top) / rect.height - .5) * (logicTilt ? 4 : 6);
    if (!tiltFrame) tiltFrame = requestAnimationFrame(tiltTick);
  });
  track.addEventListener('pointerleave', () => { targetTiltX = targetTiltY = 0; if (tiltStage && !tiltFrame) tiltFrame = requestAnimationFrame(tiltTick); });

  $('#shareButton').addEventListener('click', async () => {
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      toast('GitHub Pages 배포 후 링크를 공유할 수 있어요.');
      return;
    }
    const url = new URL(location.href);
    url.search = '';
    url.hash = projects[current]?.id || '';
    const share = { title: 'Hyun-apps', text: `${projects[current]?.title || '웹앱'} — Hyun-apps`, url: url.href };
    try {
      if (navigator.share) await navigator.share(share);
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); toast('현재 프로젝트 링크를 복사했어요.'); }
      else {
        const input = el('textarea');
        input.value = url.href;
        input.style.cssText = 'position:fixed;left:-9999px;top:0';
        body.append(input); input.select();
        const copied = document.execCommand('copy');
        input.remove();
        toast(copied ? '현재 프로젝트 링크를 복사했어요.' : '주소창의 링크를 복사해 주세요.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast('공유하지 못했어요. 주소창의 링크를 복사해 주세요.');
    }
  });

  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const index = Math.max(0, current);
      if (touchStarted || drag) { measure(); return; }
      measure();
      go(index, { instant: true });
    });
  }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('hashchange', () => {
    const index = projects.findIndex((p) => `#${p.id}` === location.hash);
    if (index >= 0) go(index);
  });
  window.addEventListener('pageshow', () => { syncSuspended(); measure(); updateScroll(); });

  render();
  measure();
  syncSuspended();
  const initial = projects.findIndex((p) => `#${p.id}` === location.hash);
  go(Math.max(0, initial), { instant: true });
  if ('ResizeObserver' in window && cards[0]) new ResizeObserver(onResize).observe(cards[0]);

  // Cache only this portfolio's shell. Never touch another webapp's cache or storage.
  const mayRegister = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && mayRegister && !window.HYUN_STANDALONE) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {
        // Core portfolio remains usable even if installation/caching is blocked.
      });
    }, { once: true });
  }
})();
