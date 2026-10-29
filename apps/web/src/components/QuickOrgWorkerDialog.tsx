'use client';

import { useEffect, useMemo, useState } from 'react';
import { HardHat, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type QuickOrgWorkerPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  departmentId: string;
};

type DeptOption = { id: string; name: string };

/** Tedarik talebi ekranından çıkmadan hızlı usta/çalışan oluşturma. */
export function QuickOrgWorkerDialog({
  open,
  onClose,
  onSave,
  isPending,
  departments,
  defaultDepartmentId = null,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: QuickOrgWorkerPayload) => void;
  isPending: boolean;
  departments: DeptOption[];
  defaultDepartmentId?: string | null;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments]
  );

  useEffect(() => {
    if (!open) return;
    setFirstName('');
    setLastName('');
    setPhone('');
    setDepartmentId(defaultDepartmentId);
    setErrors({});
  }, [open, defaultDepartmentId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'Ad gerekli';
    if (!lastName.trim()) errs.lastName = 'Soyad gerekli';
    if (!departmentId) errs.departmentId = 'Birim seçin';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      departmentId: departmentId!,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[480px] border-border max-h-[90vh] overflow-y-auto"
        style={{ background: 'hsl(0, 0%, 11%)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <HardHat className="w-5 h-5 text-primary" />
            Yeni Usta / Çalışan
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Kaydettikten sonra bu kişi talep formunda otomatik seçilir.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Ad <span className="text-destructive">*</span>
              </Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ad"
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {errors.firstName ? (
                <p className="text-destructive text-xs">{errors.firstName}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>
                Soyad <span className="text-destructive">*</span>
              </Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Soyad"
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {errors.lastName ? (
                <p className="text-destructive text-xs">{errors.lastName}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Mavi yaka birim <span className="text-destructive">*</span>
            </Label>
            <SearchableCombobox
              options={deptOptions}
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Birim ara ve seçin…"
              allowClear={false}
            />
            {errors.departmentId ? (
              <p className="text-destructive text-xs">{errors.departmentId}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Telefon (opsiyonel)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xx…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground">
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Kaydet ve Seç
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
