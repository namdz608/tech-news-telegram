export function devopsInfraFailureParts(error: unknown): {
  statusOrCode: number | string;
  name: string;
} {
  const name = error instanceof Error ? error.name : 'unknown';
  if (error && typeof error === 'object' && 'response' in error) {
    const status = (error as { response?: { status?: unknown } }).response?.status;
    if (typeof status === 'number') {
      return { statusOrCode: status, name };
    }
  }
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string' && code) {
    return { statusOrCode: code, name };
  }
  return { statusOrCode: 'unknown', name };
}
