import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CrudValue = string | number | boolean | null | undefined;

export interface CrudField<TForm extends Record<string, unknown>> {
  name: Extract<keyof TForm, string>;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'datetime-local' | 'checkbox' | 'select';
  required?: boolean;
  min?: number;
  placeholder?: string;
  rows?: number;
  options?: Array<{ label: string; value: string }>;
}

export interface CrudItemActions<TItem> {
  openEdit: (item: TItem) => void;
  requestDelete: (item: TItem) => void;
}

export interface CrudPageProps<TItem, TForm extends Record<string, unknown>> {
  title: string;
  description: string;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
  items: TItem[];
  isLoading: boolean;
  fields: CrudField<TForm>[];
  createInitialForm: () => TForm;
  mapItemToForm: (item: TItem) => TForm;
  getItemId: (item: TItem) => number;
  getItemTitle: (item: TItem) => string;
  validateForm: (form: TForm) => string | null;
  onCreate: (form: TForm) => Promise<unknown>;
  onUpdate: (id: number, form: TForm) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  renderItem: (item: TItem, actions: CrudItemActions<TItem>) => ReactNode;
}

function coerceFieldValue<TForm extends Record<string, unknown>>(field: CrudField<TForm>, value: string | boolean): CrudValue {
  if (field.type === 'number') {
    return Number(value);
  }
  if (field.type === 'checkbox') {
    return Boolean(value);
  }
  return value;
}

export function CrudPage<TItem, TForm extends Record<string, unknown>>({
  title,
  description,
  addLabel,
  emptyTitle,
  emptyDescription,
  icon,
  items,
  isLoading,
  fields,
  createInitialForm,
  mapItemToForm,
  getItemId,
  getItemTitle,
  validateForm,
  onCreate,
  onUpdate,
  onDelete,
  renderItem,
}: CrudPageProps<TItem, TForm>) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TItem | null>(null);
  const [form, setForm] = useState<TForm>(createInitialForm);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!formOpen) {
      setFormError('');
    }
  }, [formOpen]);

  const openCreate = () => {
    setEditingItem(null);
    setForm(createInitialForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (item: TItem) => {
    setEditingItem(item);
    setForm(mapItemToForm(item));
    setFormError('');
    setFormOpen(true);
  };

  const setField = (field: CrudField<TForm>, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      [field.name]: coerceFieldValue(field, value),
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const error = validateForm(form);
    if (error) {
      setFormError(error);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await onUpdate(getItemId(editingItem), form);
      } else {
        await onCreate(form);
      }
      setFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(getItemId(deleteTarget));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800">
            {icon}
            {title}
          </h2>
          <p className="text-slate-500">{description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">加载中...</CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-muted-foreground">{icon}</div>
            <div className="font-medium text-foreground">{emptyTitle}</div>
            <div className="text-sm text-muted-foreground">{emptyDescription}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={getItemId(item)}>{renderItem(item, { openEdit, requestDelete: setDeleteTarget })}</div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? `编辑${getItemTitle(editingItem)}` : addLabel}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {formError && <Badge variant="destructive">{formError}</Badge>}
            {fields.map((field) => {
              const fieldValue = form[field.name];
              const commonProps = {
                id: field.name,
                name: field.name,
                required: field.required,
                placeholder: field.placeholder,
                'aria-invalid': Boolean(formError),
              };

              return (
                <label key={field.name} className={cn('flex flex-col gap-1 text-sm font-medium', field.type === 'checkbox' && 'flex-row items-center')}>
                  <span>{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      {...commonProps}
                      rows={field.rows ?? 3}
                      value={String(fieldValue ?? '')}
                      onChange={(event) => setField(field, event.target.value)}
                      className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      {...commonProps}
                      value={String(fieldValue ?? '')}
                      onChange={(event) => setField(field, event.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input
                      {...commonProps}
                      type="checkbox"
                      checked={Boolean(fieldValue)}
                      onChange={(event) => setField(field, event.target.checked)}
                      className="size-4 rounded border-input text-primary"
                    />
                  ) : (
                    <Input
                      {...commonProps}
                      type={field.type}
                      min={field.min}
                      value={fieldValue === null || fieldValue === undefined ? '' : String(fieldValue)}
                      onChange={(event) => setField(field, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `确定要删除“${getItemTitle(deleteTarget)}”吗？` : '确定要删除这条记录吗？'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isDeleting || !onDelete}>
              <Trash2 data-icon="inline-start" />
              {isDeleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
