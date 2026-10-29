'use client';

import { Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VendorQuickForm, type QuickVendorPayload } from '@/components/VendorQuickForm';

export type { QuickVendorPayload };

/** Tedarik talebi ekranından çıkmadan hızlı tedarikçi oluşturma. */
export function QuickVendorDialog({
  open,
  onClose,
  onSave,
  isPending,
  categorySuggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: QuickVendorPayload) => void;
  isPending: boolean;
  categorySuggestions?: string[];
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[620px] border-border max-h-[90vh] overflow-y-auto"
        style={{ background: 'hsl(0, 0%, 11%)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Yeni Tedarikçi Ekle
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Kayıt sonrası seçime otomatik eklenir. Adres, ek e-posta ve yetkili kişiler için
            Tedarikçiler sayfasını kullanın.
          </DialogDescription>
        </DialogHeader>
        <VendorQuickForm
          key={open ? 'acik' : 'kapali'}
          onSave={onSave}
          onCancel={onClose}
          isPending={isPending}
          categorySuggestions={categorySuggestions}
        />
      </DialogContent>
    </Dialog>
  );
}
