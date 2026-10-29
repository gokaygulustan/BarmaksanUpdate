'use client';

// Yerinde düzenleme (barmaksan'daki kalem modunun karşılığı). Yönetici üst çubuktaki kaleme basınca
// düzenlenebilir yazıların üzerine gelince ince bir çerçeve ve köşesinde kalem çıkar; kaleme basınca
// yazının yanında küçük bir panel açılır, yazarken ekranda canlı değişir. Kayıt sunucuda (site_texts).
// Anahtar yazının varsayılan hâlidir: aynı yazı her yerde birlikte değişir. Mod yalnızca ADMIN'de vardır;
// kapalıyken sayfada hiçbir işaret yok.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, History, Loader2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { SmokeText } from '@/components/SmokeText';
import { siteTextsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

function createStore<V>(initial: V) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: V) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const STORAGE_KEY = 'up.editing';
const editingStore = createStore(false);
const draftStore = createStore<Record<string, string>>({});
const NO_TEXTS: Record<string, string> = {};
const SITE_TEXTS = ['siteTexts'] as const;

if (typeof window !== 'undefined') {
  try {
    editingStore.set(sessionStorage.getItem(STORAGE_KEY) === '1');
  } catch {
    /* yoksay */
  }
}

function setEditing(on: boolean) {
  editingStore.set(on);
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* yoksay */
  }
}

/** Panelde yazılan, henüz kaydedilmemiş yazı: ekranda canlı görünür; null eski hâline döndürür. */
function setTextDraft(key: string, value: string | null) {
  const next = { ...draftStore.get() };
  if (value === null) delete next[key];
  else next[key] = value;
  draftStore.set(next);
}

const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'ADMIN');

export function useEditing() {
  const wanted = useSyncExternalStore(editingStore.subscribe, editingStore.get, () => false);
  return useIsAdmin() && wanted;
}

export function useSiteTexts() {
  const authed = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: SITE_TEXTS,
    queryFn: async () => (await siteTextsApi.getAll()).data,
    enabled: authed,
    staleTime: 5 * 60_000,
  });
  return data ?? NO_TEXTS;
}

/** Ekranda görünecek hâl: yazılan taslak, yoksa kaydedilen, yoksa varsayılan. */
export function useSiteText(fallback: string) {
  const saved = useSiteTexts();
  const drafts = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
  return drafts[fallback] ?? saved[fallback] ?? fallback;
}

// Sayfa panelindeki ([data-edit-scope]) <T> ile sarılmamış düz yazılar da düzenlenir: anahtar yine
// yazının asıl hâlidir. Değişiklik React'in yazdığı metin düğümüne doğrudan uygulanır; React yazıyı
// kendisi değiştirirse (veri güncellendi) yeni hâli asıl kabul edilir. Tablo gövdesi (veri), form
// alanları, harf harf animasyonlu yazılar ve <T> ile işaretli öğeler dışarıda kalır.
const SKIP =
  'script,style,textarea,input,select,option,[contenteditable],[data-edit-key],[data-no-edit],[aria-hidden="true"],tbody';
const originals = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();
const touched = new Set<Text>();

/** Düğümün asıl yazısı: biz değiştirdiysek eskisi, React değiştirdiyse yenisi. */
function originalOf(node: Text) {
  const cur = node.nodeValue ?? '';
  const mine = written.get(node);
  if (mine === undefined || mine !== cur) {
    originals.set(node, cur);
    written.delete(node);
    touched.delete(node);
    return cur;
  }
  return originals.get(node) ?? cur;
}

/** Tek harf, sayı ya da boşluk anahtar olmaz (her yerdeki aynı harf/sayı birden değişirdi). */
function editableKey(text: string) {
  const k = text.trim();
  return k.length >= 2 && /\p{L}/u.test(k) ? k : null;
}

function applyText(node: Text, texts: Record<string, string>) {
  const orig = originalOf(node);
  const key = editableKey(orig);
  if (!key) return;
  const over = texts[key];
  const want = over === undefined ? orig : orig.replace(key, over);
  if (node.nodeValue !== want) node.nodeValue = want;
  if (want === orig) {
    written.delete(node);
    touched.delete(node);
  } else {
    written.set(node, want);
    touched.add(node);
  }
}

function eachText(root: Node, fn: (node: Text) => void) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest(SKIP)) fn(root as Text);
    return;
  }
  if (!(root instanceof Element) || root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) fn(n as Text);
}

/** Kaydedilen ve yazılmakta olan değişiklikleri sayfa panelindeki düz yazılara uygular (herkes için). */
export function TextOverrides() {
  const saved = useSiteTexts();
  const drafts = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
  const textsRef = useRef<Record<string, string>>(NO_TEXTS);

  useEffect(() => {
    const texts = { ...saved, ...drafts };
    textsRef.current = texts;
    touched.forEach((n) => {
      if (!n.isConnected) touched.delete(n);
    });
    if (!Object.keys(texts).length && !touched.size) return;
    document.querySelectorAll('[data-edit-scope]').forEach((scope) => eachText(scope, (n) => applyText(n, texts)));
  }, [saved, drafts]);

  useEffect(() => {
    const observer = new MutationObserver((records) => {
      const texts = textsRef.current;
      if (!Object.keys(texts).length && !touched.size) return;
      for (const r of records) {
        if (r.type === 'characterData') eachText(r.target, (n) => applyText(n, texts));
        else r.addedNodes.forEach((added) => eachText(added, (n) => applyText(n, texts)));
      }
    });
    document
      .querySelectorAll('[data-edit-scope]')
      .forEach((scope) => observer.observe(scope, { subtree: true, childList: true, characterData: true }));
    return () => observer.disconnect();
  }, []);

  return null;
}

/** Öğenin kendi içindeki tek düz yazısı (başlık, paragraf, etiket, düğme yazısı…); karışıksa null. */
function ownText(el: Element): Text | null {
  let found: Text | null = null;
  for (const n of el.childNodes) {
    if (n.nodeType !== Node.TEXT_NODE || !n.nodeValue?.trim()) continue;
    if (found) return null;
    found = n as Text;
  }
  return found;
}

/** İmlecin altındaki düzenlenebilir yazı: <T> ile işaretli öğe ya da sayfa panelindeki düz yazı. */
function findTarget(t: EventTarget | null): Target | null {
  if (!(t instanceof Element)) return null;
  const marked = t.closest<HTMLElement>('[data-edit-key]');
  if (marked?.dataset.editKey) return { key: marked.dataset.editKey, el: marked };
  if (!t.closest('[data-edit-scope]') || t.closest(SKIP)) return null;
  let el: Element | null = t;
  for (let depth = 0; el && depth < 4 && !el.hasAttribute('data-edit-scope'); depth++, el = el.parentElement) {
    const node = ownText(el);
    if (!node) continue;
    const key = editableKey(originalOf(node));
    return key && el instanceof HTMLElement ? { key, el } : null;
  }
  return null;
}

/** Düzenleme modunda öğeye eklenen işaret; mod kapalıyken boş. */
export function editMark(editing: boolean, key: string) {
  return editing ? { 'data-edit-key': key } : {};
}

/** Düzenlenebilir sabit yazı. Yalnızca görünen, sabit yazılar için (veri değil). */
export function T({ children }: { children: string }) {
  const value = useSiteText(children);
  const editing = useEditing();
  return editing ? <span data-edit-key={children}>{value}</span> : <>{value}</>;
}

/** Yazı efektli (SmokeText) düzenlenebilir başlık. */
export function SmokeT({ children }: { children: string }) {
  const value = useSiteText(children);
  const editing = useEditing();
  return (
    <span {...editMark(editing, children)}>
      <SmokeText text={value} />
    </span>
  );
}

/** Üst çubuktaki kalem: yalnızca ADMIN görür. Açıkken "Bitti" olur ve düzenleme katmanını taşır. */
export function EditModeButton({ className }: { className?: string }) {
  const admin = useIsAdmin();
  const editing = useEditing();

  useEffect(() => {
    const root = document.documentElement;
    if (editing) root.dataset.editing = '';
    else delete root.dataset.editing;
    return () => {
      delete root.dataset.editing;
    };
  }, [editing]);

  if (!admin) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        aria-pressed={editing}
        title={editing ? 'Düzenlemeyi bitir' : 'Ekrandaki yazıları yerinde düzenle'}
        aria-label={editing ? 'Düzenlemeyi bitir' : 'Yerinde düzenle'}
        className={cn(
          className,
          editing && 'w-auto gap-1.5 bg-brand px-3 text-[13px] font-medium text-primary-foreground hover:bg-brand hover:text-primary-foreground',
        )}
      >
        {editing ? <Check className="h-4 w-4" strokeWidth={2} /> : <PencilLine className="h-[17px] w-[17px]" strokeWidth={1.7} />}
        {editing ? 'Bitti' : null}
      </button>
      {editing ? <EditLayer /> : null}
    </>
  );
}

type Target = { key: string; el: HTMLElement };

/** Öğenin ekrandaki yeri, her karede (kaydırma, açılan menüler, yeniden yerleşim). */
function useRect(el: HTMLElement | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      setRect((prev) =>
        prev && r && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [el]);
  return rect;
}

function EditLayer() {
  const pathname = usePathname();
  const [hover, setHover] = useState<Target | null>(null);
  const [active, setActive] = useState<Target | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const hoverRef = useRef<Target | null>(null);
  hoverRef.current = hover;
  const rect = useRect(hover?.el ?? null);

  useEffect(() => {
    let touch = false;
    // Kalem kaybolmasın: imleç öğeden kaleme giderken ve öğenin hemen çevresindeyken seçim korunur;
    // boş bir yere çıkınca kısa bir süre bekler. Başka bir öğeye geçince hemen geçer.
    let clearTimer = 0;
    const cancel = () => {
      window.clearTimeout(clearTimer);
      clearTimer = 0;
    };
    const later = () => {
      if (!clearTimer)
        clearTimer = window.setTimeout(() => {
          clearTimer = 0;
          setHover(null);
        }, 450);
    };
    const within = (r: DOMRect | undefined, x: number, y: number, pad: number) =>
      !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    const nearCurrent = (x: number, y: number) => {
      const cur = hoverRef.current;
      return (
        !!cur &&
        (within(cur.el.getBoundingClientRect(), x, y, 12) || within(badgeRef.current?.getBoundingClientRect(), x, y, 16))
      );
    };
    const inLayer = (t: EventTarget | null) => t instanceof Node && !!layer.current?.contains(t);
    const onMove = (e: PointerEvent) => {
      touch = e.pointerType === 'touch';
      if (touch) return;
      if (inLayer(e.target)) {
        cancel();
        return;
      }
      const target = findTarget(e.target);
      const cur = hoverRef.current;
      if (cur && target?.el === cur.el) {
        cancel();
        return;
      }
      if (nearCurrent(e.clientX, e.clientY)) {
        cancel();
        return;
      }
      if (!target) {
        later();
        return;
      }
      cancel();
      setHover(target);
    };
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType === 'touch';
    };
    // Dokunmatik: öğeye ilk dokunuş onu seçer (bağlantı açılmaz), seçiliyken ikinci dokunuş açar.
    const onClick = (e: MouseEvent) => {
      if (!touch || inLayer(e.target)) return;
      const target = findTarget(e.target);
      if (!target) {
        setHover(null);
        return;
      }
      if (target.el !== hoverRef.current?.el) {
        e.preventDefault();
        e.stopPropagation();
        setHover(target);
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    document.addEventListener('click', onClick, true);
    return () => {
      cancel();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown, { capture: true });
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // Sayfa değişince seçim ve açık panel kalkar.
  useEffect(() => {
    setHover(null);
    setActive(null);
  }, [pathname]);

  const open = (t: Target) => {
    setActive(t);
    setHover(null);
  };
  const close = () => setActive(null);

  // Kalem: çerçevenin köşesine binerek üstte (yer yoksa altta); öğe ekranın solundaysa sol köşede.
  let badgeStyle: CSSProperties = {};
  if (rect) {
    const start = rect.right < 280;
    const above = rect.top > 30;
    badgeStyle = {
      top: above ? rect.top + 4 : rect.bottom - 4,
      left: start ? Math.max(8, rect.left - 3) : rect.right + 3,
      transform: `translate(${start ? '0' : '-100%'}, ${above ? '-100%' : '0'})`,
    };
  }

  return createPortal(
    <div ref={layer} className="pointer-events-none fixed inset-0 z-[90]">
      {hover && rect && hover.el !== active?.el ? (
        <>
          <div
            className="edit-outline absolute rounded-[7px] border border-brand/80 bg-brand/[0.06]"
            style={{ top: rect.top - 3, left: rect.left - 3, width: rect.width + 6, height: rect.height + 6 }}
          />
          <button
            ref={badgeRef}
            type="button"
            className="edit-badge pointer-events-auto absolute inline-flex h-6 items-center gap-1 rounded-full bg-brand pl-2 pr-2.5 text-[11.5px] font-medium text-primary-foreground shadow-[0_4px_14px_rgba(0,0,0,0.35)] outline-none transition-transform duration-150 hover:scale-105 active:scale-95"
            style={badgeStyle}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              open(hover);
            }}
            aria-label="Yazıyı düzenle"
          >
            <PencilLine className="size-3.5" strokeWidth={1.9} />
            Yazı
          </button>
        </>
      ) : null}
      {active ? <TextPopover key={active.key} target={active} onClose={close} /> : null}
    </div>,
    document.body,
  );
}

/** Yazı paneli: öğenin altında (yer yoksa üstünde); dar ekranda alttan açılan sayfa. */
function TextPopover({ target, onClose }: { target: Target; onClose: () => void }) {
  const k = target.key;
  const rect = useRect(target.el);
  const ref = useRef<HTMLFormElement>(null);
  const [h, setH] = useState(0);
  const qc = useQueryClient();
  const saved = useSiteTexts()[k];
  const base = saved ?? k;
  const [value, setValue] = useState(base);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({
    queryKey: ['siteTextHistory', k],
    queryFn: async () => (await siteTextsApi.history(k)).data,
    enabled: showHistory,
  });
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    setH(ref.current?.offsetHeight ?? 0);
  });
  // Yazarken ekranda canlı görünür; vazgeçince eski hâline döner.
  useEffect(() => {
    setTextDraft(k, value);
  }, [k, value]);
  useEffect(() => () => setTextDraft(k, null), [k]);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const changed = value !== base;
  const isDefault = value.trim() === k;
  const save = async () => {
    if (!changed || busy) return;
    setBusy(true);
    try {
      await siteTextsApi.save(k, isDefault || !value.trim() ? null : value.trim());
      await qc.invalidateQueries({ queryKey: SITE_TEXTS });
      void qc.invalidateQueries({ queryKey: ['siteTextHistory', k] });
      toast.success(isDefault || !value.trim() ? 'Varsayılan yazıya dönüldü' : 'Yazı güncellendi');
      onClose();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Yazı kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const W = 360;
  let style: CSSProperties = {};
  if (!narrow && rect) {
    const below = rect.bottom + 10 + h < window.innerHeight - 12 || rect.top - 10 - h < 12;
    style = {
      top: below ? Math.min(rect.bottom + 10, window.innerHeight - h - 12) : rect.top - 10 - h,
      left: Math.min(Math.max(12, rect.left), window.innerWidth - W - 12),
      width: W,
    };
  }

  return (
    <form
      ref={ref}
      role="dialog"
      aria-label="Yazıyı düzenle"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className={cn(
        'edit-pop pointer-events-auto fixed space-y-3 rounded-2xl border border-white/[0.1] bg-popover p-3.5 shadow-[var(--shadow-float)]',
        narrow && 'inset-x-3 bottom-3',
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-white">Yazıyı düzenle</span>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
        >
          <History className="size-3.5" strokeWidth={1.7} />
          Geçmiş
        </button>
      </div>
      <textarea
        ref={field}
        rows={Math.min(6, Math.max(1, Math.ceil(value.length / 40), value.split('\n').length))}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        className="w-full resize-none rounded-[11px] border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[14px] leading-relaxed text-white outline-none transition-colors duration-150 focus:border-brand/60"
      />
      {showHistory ? (
        <ul className="max-h-44 space-y-0.5 overflow-y-auto">
          {history.isLoading ? <li className="px-2 py-1 text-[12px] text-white/45">Yükleniyor…</li> : null}
          {history.data?.length === 0 ? <li className="px-2 py-1 text-[12px] text-white/45">Henüz değiştirilmedi.</li> : null}
          {history.data?.map((x, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setValue(x.value ?? k)}
                className="flex w-full flex-col items-start gap-0.5 rounded-[9px] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
              >
                <span className="line-clamp-2 text-[12.5px] text-white/85">{x.value ?? '(varsayılan)'}</span>
                <span className="text-[11px] text-white/40">
                  {[x.author, new Date(x.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        {!isDefault ? (
          <button
            type="button"
            onClick={() => setValue(k)}
            className="h-8 rounded-full px-2.5 text-[12.5px] text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
          >
            Varsayılana dön
          </button>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-[10px] border border-white/[0.1] px-3.5 text-[13px] text-white/80 transition-colors duration-150 hover:bg-white/[0.06]"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={!changed || busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-[#e4c43c] disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Kaydet
        </button>
      </div>
    </form>
  );
}
