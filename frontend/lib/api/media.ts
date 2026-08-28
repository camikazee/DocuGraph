import { apiForm } from '../api';

export function uploadAsset<T>(
  workspaceId: string,
  file: File,
  volumeId?: string,
  signal?: AbortSignal,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (volumeId) form.append('volumeId', volumeId);
  return apiForm<T>(`/workspaces/${workspaceId}/assets`, form, {
    method: 'POST',
    signal,
  });
}
