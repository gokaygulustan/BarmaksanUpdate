'use client';

import { CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExecutiveCopyContact = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  contacts: ExecutiveCopyContact[];
  loading?: boolean;
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
  /** Onay limiti ayarındaki üst yönetim e-postası — listede ayrı satır, varsayılan işaretli. */
  canonical?: ExecutiveCopyContact | null;
  /** dark = satın alma talep detayı modalı */
  tone?: 'dark' | 'light';
};

const MAX_EXTRAS = 15;

function norm(email: string) {
  return String(email || '').trim().toLowerCase();
}

export function splitExecutiveRecipients(
  selectedEmails: string[],
  canonicalEmail?: string | null,
) {
  const canon = norm(canonicalEmail || '');
  const selected = selectedEmails.map(norm).filter(Boolean);
  return {
    extraEmails: selected.filter((e) => e !== canon),
    includeCanonical: Boolean(canon && selected.includes(canon)),
  };
}

export function ExecutiveCopyRecipients({
  contacts,
  loading,
  selectedEmails,
  onChange,
  canonical,
  tone = 'light',
}: Props) {
  const selected = new Set(selectedEmails.map(norm));
  const dark = tone === 'dark';
  const canonicalEmail = canonical ? norm(canonical.email) : '';
  const extraContacts = contacts.filter((c) => norm(c.email) !== canonicalEmail);

  const toggle = (email: string) => {
    const e = norm(email);
    if (!e) return;
    const next = new Set(selected);
    if (next.has(e)) next.delete(e);
    else {
      const extrasCount = [...next].filter((x) => x !== canonicalEmail).length;
      if (e !== canonicalEmail && extrasCount >= MAX_EXTRAS) return;
      next.add(e);
    }
    onChange([...next]);
  };

  const selectAll = () => {
    const extras = extraContacts
      .map((c) => norm(c.email))
      .filter(Boolean)
      .slice(0, MAX_EXTRAS);
    onChange(canonicalEmail ? [canonicalEmail, ...extras] : extras);
  };

  const clear = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            dark ? 'text-muted-foreground' : 'text-muted-foreground',
          )}
        >
          Alıcılar
        </p>
        {(canonical || extraContacts.length > 0) && (
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={selectAll}
            >
              Tümünü seç
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="font-medium text-muted-foreground hover:underline"
              onClick={clear}
            >
              Temizle
            </button>
          </div>
        )}
      </div>
      <p className={cn('text-xs leading-relaxed', dark ? 'text-muted-foreground' : 'text-muted-foreground')}>
        Yalnız işaretlenenlere bağlantı gider. Üst yönetim satırını kaldırırsanız o kişi bu talebi
        görmez.
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Liste yükleniyor…</p>
      ) : !canonical && extraContacts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          Tanımlı alıcı yok. Üst yönetim e-postasını Ayarlar → Onay limiti’nden, diğer kişileri
          Ayarlar → Teklif mail kopyası’ndan ekleyin.
        </p>
      ) : (
        <ul className="max-h-[min(260px,40vh)] space-y-1.5 overflow-y-auto pr-0.5">
          {canonical && canonicalEmail ? (
            <li>
              <button
                type="button"
                onClick={() => toggle(canonical.email)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  selected.has(canonicalEmail)
                    ? dark
                      ? 'border-primary bg-primary/15'
                      : 'border-primary/50 bg-primary/10'
                    : dark
                      ? 'border-border/60 bg-background/40 hover:bg-background/70'
                      : 'border-border bg-background hover:bg-muted/40',
                )}
              >
                {selected.has(canonicalEmail) ? (
                  <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {canonical.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {canonical.email}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                  Üst yönetim
                </span>
              </button>
            </li>
          ) : null}
          {extraContacts.map((person) => {
            const email = norm(person.email);
            const sel = selected.has(email);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => toggle(person.email)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                    sel
                      ? dark
                        ? 'border-primary bg-primary/15'
                        : 'border-primary/50 bg-primary/10'
                      : dark
                        ? 'border-border/60 bg-background/40 hover:bg-background/70'
                        : 'border-border bg-background hover:bg-muted/40',
                  )}
                >
                  {sel ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {person.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
