'use client';

import { ClipboardList, Filter, Plus, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const statusColors: Record<string, string> = {
  DRAFT: 'hsl(0, 0%, 45%)',
  OPEN: 'hsl(142, 50%, 48%)',
  IN_REVIEW: 'hsl(48, 71%, 50%)',
  AWARDED: 'hsl(48, 40%, 48%)',
  CANCELLED: 'hsl(0, 72%, 58%)',
};

export default function TasksPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <ClipboardList className="w-6 h-6" style={{ color: 'hsl(48, 71%, 50%)' }} />
            Görevlerim
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Size veya firmanıza atanan satınalma talepleri
          </p>
        </div>
        <Button
          id="create-task-btn"
          style={{ background: 'hsl(48, 71%, 50%)', color: 'hsl(0, 0%, 8%)' }}
          className="font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Talep
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="border-border" style={{ background: 'hsl(0, 0%, 11%)' }}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="tasks-search"
                placeholder="Görevlerde ara..."
                className="pl-9 border-border text-foreground placeholder:text-muted-foreground"
                style={{ background: 'hsl(0, 0%, 18%)' }}
              />
            </div>
            <Button
              variant="outline"
              className="border-border text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtrele
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-muted-foreground">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Tasks Table Placeholder */}
      <Card className="border-border" style={{ background: 'hsl(0, 0%, 11%)' }}>
        <CardHeader>
          <CardTitle className="text-foreground text-base">Atanan Görevler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="w-14 h-14 text-muted-foreground opacity-20 mb-4" />
            <p className="text-foreground font-medium">Henüz görev yok</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              Size atanan satınalma talepleri burada görünecek. Yönetmeye başlamak için veritabanına bağlanın.
            </p>
            <div className="flex gap-3 mt-6">
              <Badge
                className="cursor-pointer"
                style={{
                  background: 'hsl(48, 68%, 39% / 0.15)',
                  color: 'hsl(48, 71%, 50%)',
                  border: '1px solid hsl(48, 68%, 39% / 0.3)',
                }}
              >
                Veritabanına Bağlan
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer border-border text-muted-foreground hover:text-foreground"
              >
                Belgeleri İncele
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
