'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { usesPurchasingQuoteForm } from '@/lib/access';
import { currencySymbol } from '@/lib/currency';
import { maskTrPhoneLoose } from '@/lib/phone';
import { quoteLineTotal } from '@/lib/quoteMath';
import { formatBytes } from '@/lib/richHtml';
import './vendor-quote-receipt.css';

export type QuoteReceiptLine = {
  no: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
  currency: string;
  disc: number;
  vat: number | null;
  notes?: string;
};

export type QuoteReceiptFile = { name: string; sizeLabel?: string };

export type QuoteReceiptDoc = {
  docNo: string;
  submittedAt: string;
  quoteRef: string;
  requestTitle: string;
  buyerName: string;
  buyerLegal: string;
  buyerTax: string;
  buyerAddr: string;
  buyerContact: string;
  vendorName: string;
  vendorLines: string[];
  shipping: string;
  maturity: string;
  fx: string;
  overallDiscount: number;
  note: string;
  applyVat: boolean;
  files: QuoteReceiptFile[];
  items: QuoteReceiptLine[];
};

type PageSpec = {
  items: QuoteReceiptLine[];
  continued: boolean;
  showIntro: boolean;
  showClosing: boolean;
};

function money(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function curMark(code: string) {
  return currencySymbol(code);
}

function lineNet(it: QuoteReceiptLine, applyVat: boolean) {
  return quoteLineTotal({
    price: it.price,
    quantity: it.qty,
    discountRate: it.disc,
    vatRate: it.vat,
    overallDiscountRate: 0,
    applyVat,
  });
}

function bagsAfterOverall(items: QuoteReceiptLine[], overall: number, applyVat: boolean) {
  const bags: Record<string, number> = { TRY: 0, USD: 0, EUR: 0, CHF: 0 };
  for (const it of items) {
    const c = it.currency || 'TRY';
    bags[c] = (bags[c] || 0) + lineNet(it, applyVat);
  }
  const f = 1 - (Number(overall) || 0) / 100;
  Object.keys(bags).forEach((k) => {
    bags[k] *= f;
  });
  return bags;
}

function Header({ doc, page, pages }: { doc: QuoteReceiptDoc; page: number; pages: number }) {
  return (
    <header className="vqr-head">
      <div className="vqr-head-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ugurpromilling-black.png" alt="Uğur Promilling" />
        <div className="vqr-doc-mark">
          <div className="vqr-kicker">Satın alma · teklif kaydı</div>
          <div className="vqr-doc-title">Teklif kayıt belgesi</div>
          <div className="vqr-doc-sub">Proforma özet · sipariş taahhüdü değildir</div>
        </div>
      </div>
      <div className="vqr-head-rule">
        <span>
          Belge no <b>{doc.docNo}</b>
        </span>
        <span>
          İletim <b>{doc.submittedAt}</b>
        </span>
        <span>
          Sayfa <b>{page}</b> / <b>{pages}</b>
        </span>
      </div>
    </header>
  );
}

function Footer({ doc, page, pages }: { doc: QuoteReceiptDoc; page: number; pages: number }) {
  return (
    <footer className="vqr-foot">
      <div>
        Uğur Promilling bir <b>Barmaksan Endüstri A.Ş.</b> markasıdır.
        <br />
        Bu çıktı tedarikçinin sisteme gönderdiği teklifin kaydıdır.
      </div>
      <div style={{ textAlign: 'right' }}>
        {doc.docNo}
        <br />
        Sayfa {page} / {pages}
      </div>
    </footer>
  );
}

function Intro({ doc }: { doc: QuoteReceiptDoc }) {
  return (
    <div>
      <div className="vqr-parties">
        <div className="vqr-box">
          <div className="vqr-lbl">Alıcı</div>
          <div className="vqr-name">{doc.buyerName}</div>
          <div className="vqr-sub">
            {doc.buyerLegal}
            <br />
            {doc.buyerTax}
            <br />
            {doc.buyerAddr}
            <br />
            {doc.buyerContact}
          </div>
        </div>
        <div className="vqr-box">
          <div className="vqr-lbl">Tedarikçi</div>
          <div className="vqr-name">{doc.vendorName}</div>
          {doc.vendorLines.length ? (
            <div className="vqr-sub">
              {doc.vendorLines.map((line, i) => (
                <span key={`${i}-${line}`}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <p className="vqr-notice">
        <b>{doc.quoteRef}</b>
        {doc.requestTitle ? ` — ${doc.requestTitle}` : ''}. Aşağıdaki satırlar {doc.vendorName}{' '}
        tarafından teklif portalında onaylanarak gönderilmiştir.
      </p>
    </div>
  );
}

function LinesTable({
  items,
  continued,
  applyVat,
}: {
  items: QuoteReceiptLine[];
  continued: boolean;
  applyVat: boolean;
}) {
  return (
    <div>
      {continued ? <p className="vqr-cont">Kalem listesi · devam</p> : null}
      <table className="vqr-lines">
        <thead>
          <tr>
            <th className="vqr-c-no">#</th>
            <th className="vqr-c-name">Kalem</th>
            <th className="vqr-c-qty">Miktar</th>
            <th className="vqr-c-price">Birim fiyat</th>
            <th className="vqr-c-cur">Pb</th>
            <th className="vqr-c-disc">İsk.</th>
            {applyVat ? <th className="vqr-c-vat">KDV</th> : null}
            <th className="vqr-c-sum">{applyVat ? "Satır (KDV'li) toplamı" : 'Satır toplamı'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.no}>
              <td className="vqr-c-no">{it.no}</td>
              <td className="vqr-c-name">
                {it.name}
                {it.notes ? (
                  <>
                    <br />
                    <span className="vqr-muted">{it.notes}</span>
                  </>
                ) : null}
              </td>
              <td className="vqr-c-qty">
                {it.qty.toLocaleString('tr-TR')} <span className="vqr-muted">{it.unit}</span>
              </td>
              <td className="vqr-c-price">{money(it.price)}</td>
              <td className="vqr-c-cur">{it.currency}</td>
              <td className="vqr-c-disc">{it.disc ? `%${it.disc}` : '—'}</td>
              {applyVat ? <td className="vqr-c-vat">{it.vat != null ? `%${it.vat}` : '—'}</td> : null}
              <td className="vqr-c-sum">
                {money(lineNet(it, applyVat))} {curMark(it.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Closing({ doc }: { doc: QuoteReceiptDoc }) {
  const bags = bagsAfterOverall(doc.items, doc.overallDiscount, doc.applyVat);
  const shown = (['EUR', 'USD', 'CHF', 'TRY'] as const).filter((c) => (bags[c] || 0) > 0.0001);
  const showCommercial = doc.applyVat;
  return (
    <div className="vqr-closing">
      <div className="vqr-grid">
        <div>
          {showCommercial || doc.note ? (
            <div className="vqr-box">
              {showCommercial ? (
                <>
                  <div className="vqr-lbl">Ticari koşullar</div>
                  <table className="vqr-kv">
                    <tbody>
                      <tr>
                        <th>Nakliye</th>
                        <td>{doc.shipping}</td>
                      </tr>
                      <tr>
                        <th>Vade</th>
                        <td>{doc.maturity}</td>
                      </tr>
                      <tr>
                        <th>Döviz kuru</th>
                        <td>
                          {doc.fx.split(' · ').map((line) => (
                            <div key={line} className="vqr-fx-line">
                              {line}
                            </div>
                          ))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : (
                <div className="vqr-lbl">Teklif notu</div>
              )}
              {doc.note ? <div className="vqr-sub">{doc.note}</div> : null}
            </div>
          ) : null}
          {doc.files.length ? (
            <div className="vqr-box vqr-files">
              <div className="vqr-lbl">Tedarikçinin eklediği dosyalar</div>
              <ul>
                {doc.files.map((f) => (
                  <li key={f.name}>
                    <span>{f.name}</span>
                    <span className="vqr-muted">{f.sizeLabel || ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="vqr-totals">
          <div className="vqr-lbl">Teklif toplamı</div>
          <table className="vqr-kv">
            <tbody>
              <tr>
                <th>Genel iskonto</th>
                <td>%{Number(doc.overallDiscount) || 0}</td>
              </tr>
              {(shown.length ? shown : (['TRY'] as const)).map((c) => (
                <tr key={c}>
                  <th>{c}</th>
                  <td>
                    {money(bags[c] || 0)} {curMark(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="vqr-grand">
            <span>Kayıt özeti</span>
            <span>{doc.items.length} kalem</span>
          </div>
        </div>
      </div>
      <p className="vqr-legal">
        Bu belge, tedarikçinin {doc.submittedAt} tarihinde sisteme ilettiği fiyat ve koşulların
        dökümüdür. Satın alma emri, sipariş veya ödeme taahhüdü doğurmaz. Uyuşmazlıkta portal kaydı
        esas alınır.
      </p>
      <div className="vqr-signs">
        <div className="vqr-sign">
          <div className="who">{doc.vendorName}</div>
          <div className="role">Teklifi gönderen · kaşe / imza (isteğe bağlı)</div>
        </div>
        <div className="vqr-sign">
          <div className="who">Uğur Promilling Satın Alma</div>
          <div className="role">Sistem kayıt tarihi {doc.submittedAt}</div>
        </div>
      </div>
    </div>
  );
}

function Sheet({
  doc,
  page,
  pages,
  spec,
}: {
  doc: QuoteReceiptDoc;
  page: number;
  pages: number;
  spec: PageSpec;
}) {
  return (
    <article className="vqr-sheet">
      <Header doc={doc} page={page} pages={pages} />
      <div className="vqr-body">
        {spec.showIntro ? <Intro doc={doc} /> : null}
        {spec.items.length ? (
          <LinesTable items={spec.items} continued={spec.continued} applyVat={doc.applyVat} />
        ) : null}
        {spec.showClosing ? <Closing doc={doc} /> : null}
      </div>
      <Footer doc={doc} page={page} pages={pages} />
    </article>
  );
}

type PageMetrics = {
  bodyH: number;
  introH: number;
  closingH: number;
  theadH: number;
  contH: number;
  rowHs: number[];
};

function outerHeight(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return 0;
  const rect = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return rect.height + parseFloat(st.marginTop || '0') + parseFloat(st.marginBottom || '0');
}

function measureProbe(sheet: HTMLElement): PageMetrics | null {
  const body = sheet.querySelector('.vqr-body') as HTMLElement | null;
  if (!body) return null;
  const rows = [...sheet.querySelectorAll('.vqr-lines tbody tr')] as HTMLElement[];
  const rowHs: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (i < rows.length - 1) {
      rowHs.push(
        Math.max(0, rows[i + 1].getBoundingClientRect().top - rows[i].getBoundingClientRect().top),
      );
    } else {
      rowHs.push(outerHeight(rows[i]));
    }
  }
  return {
    bodyH: body.clientHeight,
    introH: outerHeight(sheet.querySelector('[data-vqr="intro"]')),
    closingH: outerHeight(sheet.querySelector('[data-vqr="closing"]')),
    theadH: outerHeight(sheet.querySelector('.vqr-lines thead')),
    contH: outerHeight(sheet.querySelector('.vqr-cont')),
    rowHs,
  };
}

function paginateFallback(doc: QuoteReceiptDoc): PageSpec[] {
  const items = doc.items;
  const BODY = 920;
  const INTRO = 160;
  const THEAD = 26;
  const ROW = 24;
  const CLOSING = 240;
  const CONT = 18;
  const pages: PageSpec[] = [];
  let i = 0;
  let first = true;
  while (first || i < items.length) {
    const showIntro = first;
    const continued = !first && i < items.length;
    const avail =
      BODY - (showIntro ? INTRO : 0) - (i < items.length ? THEAD : 0) - (continued ? CONT : 0);
    let count = 0;
    while (i + count < items.length && (count + 1) * ROW <= avail) count += 1;
    if (count === 0 && i < items.length) count = 1;
    const slice = items.slice(i, i + count);
    i += count;
    const used =
      (showIntro ? INTRO : 0) +
      (slice.length ? THEAD + slice.length * ROW + (continued ? CONT : 0) : 0);
    const showClosing = i >= items.length && BODY - used >= CLOSING;
    pages.push({ items: slice, continued, showIntro, showClosing });
    first = false;
    if (i >= items.length) {
      if (!showClosing) {
        pages.push({ items: [], continued: false, showIntro: false, showClosing: true });
      }
      break;
    }
  }
  if (!pages.length) {
    pages.push({ items: [], continued: false, showIntro: true, showClosing: true });
  }
  return pages;
}

function paginateFromMetrics(doc: QuoteReceiptDoc, m: PageMetrics): PageSpec[] {
  const items = doc.items;
  const cap = Math.max(80, m.bodyH - 4);
  const pages: PageSpec[] = [];
  let i = 0;
  let first = true;

  while (first || i < items.length) {
    const showIntro = first;
    const continued = !first && i < items.length;
    let used = showIntro ? m.introH : 0;
    if (i < items.length) used += m.theadH + (continued ? m.contH : 0);
    let count = 0;
    while (i + count < items.length) {
      const h = m.rowHs[i + count] || 22;
      if (used + h > cap && count > 0) break;
      used += h;
      count += 1;
      if (used > cap) break;
    }
    const slice = items.slice(i, i + count);
    i += count;
    const showClosing = i >= items.length && used + m.closingH <= cap;
    pages.push({ items: slice, continued, showIntro, showClosing });
    first = false;
    if (i >= items.length) {
      if (!showClosing) {
        pages.push({ items: [], continued: false, showIntro: false, showClosing: true });
      }
      break;
    }
  }
  if (!pages.length) {
    pages.push({ items: [], continued: false, showIntro: true, showClosing: true });
  }
  return pages;
}

function visibleSheets(root: HTMLElement) {
  return [...root.querySelectorAll('.vqr-sheet:not(.vqr-probe)')] as HTMLElement[];
}

function peelOverflow(pages: PageSpec[], index: number): PageSpec[] | null {
  const src = pages[index];
  if (!src) return null;
  if (src.showClosing && (src.items.length > 0 || src.showIntro)) {
    const next = pages.map((p, i) => (i === index ? { ...p, showClosing: false } : { ...p, items: [...p.items] }));
    next.push({ items: [], continued: false, showIntro: false, showClosing: true });
    return next;
  }
  if (src.items.length <= 1) return null;
  const kept = src.items.slice(0, -1);
  const moved = src.items[src.items.length - 1];
  const next = pages.map((p, i) => (i === index ? { ...p, items: kept } : { ...p, items: [...p.items] }));
  const dest = next[index + 1];
  if (dest && !(!dest.items.length && dest.showClosing)) {
    next[index + 1] = { ...dest, items: [moved, ...dest.items], continued: true };
  } else {
    next.splice(index + 1, 0, {
      items: [moved],
      continued: true,
      showIntro: false,
      showClosing: false,
    });
  }
  return next;
}

function Probe({ doc }: { doc: QuoteReceiptDoc }) {
  return (
    <article className="vqr-sheet vqr-probe" aria-hidden>
      <Header doc={doc} page={1} pages={1} />
      <div className="vqr-body">
        <div data-vqr="intro">
          <Intro doc={doc} />
        </div>
        <LinesTable items={doc.items} continued applyVat={doc.applyVat} />
        <div data-vqr="closing">
          <Closing doc={doc} />
        </div>
      </div>
      <Footer doc={doc} page={1} pages={1} />
    </article>
  );
}

function sheetOverflows(sheet: HTMLElement) {
  const body = sheet.querySelector('.vqr-body') as HTMLElement | null;
  if (!body) return false;
  return body.scrollHeight > body.clientHeight + 2;
}

function waitForImages(root: HTMLElement) {
  return Promise.all(
    [...root.querySelectorAll('img')].map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

function paintSheetColors(root: HTMLElement) {
  root.style.color = '#1a1a1a';
  root.style.background = '#fffdf8';
  root.style.boxShadow = 'none';
  root.style.colorScheme = 'light';
  root.style.transform = 'none';
  root.querySelectorAll<HTMLElement>('.vqr-body, .vqr-box, .vqr-totals, .vqr-head, .vqr-lines td').forEach((el) => {
    if (!el.style.color) el.style.color = '#1a1a1a';
  });
}

function preparePdfNode(root: HTMLElement) {
  paintSheetColors(root);
  root.style.letterSpacing = 'normal';
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.style.letterSpacing = '0px';
  });
  root.querySelectorAll('table').forEach((t) => {
    const el = t as HTMLElement;
    el.style.borderCollapse = 'separate';
    el.style.borderSpacing = '0';
  });
}

function fileNameFor(doc: QuoteReceiptDoc) {
  const raw = `Teklif-${doc.vendorName}-${doc.docNo}`.replace(/[^\p{L}\p{N}\-_]+/gu, '-');
  return `${raw.replace(/-+/g, '-').replace(/^-|-$/g, '')}.pdf`;
}

export function VendorQuoteReceipt({ doc }: { doc: QuoteReceiptDoc }) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const repairPasses = useRef(0);
  const [pages, setPages] = useState<PageSpec[]>([]);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    repairPasses.current = 0;
    const root = workspaceRef.current;
    const probe = root?.querySelector('.vqr-probe') as HTMLElement | null;
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      repairPasses.current = 0;
      if (!probe) {
        setPages(paginateFallback(doc));
        return;
      }
      const metrics = measureProbe(probe);
      if (!metrics || metrics.bodyH < 80) {
        setPages(paginateFallback(doc));
        return;
      }
      setPages(paginateFromMetrics(doc, metrics));
    };
    apply();
    const imgs = probe ? [...probe.querySelectorAll('img')] : [];
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', apply);
    });
    return () => {
      cancelled = true;
      imgs.forEach((img) => img.removeEventListener('load', apply));
    };
  }, [doc]);

  useLayoutEffect(() => {
    const root = workspaceRef.current;
    if (!root || repairPasses.current > 80) return;
    const sheets = visibleSheets(root);
    if (!sheets.length) return;
    const index = sheets.findIndex(sheetOverflows);
    if (index < 0) return;
    const next = peelOverflow(pages, index);
    if (!next) return;
    repairPasses.current += 1;
    setPages(next);
  }, [pages]);

  const printDoc = useCallback(() => {
    window.print();
  }, []);

  const downloadPdf = useCallback(async () => {
    const root = workspaceRef.current;
    if (!root) return;
    const sheets = visibleSheets(root);
    if (!sheets.length) return;
    setBusy(true);
    const shadows = sheets.map((s) => s.style.boxShadow);
    try {
      sheets.forEach((s) => {
        s.style.boxShadow = 'none';
      });
      await waitForImages(root);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      // PDF kütüphaneleri (~600 KB) yalnızca indirme anında yüklenir; sayfa paketine girmez.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210;
      const pageH = 297;
      for (let i = 0; i < sheets.length; i += 1) {
        const el = sheets[i];
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#fffdf8',
          logging: false,
          onclone: (_doc, node) => {
            preparePdfNode(node as HTMLElement);
          },
        });
        const img = canvas.toDataURL('image/png');
        let imgW = pageW;
        let imgH = (canvas.height / canvas.width) * pageW;
        if (imgH > pageH) {
          imgH = pageH;
          imgW = (canvas.width / canvas.height) * pageH;
        }
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'PNG', (pageW - imgW) / 2, 0, imgW, imgH, undefined, 'NONE');
      }
      pdf.save(fileNameFor(doc));
    } catch {
      toast.error('PDF indirilemedi. Yazdırıp PDF olarak kaydetmeyi deneyin.');
    } finally {
      sheets.forEach((s, i) => {
        s.style.boxShadow = shadows[i];
      });
      setBusy(false);
    }
  }, [doc]);

  return (
    <div className="vqr-success">
      <div className="vqr-chrome">
        <div className="vqr-chrome-inner">
          <div className="vqr-chrome-copy">
            <h1>
              Teklifiniz <span>alındı</span>
            </h1>
            <p>
              Teşekkür ederiz. Teklifiniz bize ulaştı; kaydınız aşağıda.
              Belgeyi indirebilir veya yazdırabilirsiniz.
            </p>
          </div>
          <div className="vqr-actions">
            <button type="button" className="vqr-btn vqr-btn-gold" onClick={downloadPdf} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              İndir
            </button>
            <button type="button" className="vqr-btn vqr-btn-ghost" onClick={printDoc} disabled={busy}>
              <Printer className="h-4 w-4" />
              Yazdır
            </button>
          </div>
        </div>
      </div>
      <div className="vqr-workspace" ref={workspaceRef}>
        <Probe doc={doc} />
        {pages.map((spec, i) => (
          <Sheet key={i} doc={doc} page={i + 1} pages={pages.length} spec={spec} />
        ))}
      </div>
    </div>
  );
}

export function parseQuoteNumber(raw: string | undefined) {
  if (!raw) return null;
  const n = Number(String(raw).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function trimText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqText(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = trimText(value);
    if (!text) continue;
    const key = text.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function uniqPhones(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = trimText(value);
    if (!text) continue;
    const digits = text.replace(/\D/g, '').slice(-10);
    const key = digits || text.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(maskTrPhoneLoose(text));
  }
  return out;
}

function formatVendorLines(vendor: any): string[] {
  if (!vendor) return [];
  const contacts = Array.isArray(vendor.contacts) ? vendor.contacts : [];
  const mainEmail = trimText(vendor.contactEmail).toLocaleLowerCase('tr-TR');
  const mainPhone = trimText(vendor.contactPhone).replace(/\D/g, '').slice(-10);
  const covered = contacts.some((c: any) => {
    const email = trimText(c?.email).toLocaleLowerCase('tr-TR');
    const phone = trimText(c?.phone).replace(/\D/g, '').slice(-10);
    return (mainEmail && email === mainEmail) || (!mainEmail && mainPhone && phone === mainPhone);
  });
  const people = covered ? [...contacts] : [
    {
      name: vendor.contactName,
      title: '',
      email: vendor.contactEmail,
      phone: vendor.contactPhone,
    },
    ...contacts,
  ];

  const lines: string[] = [];
  for (const person of people) {
    const name = trimText(person?.name);
    const title = trimText(person?.title);
    if (!name) continue;
    lines.push(title ? `${name} · ${title}` : name);
  }

  const phones = uniqPhones([
    vendor.contactPhone,
    ...(vendor.extraContactPhones || []),
    ...people.map((p: any) => p?.phone),
  ]);
  if (phones.length) lines.push(phones.join(' · '));

  const emails = uniqText([
    vendor.contactEmail,
    ...(vendor.extraContactEmails || []),
    ...people.map((p: any) => p?.email),
  ]);
  if (emails.length) lines.push(emails.join(' · '));

  const address = trimText(vendor.address);
  if (address) lines.push(address);
  const location = [vendor.district, vendor.city].map(trimText).filter(Boolean).join(', ');
  if (location) {
    const hay = address.toLocaleLowerCase('tr-TR');
    if (!hay || !hay.includes(location.toLocaleLowerCase('tr-TR'))) lines.push(location);
  }

  const taxId = trimText(vendor.taxId);
  if (taxId) lines.push(`VKN: ${taxId}`);

  return uniqText(lines);
}

export function buildQuoteReceiptDoc(args: {
  req: any;
  orderedItems: Array<{ id: string; productName: string; quantity: number; unit?: string }>;
  quotedItems: Record<string, any>;
  overallDiscountRate: string;
  isShippingIncluded: boolean;
  hasMaturity: boolean;
  maturityDays: string;
  usdRateFixed: boolean;
  usdRate: string;
  eurRate: string;
  chfRate: string;
  quoteNote: string;
  fxRates?: { usd: number; eur: number; chf: number } | null;
}): QuoteReceiptDoc {
  const { req } = args;
  const applyVat = usesPurchasingQuoteForm(req?.moduleId);
  const overall = parseQuoteNumber(args.overallDiscountRate) || 0;
  const items: QuoteReceiptLine[] = args.orderedItems.map((item, i) => {
    const q = args.quotedItems[item.id] || {};
    const price = parseQuoteNumber(q.price) || 0;
    const disc = parseQuoteNumber(q.discountRate) || 0;
    const vat = applyVat ? Number(q.vatRate) || 20 : null;
    return {
      no: i + 1,
      name: String(item.productName || 'Kalem'),
      qty: Number(item.quantity) || 0,
      unit: String(item.unit || 'Adet'),
      price,
      currency: String(q.currency || 'TRY').toUpperCase(),
      disc,
      vat,
      notes: String(q.notes || '').trim() || undefined,
    };
  });

  const fxBits: string[] = [];
  const usd = parseQuoteNumber(args.usdRate);
  const eur = parseQuoteNumber(args.eurRate);
  const chf = parseQuoteNumber(args.chfRate);
  if (args.usdRateFixed) {
    if (usd && usd > 0) fxBits.push(`1 USD = ${money(usd)} ₺ (sabit)`);
    if (eur && eur > 0) fxBits.push(`1 EUR = ${money(eur)} ₺ (sabit)`);
    if (chf && chf > 0) fxBits.push(`1 CHF = ${money(chf)} ₺ (sabit)`);
  }
  if (!fxBits.length && args.fxRates) {
    if (args.fxRates.usd) fxBits.push(`1 USD = ${money(args.fxRates.usd)} ₺ (TCMB)`);
    if (args.fxRates.eur) fxBits.push(`1 EUR = ${money(args.fxRates.eur)} ₺ (TCMB)`);
    if (args.fxRates.chf) fxBits.push(`1 CHF = ${money(args.fxRates.chf)} ₺ (TCMB)`);
  }

  const lh = req?.letterhead || {};
  const contact = lh.contact || lh.manager;
  const contactLine = contact
    ? [contact.name, contact.phone, contact.email].filter(Boolean).join(' · ')
    : 'Satın Alma Birimi';

  const myVendorId = req?.myVendorId;
  const files: QuoteReceiptFile[] = (req?.attachments || [])
    .filter((a: any) => a?.vendorId && (!myVendorId || a.vendorId === myVendorId) && a.kind !== 'INVOICE')
    .map((a: any) => ({
      name: String(a.originalName || 'Dosya'),
      sizeLabel: a.size != null ? formatBytes(a.size) : undefined,
    }));

  const idTail = String(req?.id || '').slice(-6).toUpperCase();
  const now = new Date();
  const submittedAt = now.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    docNo: `TKL-${now.getFullYear()}-${idTail || '000000'}`,
    submittedAt,
    quoteRef: String(lh.quoteRef || req?.title || '').trim() || 'Teklif kaydı',
    requestTitle: String(req?.title || '').trim(),
    buyerName: 'Uğur Promilling',
    buyerLegal: 'BARMAKSAN ENDÜSTRİ ve MAKİNA SAN. AŞ',
    buyerTax: 'Hasanpaşa VD NO: 1420639163',
    buyerAddr: 'Pınarçay OSB, 7. Cd, No:27-31/1 Çorum / Türkiye',
    buyerContact: contactLine,
    vendorName: String(req?.vendor?.name || 'Tedarikçi'),
    vendorLines: formatVendorLines(req?.vendor),
    shipping: args.isShippingIncluded ? 'Nakliye dahil' : 'Nakliye hariç',
    maturity: args.hasMaturity
      ? `Vadeli · ${parseQuoteNumber(args.maturityDays) || '—'} gün`
      : 'Peşin',
    fx: fxBits.length ? fxBits.join(' · ') : 'Sistem TCMB kuru',
    overallDiscount: overall,
    note: String(args.quoteNote || '').trim(),
    applyVat,
    files,
    items,
  };
}
