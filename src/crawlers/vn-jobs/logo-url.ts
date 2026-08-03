/**
 * Chuẩn hóa URL logo công ty từ HTML/API (relative, protocol-relative, http(s)).
 * TopCV CDN (`cdn-new.topcv.vn/unsafe/...`) mặc định trả WebP — pdfkit không nhúng được,
 * nên ưu tiên URL gốc `static.topcv.vn` (JPEG/PNG).
 */
export function normalizeLogoUrl(raw: string | undefined, baseUrl: string): string | undefined {
  const trimmed = raw?.trim();

  if (!trimmed || trimmed.startsWith('data:')) {
    return undefined;
  }

  try {
    const absolute = trimmed.startsWith('//')
      ? `https:${trimmed}`
      : new URL(trimmed, baseUrl).href;

    if (!/^https?:\/\//i.test(absolute)) {
      return undefined;
    }

    return preferPdfCompatibleLogoUrl(absolute);
  } catch {
    return undefined;
  }
}

/**
 * Ưu tiên nguồn ảnh JPEG/PNG cho PDF.
 * - TopCV imgproxy: `/unsafe/.../https://static.topcv.vn/...` → lấy URL gốc bên trong
 * - Nếu vẫn là CDN TopCV: ép `filters:format(jpeg)`
 */
export function preferPdfCompatibleLogoUrl(url: string): string {
  const unwrapped = unwrapNestedHttpUrl(url);

  if (unwrapped !== url) {
    return unwrapped;
  }

  return forceTopcvJpeg(url);
}

function unwrapNestedHttpUrl(url: string): string {
  // Ví dụ: https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/a.jpg
  const match = url.match(/\/(?:unsafe|fit-in)\/.+?\/(https?:\/\/.+)$/i);

  if (!match?.[1]) {
    return url;
  }

  return match[1];
}

function forceTopcvJpeg(url: string): string {
  if (!/cdn-new\.topcv\.vn\/unsafe\//i.test(url)) {
    return url;
  }

  if (/filters:format\(/i.test(url)) {
    return url;
  }

  return url.replace(
    /cdn-new\.topcv\.vn\/unsafe\/([^/]+)\//i,
    'cdn-new.topcv.vn/unsafe/$1/filters:format(jpeg)/',
  );
}
