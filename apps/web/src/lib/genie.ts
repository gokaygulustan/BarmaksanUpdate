'use client';

/**
 * Genie (macOS "sihirli lamba") efekti — DOM üzerinde, kütüphanesiz.
 *
 * Nasıl çalışır:
 * 1) Hedef panelin (bildirim menüsü, diyalog) anlık bir kopyası alınır ve N yatay şeride bölünür.
 *    Her şerit, kopyanın kendi bandını gösteren overflow:hidden bir kutu.
 * 2) Her karede şerit kenarlarının (N+1 yatay kenar) ekrandaki yeri hesaplanır:
 *    - Akış: içerik, tetikleyici düğmenin "boğazından" dışarı akar. Uzak kenar önden gider,
 *      boğaza yakın kenar en son çıkar (kenar başına gecikme).
 *    - Huni: her kenarın genişliği ve merkezi, boğazdan uzaklığına göre bir S eğrisiyle
 *      (smootherstep) boğaz genişliğinden panel genişliğine açılır; merkez ekseni de düğmeden
 *      panelin ortasına doğru bükülür.
 *    - Düzleşme: ikinci yarıda huni gevşer, yanlar dikleşir ve panel dikdörtgene oturur.
 * 3) Her şerit, kendi yamuğuna tam oturan bir homografiyle (CSS matrix3d) çizilir: kenarlar
 *    merdiven değil, kesintisiz eğri. Yalnızca transform — bileşik katmanda, boyama yok.
 * 4) Zaman sabit süreli bir eğri değil, kritik sönümlü bir yay: yarıda tersine çevrilince
 *    hızını koruyarak geri döner (kapanırken yeniden açılabilir). Kapanış aynı yolun tersi.
 */

type Box = { left: number; top: number; width: number; height: number };

// The element retains its owner across React refreshes as well as rapid close/open cycles.
const sessionKey = Symbol.for('up:genie-session');
type SessionTarget = HTMLElement & { [sessionKey]?: GenieSession };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Ken Perlin smootherstep: uçlarda hem hız hem ivme sıfır — kenarlarda kırık yok. */
const smoother = (x: number) => {
  const c = clamp01(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);
const r = (n: number) => Math.round(n * 1e6) / 1e6;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * w×h dikdörtgeni verilen dörtgene (sol üst, sağ üst, sağ alt, sol alt) eşleyen projektif dönüşüm
 * (Heckbert, kareden dörtgene), CSS matrix3d olarak. transform-origin: 0 0 ile kullanılır.
 */
function quadMatrix(w: number, h: number, q: number[]): string | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g: number, k: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0;
    b = x3 - x0;
    d = y1 - y0;
    e = y3 - y0;
    g = 0;
    k = 0;
  } else {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-9) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + k * x3;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + k * y3;
  }
  // Birim kareden w×h'ye: x sütunu /w, y sütunu /h.
  a /= w;
  d /= w;
  g /= w;
  b /= h;
  e /= h;
  k /= h;
  return `matrix3d(${r(a)},${r(d)},0,${r(g)},${r(b)},${r(e)},0,${r(k)},0,0,1,0,${r(x0)},${r(y0)},0,1)`;
}

function sanitizeClone(node: HTMLElement, width: number, height: number) {
  const clipPath = node.dataset.genieClipPath ?? '';
  const clipPriority = node.dataset.genieClipPriority ?? '';
  node.removeAttribute('id');
  node.removeAttribute('data-genie-hidden');
  node.removeAttribute('data-genie-target');
  delete node.dataset.genieOpacity;
  delete node.dataset.genieOpacityPriority;
  delete node.dataset.genieClipPath;
  delete node.dataset.genieClipPriority;
  node.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('inert', '');
  const s = node.style;
  s.position = 'absolute';
  s.left = '0px';
  s.right = 'auto';
  s.bottom = 'auto';
  s.margin = '0';
  s.width = `${width}px`;
  s.height = `${height}px`;
  s.maxWidth = 'none';
  s.maxHeight = 'none';
  s.transform = 'none';
  s.translate = 'none';
  s.scale = 'none';
  s.rotate = 'none';
  s.removeProperty('opacity');
  if (clipPath) s.setProperty('clip-path', clipPath, clipPriority);
  else s.removeProperty('clip-path');
  // A collapsed strip must hide its children too; an explicit "visible" overrides its parent.
  s.visibility = 'inherit';
  // Gölge kopyada çizilmez: şeritler kare kesildiği için yuvarlak köşelerin dışında kare siyah
  // parçalar bırakıyordu. Panelin gölgesi yerine oturunca gerçek panelde yumuşakça gelir.
  s.boxShadow = 'none';
}

type Measured = { top: number; bottom: number; width: number; height: number; prunable: boolean };
type Measure = (el: Element) => Measured;

/**
 * Öğenin dikey konumu (panelin üstüne göre, düzen boyutunda); tembel ve önbellekli. Yalnızca
 * şerit kopyalanırken ziyaret edilen öğeler ölçülür: bandın dışında kalan bir alt ağacın içine hiç
 * girilmez. Eskiden panelin bütün öğeleri tek tek ölçülüyordu; yüzlerce satırlık bir tabloda
 * açılışı kilitliyordu. Kopyalar belgeye bağlı olmayan düğümlere eklendiği için ölçümler bu
 * sırada geçersizleşmez (yeniden düzen hesabı olmaz).
 */
function createMeasure(target: HTMLElement, scale: number): Measure {
  const base = target.getBoundingClientRect();
  const cache = new Map<Element, Measured>();
  return (el) => {
    let m = cache.get(el);
    if (!m) {
      const b = el.getBoundingClientRect();
      const display = getComputedStyle(el).display;
      m = {
        top: (b.top - base.top) / scale,
        bottom: (b.bottom - base.top) / scale,
        width: b.width / scale,
        height: b.height / scale,
        prunable:
          !(el instanceof SVGElement) && display !== 'contents' && display !== 'none' && !display.startsWith('inline'),
      };
      cache.set(el, m);
    }
    return m;
  };
}

/** Bandın dışında kalan öğenin yerini tutan, aynı boyda, içi boş ve görünmez kopya. */
function placeholder(el: HTMLElement, width: number, height: number): HTMLElement {
  const ph = el.cloneNode(false) as HTMLElement;
  const s = ph.style;
  s.boxSizing = 'border-box';
  s.width = `${width}px`;
  s.height = s.minHeight = s.maxHeight = `${height}px`;
  s.flexShrink = '0';
  s.overflow = 'hidden';
  s.visibility = 'hidden';
  // Hücresiz bir tablo satırı yüksekliğini tutmayabilir: satırın kapladığı sütunlar kadar tek, boş
  // bir hücre. (Fazlası tabloya hayalî sütun ekleyip gerçek sütunları eziyordu.)
  if (el.tagName === 'TR') {
    const cols = Array.from((el as HTMLTableRowElement).cells).reduce((n, c) => n + (c.colSpan || 1), 0);
    const td = document.createElement('td');
    td.colSpan = Math.max(1, cols);
    td.style.cssText = `height:${height}px;padding:0;border:0`;
    ph.appendChild(td);
  }
  return ph;
}

/**
 * Otomatik düzenli tablonun kopyası sütun genişliklerini yalnızca kopyalanan satırlardan hesaplar:
 * gerçek tablodan farklı dizilir, animasyon bitince sütunlar gerçeğine zıplar. Gerçek sütun
 * genişlikleri ölçülüp kopyaya sabitlenir (sabit düzenli tablo zaten kendi sütunlarını taşır).
 */
function freezeColumns(src: HTMLTableElement, copy: HTMLTableElement, measureEl: Measure) {
  if (getComputedStyle(src).tableLayout === 'fixed') return;
  const row = src.rows[0];
  if (!row) return;
  const group = document.createElement('colgroup');
  for (const cell of Array.from(row.cells)) {
    const span = cell.colSpan || 1;
    const width = measureEl(cell).width / span;
    for (let k = 0; k < span; k++) {
      const col = document.createElement('col');
      col.style.width = `${width}px`;
      group.appendChild(col);
    }
  }
  copy.querySelectorAll(':scope > colgroup').forEach((n) => n.remove());
  copy.insertBefore(group, copy.firstChild);
  copy.style.tableLayout = 'fixed';
  copy.style.width = `${measureEl(src).width}px`;
}

const ROW_GROUPS = new Set(['TABLE', 'TBODY', 'THEAD', 'TFOOT']);

/**
 * Bant kopyası: bandın tamamen dışında kalan blok öğeler çocuksuz, aynı boyda boş bir yer
 * tutucuya dönüşür (düzen birebir aynı kalır, ama içerik ne kurulur ne çizilir). Bir şerit
 * böylece panelin tamamı yerine yalnızca bir iki satırını taşır. Tablolarda bandın dışında art
 * arda kalan satırlar tek bir yer tutucuya iner (satır başına bir kopya yerine).
 */
function cloneBand(
  node: Node,
  measureEl: Measure,
  top: number,
  bottom: number,
  scrolls: [HTMLElement, number, number][],
): Node {
  if (node.nodeType !== 1) return node.cloneNode(true);
  const el = node as HTMLElement;
  const m = measureEl(el);
  if (m.prunable && (m.bottom < top || m.top > bottom)) return placeholder(el, m.width, m.height);
  const copy = el.cloneNode(false) as HTMLElement;
  const rows = ROW_GROUPS.has(el.tagName);
  let run = null as { first: HTMLElement; top: number; bottom: number; width: number } | null;
  const flush = () => {
    if (!run) return;
    copy.appendChild(placeholder(run.first, run.width, run.bottom - run.top));
    run = null;
  };
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (rows && c.nodeType === 1 && (c as Element).tagName === 'TR') {
      const cm = measureEl(c as Element);
      if (cm.prunable && (cm.bottom < top || cm.top > bottom)) {
        if (run) run.bottom = cm.bottom;
        else run = { first: c as HTMLElement, top: cm.top, bottom: cm.bottom, width: cm.width };
        continue;
      }
    }
    flush();
    copy.appendChild(cloneBand(c, measureEl, top, bottom, scrolls));
  }
  flush();
  if (el.tagName === 'TABLE') freezeColumns(el as HTMLTableElement, copy as HTMLTableElement, measureEl);
  if (el.scrollTop || el.scrollLeft) scrolls.push([copy, el.scrollTop, el.scrollLeft]);
  return copy;
}

export function rectOf(el: Element): Box {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

export class GenieSession {
  t: number;
  private v = 0;
  private goal: number;
  private raf = 0;
  private last = 0;
  private fallback = 0;
  private onSettle?: () => void;
  private readonly layer: HTMLDivElement;
  private ghost: HTMLDivElement | null = null;
  private readonly strips: HTMLDivElement[] = [];
  private readonly n: number;
  private readonly W: number;
  private readonly H: number;
  private readonly stripH: number;
  private readonly T: Box;
  private readonly neckX: number;
  private readonly neckY: number;
  private readonly neckW: number;
  private readonly flow: number[] = [];
  private readonly maxFlow: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly prevOpacity: string;
  private readonly prevPriority: string;
  private readonly prevClipPath: string;
  private readonly prevClipPriority: string;
  private disposed = false;
  private primed = false;
  /** Hazırlık için beklenecek kare: büyük panelde şeritlerin ilk çizimi bir kareye sığmayabiliyor. */
  private primeFrames = 2;
  private targetHidden = false;
  /** Çökmüş şeritler (yalnızca değiştiğinde yazılır). */
  private readonly collapsed: boolean[] = [];

  constructor(
    private readonly target: HTMLElement,
    source: Box,
    t0: number,
  ) {
    (target as SessionTarget)[sessionKey]?.destroy(false);
    const rect = target.getBoundingClientRect();
    this.W = Math.max(1, target.offsetWidth);
    this.H = Math.max(1, target.offsetHeight);
    // Açılış animasyonu sürerken ölçülse bile (ölçek), merkez doğru: boyut düzen boyutundan.
    this.T = {
      left: rect.left + rect.width / 2 - this.W / 2,
      top: rect.top + rect.height / 2 - this.H / 2,
      width: this.W,
      height: this.H,
    };
    const T = this.T;
    const sCx = source.left + source.width / 2;
    const sCy = source.top + source.height / 2;
    // Boğaz her zaman düğmenin ortası. Panel düğmenin üstüne biniyorsa içerik düğmeden iki yöne
    // birden akar (eskiden boğaz panelin yakın kenarına sabitleniyordu: ekranı kaplayan bir pencere
    // düğmeden değil üst kenarından açılıp oraya kapanıyordu).
    this.neckY = sCy;
    this.neckX = sCx;
    this.neckW = Math.max(10, Math.min(source.width * 0.78, T.width));

    // Her şerit tam bir yamuk olduğu için az şerit yeter: ~24 px'te bir kenar, eğri yine pürüzsüz.
    this.n = Math.max(12, Math.min(24, Math.round(this.H / 24)));
    this.stripH = this.H / this.n;
    // Kenar başına işaretli akış: boğazın altındaki kenarlar aşağı, üstündekiler yukarı akar.
    let maxFlow = 1;
    for (let j = 0; j <= this.n; j++) {
      const f = T.top + j * this.stripH - this.neckY;
      this.flow.push(f);
      if (Math.abs(f) > maxFlow) maxFlow = Math.abs(f);
    }
    this.maxFlow = maxFlow;

    // Katman: panel + düğme + gölge payı kadar, ekranda sabit.
    const pad = 64;
    const left = Math.min(T.left, source.left) - pad;
    const top = Math.min(T.top, source.top) - pad;
    const right = Math.max(T.left + T.width, source.left + source.width) + pad;
    const bottom = Math.max(T.top + T.height, source.top + source.height) + pad;
    this.ox = left;
    this.oy = top;

    const layer = document.createElement('div');
    layer.className = 'genie-layer';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });

    // Gölge katmanı yok: huni dikdörtgene dönmeden panelin yerinde bir gölge belirmesin.
    // Gerçek panelin kendi gölgesi, panel yerine oturunca yumuşakça gelir (destroy).
    const measureEl = createMeasure(target, rect.height / this.H || 1);
    const scrolls: [HTMLElement, number, number][] = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.n; i++) {
      const strip = document.createElement('div');
      strip.className = 'genie-strip';
      strip.style.width = `${this.W}px`;
      // +1 px: komşu şeride biner, kenarlarda kıl payı boşluk görünmez.
      strip.style.height = `${this.stripH + 1}px`;
      const bandTop = i * this.stripH - 6;
      const bandBottom = (i + 1) * this.stripH + 6;
      const copy = cloneBand(target, measureEl, bandTop, bandBottom, scrolls) as HTMLElement;
      sanitizeClone(copy, this.W, this.H);
      copy.style.top = `${-i * this.stripH}px`;
      strip.appendChild(copy);
      frag.appendChild(strip);
      this.strips.push(strip);
    }
    layer.appendChild(frag);
    this.layer = layer;

    // Gölge: panelin kendi gölgesi, yerinde ayrı bir katmanda. Opaklığı hareketin kendisine bağlı
    // (render): huni dikdörtgene yaklaşınca belirir, gerçek panele geçişte birebir aynı kalır.
    const cs = getComputedStyle(target);
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const ghost = document.createElement('div');
      ghost.className = 'genie-ghost-shadow';
      Object.assign(ghost.style, {
        left: `${T.left}px`,
        top: `${T.top}px`,
        width: `${T.width}px`,
        height: `${T.height}px`,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        opacity: '0.001',
      });
      this.ghost = ghost;
    }

    // Asıl öğeyi gizle; özgün opaklığı yalnızca ilk gizleyen kaydeder (art arda iki oturum
    // olsa bile gizli hâl "özgün" sanılmaz, panel görünmez kalmaz).
    if (!target.hasAttribute('data-genie-hidden')) {
      target.setAttribute('data-genie-hidden', '');
      target.dataset.genieOpacity = target.style.getPropertyValue('opacity');
      target.dataset.genieOpacityPriority = target.style.getPropertyPriority('opacity');
      target.dataset.genieClipPath = target.style.getPropertyValue('clip-path');
      target.dataset.genieClipPriority = target.style.getPropertyPriority('clip-path');
    }
    this.prevOpacity = target.dataset.genieOpacity ?? '';
    this.prevPriority = target.dataset.genieOpacityPriority ?? '';
    this.prevClipPath = target.dataset.genieClipPath ?? '';
    this.prevClipPriority = target.dataset.genieClipPriority ?? '';
    (target as SessionTarget)[sessionKey] = this;
    // Açılışta panel baştan gizli. Kapanışta kopya çizilene kadar (hazırlık kareleri) gerçek panel
    // görünür kalır: kopya henüz çizilmemişken panel gizlenirse bir an boşluk görünüyordu.
    if (t0 < 0.5) this.hideTarget();

    this.t = t0;
    this.goal = t0;
    // Hazırlık karesi: şeritler önce yerlerinde, ölçek 1'de çizilir. will-change ile o
    // çözünürlükte kalırlar; animasyon boyunca yeniden çizim olmaz, yalnızca bileşik katman
    // dönüşür (eskiden her karede bütün şeritler yeni ölçekte baştan çiziliyordu: büyük
    // panellerde ağır takılma). Hiçbir an ölçek 1'i aşmadıkları için bulanıklık da yok. Açılışta
    // bu kare görünmez; kapanışta panelin kendisiyle birebir aynıdır.
    this.render(1);
    layer.style.opacity = t0 >= 0.5 ? '1' : '0.001';
    if (this.ghost) this.ghost.style.opacity = t0 >= 0.5 ? '1' : '0.001';
    // Gerçek panel gizlenip ilk kare çizilmeden kopyayı ekrana ekleme.
    document.body.appendChild(layer);
    if (this.ghost) document.body.appendChild(this.ghost);
    for (const [el, top, left] of scrolls) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  }

  /** Hedefe yayla git (0 = düğmenin içinde, 1 = panel yerinde). Yolda çağrılırsa hız korunur. */
  to(goal: number, onSettle?: () => void) {
    this.goal = goal;
    this.onSettle = onSettle;
    if (this.disposed) return;
    if (!this.raf) {
      // İlk kare sabit küçük bir adımla başlar: kurulum ne kadar sürerse sürsün sıçrama olmaz.
      this.last = -1;
      this.raf = requestAnimationFrame(this.primed ? this.tick : this.afterPrime);
    }
    // Sekme arka plandaysa kare gelmez: panel görünmez kalmasın, süre dolunca yerine otursun.
    window.clearTimeout(this.fallback);
    this.fallback = window.setTimeout(() => this.settle(), 1400);
  }

  get alive() {
    return !this.disposed;
  }

  /** Belirli bir anı çizer (geliştirmede şekli kare kare incelemek için). */
  seek(t: number) {
    this.t = t;
    this.v = 0;
    this.render();
  }

  private settle() {
    if (this.disposed) return;
    window.clearTimeout(this.fallback);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.t = this.goal;
    this.v = 0;
    this.render();
    const cb = this.onSettle;
    this.onSettle = undefined;
    cb?.();
  }

  /** Hazırlık kareleri ekrana çıksın (şeritler ölçek 1'de çizilsin), hareket ardından başlar. */
  private afterPrime = () => {
    if (this.disposed) return;
    if (--this.primeFrames > 0) {
      this.raf = requestAnimationFrame(this.afterPrime);
      return;
    }
    this.primed = true;
    this.hideTarget();
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Gerçek paneli gizler (sıfır boyama alanı: alt öğeler ve gölge de çizilmez). */
  private hideTarget() {
    if (this.targetHidden) return;
    this.targetHidden = true;
    this.target.style.setProperty('opacity', '0', 'important');
    this.target.style.setProperty('clip-path', 'inset(50%)', 'important');
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    if (!this.target.isConnected || (this.target as SessionTarget)[sessionKey] !== this) {
      this.destroy(false);
      return;
    }
    // Kare atlansa bile adım en fazla iki kare: yay hiçbir zaman ileri fırlamaz.
    const dt = this.last < 0 ? 1 / 60 : Math.min(1 / 30, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    // Kritik sönümlü yay (Apple: damping 1, response ~0.45 sn açılış / 0.36 sn kapanış).
    const response = this.goal >= 0.5 ? 0.46 : 0.36;
    const omega = (2 * Math.PI) / response;
    const stiffness = omega * omega;
    const damping = 2 * omega;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -stiffness * (this.t - this.goal) - damping * this.v;
      this.v += a * h;
      this.t += this.v * h;
    }
    // Yayın uzun kuyruğu beklenmez: şekil gözle ayırt edilemeyecek kadar yerine oturunca biter.
    const done = Math.abs(this.t - this.goal) < 0.006 && Math.abs(this.v) < 0.25;
    if (done) {
      this.settle();
      return;
    }
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private render(at = this.t) {
    const tt = clamp01(at);
    const n = this.n;
    // Boğazdan çıkarken ilk anlarda belirir (düğmenin üstünde sert bir kopya görünmesin). Taban
    // 0.001: tam 0'da katman "çizilmez" sayılır ve tarayıcı rasterını atabilir; yeniden belirince
    // baştan çizim demek.
    this.layer.style.opacity = String(Math.max(0.001, smoother(tt / 0.09)));
    // Düzleşme: ikinci yarıda huni gevşer, yanlar dikleşir.
    const straighten = smoother((tt - 0.42) / 0.58);
    // Gölge yalnızca huni neredeyse dikdörtgenken: son %14'lük yolda belirir (kapanışta ilk anda söner).
    if (this.ghost) this.ghost.style.opacity = String(Math.max(0.001, r(smoother((tt - 0.86) / 0.14))));
    const LEAD = 0.3;

    const Y = new Array<number>(n + 1);
    const L = new Array<number>(n + 1);
    const R = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) {
      const reach = Math.abs(this.flow[j]) / this.maxFlow; // boğazdan uzaklık, 0..1
      const lead = 1 - reach; // uzak kenar 0 (önden gider), yakın kenar 1
      const q = easeOutQuad(clamp01((tt - LEAD * lead) / (1 - LEAD)));
      Y[j] = this.neckY + this.flow[j] * q;
      const depth = reach * q;
      const widthBend = smoother(depth / 0.85);
      const axisBend = smoother(depth / 0.6);
      const wf = widthBend + (1 - widthBend) * straighten;
      const cf = axisBend + (1 - axisBend) * straighten;
      const w = this.neckW + (this.W - this.neckW) * wf;
      const cx = this.neckX + (this.T.left + this.W / 2 - this.neckX) * cf;
      L[j] = cx - w / 2 - this.ox;
      R[j] = cx + w / 2 - this.ox;
      Y[j] -= this.oy;
    }

    for (let i = 0; i < n; i++) {
      const strip = this.strips[i];
      const top = Y[i];
      const bottom = Y[i + 1];
      // Çökmüş şerit görünmez olur ama düzende ve bileşik katmanda kalır. Eskiden display:none
      // ile düşüyordu: açılışta şeritler tek tek belirirken her biri baştan düzen + boyama +
      // rasterleme istiyordu (açılıştaki takılma).
      const m =
        Math.abs(bottom - top) < 0.12
          ? null
          : quadMatrix(this.W, this.stripH, [L[i], top, R[i], top, R[i + 1], bottom, L[i + 1], bottom]);
      const collapsed = !m;
      if (collapsed !== Boolean(this.collapsed[i])) {
        this.collapsed[i] = collapsed;
        strip.style.opacity = collapsed ? '0.001' : '';
      }
      if (m) strip.style.transform = m;
    }
  }

  /**
   * Katmanı kaldırır; reveal=true ise gerçek panel görünür (açılış bitti), false ise gizli kalır.
   * Açılış bitişinde (immediate değilse) kopya, gerçek panel altında çizilip hazır olana kadar iki
   * kare daha üstte durur: büyük bir panelin ilk çizimi birkaç kare sürebiliyor, kopya hemen
   * kalkınca panel bir an kaybolup geri geliyordu.
   */
  destroy(reveal: boolean, immediate = false) {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.fallback);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const owner = (this.target as SessionTarget)[sessionKey] === this;
    if (!reveal && owner) this.hideTarget();
    if (reveal && owner) {
      const s = this.target.style;
      // Görünür hâle geçişsiz döner. Tailwind'in duration-* sınıfı geçiş özelliği vermeden süre
      // koyuyor (transition-property: all): gizleme kalkınca panelin opaklığı 0'dan 300 ms'de
      // yeniden açılıyordu — genie bitince panel bir an kaybolup geri geliyordu.
      const transition = s.getPropertyValue('transition');
      const transitionPriority = s.getPropertyPriority('transition');
      s.setProperty('transition', 'none', 'important');
      if (this.prevOpacity) s.setProperty('opacity', this.prevOpacity, this.prevPriority);
      else s.removeProperty('opacity');
      if (this.prevClipPath) s.setProperty('clip-path', this.prevClipPath, this.prevClipPriority);
      else s.removeProperty('clip-path');
      this.target.removeAttribute('data-genie-hidden');
      delete this.target.dataset.genieOpacity;
      delete this.target.dataset.genieOpacityPriority;
      delete this.target.dataset.genieClipPath;
      delete this.target.dataset.genieClipPriority;
      // Yeni değerler geçişsizken hesaplansın, sonra eski geçiş geri gelsin.
      void getComputedStyle(this.target).opacity;
      if (transition) s.setProperty('transition', transition, transitionPriority);
      else s.removeProperty('transition');
    }
    if (owner) delete (this.target as SessionTarget)[sessionKey];
    const remove = () => {
      this.layer.remove();
      this.ghost?.remove();
    };
    if (reveal && !immediate) {
      let frames = 2;
      const step = () => {
        if (--frames > 0) requestAnimationFrame(step);
        else remove();
      };
      requestAnimationFrame(step);
      // Kare gelmezse (arka plan sekmesi) kopya yine de kalksın.
      window.setTimeout(remove, 250);
      return;
    }
    remove();
  }
}

/* ── Son tetikleyici: diyaloglar hangi düğmeden açıldıysa oradan çıkar ─────────────────── */

let lastTrigger: { el: Element; at: number } | null = null;
let tracking = false;

function ensureTracking() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  const remember = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.(
      'button, a, [role="button"], [role="menuitem"], [role="tab"], [data-genie-source]',
    );
    if (el) lastTrigger = { el, at: performance.now() };
  };
  document.addEventListener('pointerdown', (e) => remember(e.target), true);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') remember(e.target);
    },
    true,
  );
}

if (typeof document !== 'undefined') ensureTracking();

function recentTrigger(): Element | null {
  if (!lastTrigger || performance.now() - lastTrigger.at > 1600 || !lastTrigger.el.isConnected) return null;
  return lastTrigger.el;
}

/**
 * Base UI popup'ı (Dialog.Popup) için: açılınca tıklanan düğmeden genie ile çıkar, kapanınca
 * aynı yoldan ona geri döner. Kapanışta gerçek popup gizli kalır; çıkış animasyonu [data-genie]
 * ile uzatılır ki Base UI genie bitmeden onu kaldırmasın.
 */
const attachedPopups = new WeakSet<HTMLElement>();

export function attachGeniePopup(el: HTMLElement): () => void {
  // Aynı popup için aynı anda yalnızca bir gözlemci ve animasyon oturumu yaşar.
  if (attachedPopups.has(el)) return () => {};
  const trigger = recentTrigger();
  if (!trigger || prefersReducedMotion() || trigger === el || el.contains(trigger)) return () => {};
  attachedPopups.add(el);
  el.setAttribute('data-genie', '');
  let fallback = rectOf(trigger);
  const sourceRect = () => {
    if (trigger.isConnected) {
      const b = rectOf(trigger);
      if (b.width > 0 && b.height > 0) fallback = b;
    }
    return fallback;
  };

  let session: GenieSession | null = new GenieSession(el, sourceRect(), 0);
  const settleOpen = () => {
    session?.destroy(true);
    session = null;
  };
  session.to(1, settleOpen);

  const mo = new MutationObserver(() => {
    if (el.hasAttribute('data-closed')) {
      if (!session) session = new GenieSession(el, sourceRect(), 1);
      session.to(0, () => {
        session?.destroy(false);
        session = null;
      });
    } else if (el.hasAttribute('data-open')) {
      // Kapanırken yeniden açıldı: kaldığı yerden geri akar (oturum bittiyse düğmeden yeniden).
      if (!session) session = new GenieSession(el, sourceRect(), 0);
      session.to(1, settleOpen);
    }
  });
  mo.observe(el, { attributes: true, attributeFilter: ['data-closed', 'data-open'] });
  return () => {
    mo.disconnect();
    session?.destroy(true, true);
    session = null;
    el.removeAttribute('data-genie');
    attachedPopups.delete(el);
  };
}
