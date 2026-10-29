'use client';

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  isTrPhoneComplete,
  maskTrPhone,
  TR_PHONE_ERROR,
  TR_PHONE_PLACEHOLDER,
} from '@/lib/phone';
import { EMAIL_ERROR, EMAIL_RE, normalizeEmail } from '@/lib/email';

export type QuickVendorPayload = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  taxId: string;
  city: string;
  categories: string[];
  notes: string;
};

const empty = (): QuickVendorPayload => ({
  name: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  taxId: '',
  city: '',
  categories: [],
  notes: '',
});

const fold = (value: unknown) =>
  String(value ?? '')
    .replace(/[İIı]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase();

/**
 * Talep ekranından çıkmadan tedarikçi oluşturma formu.
 * Hem tek başına dialog içinde hem tedarikçi tablosunun içinde gömülü kullanılır.
 */
export function VendorQuickForm({
  onSave,
  onCancel,
  isPending,
  categorySuggestions = [],
  compact = false,
}: {
  onSave: (data: QuickVendorPayload) => void;
  onCancel: () => void;
  isPending: boolean;
  categorySuggestions?: string[];
  compact?: boolean;
}) {
  // Form her açılışta sıfırlanır: çağıran taraf `key` ile yeniden mount eder.
  const [form, setForm] = useState<QuickVendorPayload>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categoryDraft, setCategoryDraft] = useState('');

  const set = (key: keyof QuickVendorPayload, value: string | string[]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const addCategories = (raw: string) => {
    const incoming = raw
      .split(',')
      .map((t) => t.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR'))
      .filter(Boolean);
    if (!incoming.length) return;
    setForm((f) => {
      const seen = new Set(f.categories.map((c) => fold(c)));
      const merged = [...f.categories];
      for (const tag of incoming) {
        if (seen.has(fold(tag))) continue;
        seen.add(fold(tag));
        merged.push(tag);
      }
      return { ...f, categories: merged };
    });
    setCategoryDraft('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Firma adı zorunludur';
    const email = normalizeEmail(form.contactEmail);
    if (email && !EMAIL_RE.test(email)) errs.contactEmail = EMAIL_ERROR;
    if (!email && !form.contactPhone.trim()) {
      errs.contactPhone = 'E-posta yoksa telefon zorunludur';
    } else if (form.contactPhone.trim() && !isTrPhoneComplete(form.contactPhone)) {
      errs.contactPhone = TR_PHONE_ERROR;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const pendingTag = categoryDraft.trim();
    const categories = pendingTag
      ? [...form.categories, pendingTag.toLocaleUpperCase('tr-TR')]
      : form.categories;

    onSave({
      name: form.name.trim(),
      contactName: form.contactName.trim(),
      contactEmail: email,
      contactPhone: form.contactPhone.trim(),
      taxId: form.taxId.trim(),
      city: form.city.trim(),
      categories,
      notes: form.notes.trim(),
    });
  };

  const grid = compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={`grid gap-3 ${grid}`}>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Firma Adı <span className="text-destructive">*</span>
          </Label>
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Örn: Acme Demir Çelik A.Ş."
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name ? <p className="text-destructive text-xs">{errors.name}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">E-posta</Label>
          <Input
            type="email"
            inputMode="email"
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            onBlur={(e) => {
              const email = normalizeEmail(e.target.value);
              setForm((f) => ({ ...f, contactEmail: email }));
              setErrors((prev) => ({
                ...prev,
                ...(email && !EMAIL_RE.test(email)
                  ? { contactEmail: EMAIL_ERROR }
                  : { contactEmail: '' }),
              }));
            }}
            placeholder="firma@ornek.com"
            className={errors.contactEmail ? 'border-destructive' : ''}
          />
          {errors.contactEmail ? (
            <p className="text-destructive text-xs">{errors.contactEmail}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Telefon</Label>
          <Input
            inputMode="tel"
            value={form.contactPhone}
            onChange={(e) => set('contactPhone', maskTrPhone(e.target.value))}
            placeholder={TR_PHONE_PLACEHOLDER}
            className={errors.contactPhone ? 'border-destructive' : ''}
          />
          {errors.contactPhone ? (
            <p className="text-destructive text-xs">{errors.contactPhone}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Yetkili</Label>
          <Input
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="Ad Soyad"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Şehir</Label>
          <Input
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Örn: Çorum"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Vergi No</Label>
          <Input
            value={form.taxId}
            onChange={(e) => set('taxId', e.target.value)}
            placeholder="Opsiyonel"
          />
        </div>
      </div>

      {/* Ne satıyor */}
      <div className="space-y-1.5">
        <Label className="text-xs">Ne satıyor (etiket)</Label>
        {form.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.categories.map((category) => (
              <span
                key={category}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
              >
                {category}
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'categories',
                      form.categories.filter((c) => c !== category),
                    )
                  }
                  className="text-primary/70 hover:text-primary"
                  aria-label={`${category} etiketini kaldır`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            list="quick-vendor-categories"
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addCategories(categoryDraft);
              }
            }}
            placeholder="MOTOR, PASLANMAZ SAC…"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => addCategories(categoryDraft)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <datalist id="quick-vendor-categories">
          {categorySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="text-[11px] text-muted-foreground">
          Aramada bulunabilmesi için ne sattığını yaz. Enter veya virgülle ekle.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Not</Label>
        <Textarea
          value={form.notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('notes', e.target.value)}
          placeholder="Örn: ASİL ÇELİK - ETLİ BORU. Notlar da aramada taranır."
          className="min-h-[60px] bg-background border-border"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          İptal
        </Button>
        <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground">
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Kaydet ve Seç
        </Button>
      </div>
    </form>
  );
}
