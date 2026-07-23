/**
 * Abstraction cho dịch digest, giúp TranslationService không phụ thuộc provider.
 *
 * Được GoogleTranslationService implement; `translation.service.ts` và
 * các translation tests dùng interface này để inject fake translator.
 */
export interface DigestTranslator {
  /** Nhận digest nguồn và resolve chuỗi đã dịch hoặc throw để caller fallback. */
  translateDigest(digest: string): Promise<string>;
}
