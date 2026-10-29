'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AccountSettingsButton({
  className,
  variant = 'row',
}: {
  className?: string;
  variant?: 'row' | 'icon';
}) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const usesPassword = user?.role !== 'DEPARTMENT';

  const openDialog = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setCurrentPassword('');
    setNewPassword('');
    setOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Ad soyad en az 2 karakter olmalıdır.');
      return;
    }
    const extension = phone.trim();
    if (extension && !/^\d{2,8}$/.test(extension)) {
      toast.error('Dahili numara 2-8 rakam olmalıdır.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword && !currentPassword) {
      toast.error('Şifreyi değiştirmek için mevcut şifrenizi girin.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await authApi.updateProfile({
        name: trimmed,
        phone: extension || null,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      setUser({ ...(user as NonNullable<typeof user>), ...data, name: data.name });
      toast.success(newPassword ? 'Bilgileriniz ve şifreniz güncellendi.' : 'Bilgileriniz güncellendi.');
      setOpen(false);
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Kayıt güncellenemedi.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Hesap ayarları</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {usesPassword
                ? 'Adınız, dahili numaranız ve şifreniz yalnızca sizin hesabınıza yazılır.'
                : 'Adınız ve dahili numaranız yalnızca sizin hesabınıza yazılır.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ad soyad</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label>Dahili numara</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                placeholder="Örn. 162"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Teklif formunda şirket hattının yanında görünür. Boş bırakırsanız kayıtlı dahili silinir.
              </p>
            </div>
            {usesPassword ? (
              <div className="space-y-3 border-t border-border/60 pt-3">
                <div className="space-y-1.5">
                  <Label>Mevcut şifre</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Yalnızca şifre değişecekse"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Yeni şifre</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="En az 6 karakter"
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={openDialog}
          aria-label="Ayarlar"
          title="Ayarlar"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-white/15 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground',
            className,
          )}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all duration-150',
          className,
        )}
      >
        <Settings className="w-4 h-4 shrink-0" />
        Ayarlar
      </button>
      {dialog}
    </>
  );
}
