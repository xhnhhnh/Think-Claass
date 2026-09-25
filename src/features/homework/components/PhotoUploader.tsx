import { useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { HomeworkPhoto } from '@thinkclass/contracts/domains/homework';

import { useUploadPhotoMutation } from '../hooks/useHomework';

/** `1234567` -> `1.2 MB`, so a teacher can tell a photo from a thumbnail. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 拍照 / 上传照片.
 *
 * Used twice on an attempt: once for the whole submission (「整张试卷」) and once inside a
 * question (「这道题的照片」). Both are the same route - a photo belongs to the submission, and
 * a question-scoped one is recorded by that answer's `photo_ids`, which is why the caller gets
 * the created row back through `onUploaded` instead of the uploader deciding what the photo
 * means.
 *
 * The picker is a *visible* `Input type="file"` rather than the hidden `FileInput`: this is the
 * primary way a student hands in a photographed page, and a hidden control behind a button
 * hides the one affordance the feature exists for. `FormData` + the api client's `apiPost` is
 * the upload, so the browser sets the multipart boundary itself.
 */
export interface PhotoUploaderProps {
  submissionId: number;
  /** The created row, so the caller can attach it to a question's answer. */
  onUploaded?: (photo: HomeworkPhoto) => void;
  /** Photos already attached to this scope, listed under the control. */
  photos?: HomeworkPhoto[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export function PhotoUploader({
  submissionId,
  onUploaded,
  photos = [],
  label = '上传照片',
  hint,
  disabled = false,
  className,
}: PhotoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  /** Bumped after a successful upload: a file input cannot be cleared by state alone. */
  const [inputKey, setInputKey] = useState(0);
  const uploadPhoto = useUploadPhotoMutation();

  const handleUpload = async () => {
    if (!file) {
      toast.error('请先选择一张照片');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await uploadPhoto.mutateAsync({ submissionId, formData });
      setFile(null);
      setInputKey((key) => key + 1);
      onUploaded?.(response.data);
      toast.success('照片已上传');
    } catch {
      // The api layer already surfaced the failure; keep the chosen file so a retry is one tap.
    }
  };

  return (
    <div data-slot="photo-uploader" className={cn('space-y-3', className)}>
      <FormField label={label} hint={hint}>
        <Input
          key={inputKey}
          type="file"
          accept="image/*"
          disabled={disabled}
          aria-label={label}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !file || uploadPhoto.isPending}
          onClick={() => void handleUpload()}
        >
          {uploadPhoto.isPending ? (
            <Spinner size="sm" label="正在上传" />
          ) : (
            <Upload data-icon="inline-start" aria-hidden="true" />
          )}
          {uploadPhoto.isPending ? '上传中...' : '上传这张照片'}
        </Button>
        {file ? <span className="text-xs text-fg-3">已选择：{file.name}</span> : null}
      </div>

      {photos.length > 0 ? (
        <ul className="space-y-1.5">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="flex items-center gap-2 rounded-card border border-line-1 bg-surface-3/40 px-3 py-2 text-xs text-fg-2"
            >
              <Camera aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate">{photo.storage_path}</span>
              <span className="shrink-0 text-fg-3">{formatSize(photo.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default PhotoUploader;
