/**
 * Persistent gameplay settings (resolution, wind, pre-shot move).
 */
window.Settings = (function () {
  const STORAGE_KEY = 'sa_settings';

  const RESOLUTIONS = [
    { id: '800x600', w: 800, h: 600, label: '800×600' },
    { id: '960x540', w: 960, h: 540, label: '960×540 (default)' },
    { id: '1024x768', w: 1024, h: 768, label: '1024×768' },
    { id: '1280x720', w: 1280, h: 720, label: '1280×720' },
    { id: '1600x900', w: 1600, h: 900, label: '1600×900' },
    { id: '1920x1080', w: 1920, h: 1080, label: '1920×1080' },
    { id: '1920x800', w: 1920, h: 800, label: '1920×800 ultrawide' },
    { id: '2560x1080', w: 2560, h: 1080, label: '2560×1080 ultrawide' },
  ];

  const DEFAULTS = {
    resolution: '960x540',
    windEnabled: true,
    maxWind: 10,
    moveDistance: 50,
  };

  let current = { ...DEFAULTS };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        current = { ...DEFAULTS, ...parsed };
      }
    } catch (_) {
      current = { ...DEFAULTS };
    }
    normalize();
    return get();
  }

  function normalize() {
    if (!RESOLUTIONS.find((r) => r.id === current.resolution)) {
      current.resolution = DEFAULTS.resolution;
    }
    current.windEnabled = !!current.windEnabled;
    current.maxWind = Math.max(0, Math.min(30, Number(current.maxWind) || 0));
    current.moveDistance = Math.max(0, Math.min(200, Number(current.moveDistance) || 0));
  }

  function save() {
    normalize();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    return get();
  }

  function get() {
    return { ...current };
  }

  function set(partial) {
    current = { ...current, ...partial };
    return save();
  }

  function getResolution() {
    return RESOLUTIONS.find((r) => r.id === current.resolution) || RESOLUTIONS[1];
  }

  function getSize() {
    const r = getResolution();
    return { width: r.w, height: r.h };
  }

  /** Match options for physics / online host start */
  function matchOptions() {
    const size = getSize();
    return {
      width: size.width,
      height: size.height,
      windEnabled: current.windEnabled,
      maxWind: current.maxWind,
      moveDistance: current.moveDistance,
    };
  }

  function applyCanvas(canvas) {
    if (!canvas) return getSize();
    const { width, height } = getSize();
    canvas.width = width;
    canvas.height = height;
    return { width, height };
  }

  function fitCanvasDisplay(canvas) {
    if (!canvas) return;
    const { width, height } = getSize();
    const wrap = document.getElementById('canvas-wrap');
    const maxW = Math.min(window.innerWidth - 24, width);
    const scale = maxW / width;
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
    const hud = document.querySelector('.game-hud');
    if (hud) hud.style.width = `${Math.min(width * scale, window.innerWidth - 24)}px`;
    if (wrap) {
      /* keep centered */
    }
  }

  load();

  return {
    RESOLUTIONS,
    DEFAULTS,
    load,
    save,
    get,
    set,
    getResolution,
    getSize,
    matchOptions,
    applyCanvas,
    fitCanvasDisplay,
  };
})();
