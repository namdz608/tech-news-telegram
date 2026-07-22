export interface DigestTranslator {
  translateDigest(digest: string): Promise<string>;
}
