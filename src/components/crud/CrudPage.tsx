import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

/**
 * Generic create/read/update/delete page.
 *
 * The first consumer of the component layer, which is why it is the file that
 * changed in P2. It used to carry its own copy of every primitive - a hand-styled
 * `<textarea>`, a hand-styled `<select>`, a bare `<input type="checkbox">`, a
 * `ring-3` focus ring that Tailwind 3.4 cannot compile, a `Card` for the loading
 * state and a `Dialog` for the delete confirmation - and three pages inherited all
 * of that.
 *
 * What it composes now: `PageHeader`, `EmptyState`, `SkeletonList`, `FormField`,
 * `Input`, `Textarea`, `Select`, `Checkbox`, `ConfirmDialog`. The visible contract
 * is unchanged on purpose - the labels stay associated with their controls (this
 * file is exercised through `getByLabelText` by three page tests) and the buttons
 * keep their names (`保存`, `删除`, `取消`).
 */

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
  /** The icon component, not an element: the kit decides its size and colour. */
  icon: LucideIcon;
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

function coerceFieldValue<TForm extends Record<string, unknown>>(
  field: CrudField<TForm>,
  value: string | boolean,
): CrudValue {
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
  icon: Icon,
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

  /*
   * A page with no `onDelete` gets no confirmation dialog. Before, it got a dialog
   * whose confirm button was disabled - a dead end dressed as an action. No current
   * caller omits `onDelete`; this is here so that one cannot.
   */
  const requestDelete = (item: TItem) => {
    if (onDelete) setDeleteTarget(item);
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
      <PageHeader
        title={title}
        description={description}
        icon={Icon}
        actions={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {addLabel}
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonList
          count={4}
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          itemClassName="h-28"
        />
      ) : items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={Icon} />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={getItemId(item)}>
              {renderItem(item, { openEdit, requestDelete })}
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
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
                <FormField
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  inline={field.type === 'checkbox'}
                >
                  {field.type === 'textarea' ? (
                    <Textarea
                      {...commonProps}
                      rows={field.rows ?? 3}
                      value={String(fieldValue ?? '')}
                      onChange={(event) => setField(field, event.target.value)}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      {...commonProps}
                      value={String(fieldValue ?? '')}
                      onChange={(event) => setField(field, event.target.value)}
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === 'checkbox' ? (
                    <Checkbox
                      id={field.name}
                      name={field.name}
                      required={field.required}
                      checked={Boolean(fieldValue)}
                      onCheckedChange={(checked) => setField(field, checked)}
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
                </FormField>
              );
            })}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" label="正在保存" />
                    保存中...
                  </>
                ) : (
                  '保存'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除"
        description={
          deleteTarget ? `确定要删除“${getItemTitle(deleteTarget)}”吗？` : '确定要删除这条记录吗？'
        }
        confirmLabel="删除"
        pendingLabel="删除中..."
        cancelLabel="取消"
        destructive
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
