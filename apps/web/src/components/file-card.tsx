import type { ReactNode } from 'react';
import { Card, Chip } from '@heroui/react';
import type { MeetingFile } from '@/lib/api';
import { fileTypeLabel, formatFileSize } from '@/lib/meeting-file';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_LABELS: Record<MeetingFile['status'], string> = {
  UPLOADED: 'Загружен',
};

/** Карточка загруженного файла: имя, тип, размер, дата загрузки и статус; действия — через `actions`. */
export function FileCard({
  file,
  actions,
}: {
  file: MeetingFile;
  actions?: ReactNode;
}) {
  return (
    <Card className="gap-3 p-4" data-testid="file-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 break-all font-medium" data-testid="file-name">
          {file.originalName}
        </p>
        <Chip color="success" variant="soft" data-testid="file-status">
          {STATUS_LABELS[file.status]}
        </Chip>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Тип</dt>
        <dd data-testid="file-type">{fileTypeLabel(file.originalName)}</dd>
        <dt className="text-muted">Размер</dt>
        <dd data-testid="file-size">{formatFileSize(file.size)}</dd>
        <dt className="text-muted">Загружен</dt>
        <dd>
          <time dateTime={file.uploadedAt}>
            {dateFormat.format(new Date(file.uploadedAt))}
          </time>
        </dd>
      </dl>
      {actions && <div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
    </Card>
  );
}
