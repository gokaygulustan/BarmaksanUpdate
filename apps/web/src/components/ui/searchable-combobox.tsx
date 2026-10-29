'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string;
};

type Props = {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  controlClassName?: string;
  /** Listede yoksa yazılan metni olduğu gibi kabul et (ölçü birimi vb.). */
  allowCustom?: boolean;
  id?: string;
};

function fold(s: string) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i');
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = 'Seçin…',
  emptyText = 'Sonuç yok',
  disabled = false,
  allowClear = true,
  allowCustom = false,
  className,
  controlClassName,
  id,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');
  const allowCustomRef = useRef(allowCustom);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  queryRef.current = query;
  allowCustomRef.current = allowCustom;

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const display = selected?.label || (allowCustom ? value || '' : '');

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return options;
    return options.filter((o) => {
      const hay = fold(`${o.label} ${o.keywords || ''}`);
      return hay.includes(q);
    });
  }, [options, query]);

  const typed = query.trim();
  const typedFold = fold(typed);
  const exactMatch = typed
    ? options.some((o) => fold(o.value) === typedFold || fold(o.label) === typedFold)
    : false;
  const showCreate = allowCustom && typed.length > 0 && !exactMatch;

  const pick = (next: string) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      const q = queryRef.current.trim();
      if (allowCustomRef.current && q) onChange(q);
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onChange]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex h-10 w-full items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2',
          disabled && 'opacity-50 pointer-events-none',
          open && 'border-white/25',
          controlClassName
        )}
      >
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? query : display}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const q = query.trim();
            const exact = filtered.find(
              (o) => fold(o.value) === fold(q) || fold(o.label) === fold(q)
            );
            if (exact) {
              pick(exact.value);
              return;
            }
            if (allowCustom && q) {
              pick(q);
              return;
            }
            if (filtered[0]) pick(filtered[0].value);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {allowClear && value ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Temizle"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-white/10"
          aria-label="Listeyi aç"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="menu-pop absolute z-40 mt-1.5 max-h-[300px] w-full min-w-[220px] origin-top overflow-auto rounded-[16px] border border-white/[0.1] bg-[#1e1e21] p-1.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.4)] [scrollbar-width:thin]"
        >
          {showCreate ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-brand-ink transition-colors duration-100 hover:bg-brand hover:text-primary-foreground"
                onClick={() => pick(typed)}
              >
                <span className="truncate">
                  “{typed}” olarak kullan
                </span>
              </button>
            </li>
          ) : null}
          {filtered.length === 0 && !showCreate ? (
            <li className="px-3 py-6 text-center text-[13px] text-white/40">{emptyText}</li>
          ) : (
            filtered.map((o) => {
              const on = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    className={cn(
                      'group/opt flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-white/85 transition-colors duration-100 hover:bg-brand hover:text-primary-foreground',
                      on && 'font-medium'
                    )}
                    onClick={() => pick(o.value)}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0 text-brand group-hover/opt:text-primary-foreground',
                        on ? 'opacity-100' : 'opacity-0'
                      )}
                      strokeWidth={2.2}
                    />
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
