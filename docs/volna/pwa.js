/* Волна — PWA: установка на устройство и напоминания */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {});
      // как только новый воркер занял место — один раз перезагружаемся,
      // чтобы не крутить старый JS до ручного обновления страницы
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    }).catch(() => {});
  });
}

const Reminder = (() => {
  const KEY = 'volna.reminder';
  const LAST = 'volna.reminder.last';
  const CATCHUP_MS = 6 * 3600 * 1000;   // насколько поздно ещё есть смысл напомнить
  let timer;
  let guard = null;                     // () => boolean: нужно ли вообще напоминать

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  }
  function set(cfg) {
    if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg));
    else { localStorage.removeItem(KEY); localStorage.removeItem(LAST); }
    schedule();
  }
  function supported() { return 'Notification' in window; }

  async function ask() {
    if (!supported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
  }

  function stamp(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function firedToday() { return localStorage.getItem(LAST) === stamp(new Date()); }

  function slotToday() {
    const cfg = get();
    if (!cfg || !cfg.at) return null;
    const [h, m] = cfg.at.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const slot = new Date();
    slot.setHours(h, m, 0, 0);
    return slot;
  }

  function schedule() {
    clearTimeout(timer);
    const slot = slotToday();
    if (!slot) return;
    const now = new Date();
    const next = slot > now ? slot : new Date(slot.getTime() + 86400000);
    const delay = next - now;
    if (delay > 0 && delay < 2147000000) timer = setTimeout(fire, delay);
  }

  async function show(cfg) {
    const body = cfg.mode === 'diary'
      ? 'Напиши пару строк в дневник — как прошёл день?'
      : 'Отметь настроение — это займёт 10 секунд.';
    const opts = { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'volna-daily' };
    // через service worker — иначе на Android уведомление не покажется.
    // ready висит вечно, если воркер не встал, поэтому ограничиваем ожидание.
    try {
      const reg = await Promise.race([
        navigator.serviceWorker ? navigator.serviceWorker.ready : null,
        new Promise(r => setTimeout(() => r(null), 1500)),
      ]);
      if (reg && reg.showNotification) { await reg.showNotification('Волна 🌊', opts); return; }
    } catch {}
    try { new Notification('Волна 🌊', opts); } catch {}
  }

  async function fire() {
    const cfg = get();
    if (!cfg) return;
    if (!firedToday() && Notification.permission === 'granted' && (!guard || guard())) {
      localStorage.setItem(LAST, stamp(new Date()));
      await show(cfg);
    }
    schedule();
  }

  // вкладка вернулась из фона уже после времени напоминания
  function catchUp() {
    const cfg = get();
    if (!cfg || firedToday() || Notification.permission !== 'granted') return;
    if (guard && !guard()) return;
    const slot = slotToday();
    if (!slot) return;
    const now = new Date();
    if (slot > now || now - slot > CATCHUP_MS) return;
    localStorage.setItem(LAST, stamp(now));
    show(cfg);
  }

  function start() {
    if (!get()) set({ at: '20:00', mode: 'mood' });
    else schedule();
  }

  return { get, set, ask, supported, start, schedule, catchUp, setGuard: fn => { guard = fn; } };
})();
