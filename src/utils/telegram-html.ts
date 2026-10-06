interface OpenTag {
  name: string;
  opening: string;
}

function closingTags(stack: readonly OpenTag[]): string {
  return [...stack].reverse().map((tag) => `</${tag.name}>`).join('');
}

/** Chia HTML mà không cắt giữa thẻ, entity hoặc một Unicode code point. */
export function splitTelegramMessage(message: string, maxLength: number): string[] {
  if (message.length <= maxLength) return [message];

  const chunks: string[] = [];
  let current = '';
  let stack: OpenTag[] = [];
  let hasText = false;
  // Nhận cả thuộc tính chứa dấu > trong chuỗi có nháy.
  const tokens = /<(?:[^>"']|"[^"]*"|'[^']*')*>|&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[\da-fA-F]+);|[\s\S]/gu;

  for (const match of message.matchAll(tokens)) {
    const token = match[0];
    const tag = /^<(\/)?([\w-]+)(?:\s[\s\S]*)?>$/u.exec(token);
    const nextStack = [...stack];
    if (tag && !token.endsWith('/>')) {
      if (tag[1]) nextStack.pop();
      else nextStack.push({ name: tag[2], opening: token });
    }
    const suffix = closingTags(nextStack);

    if (current.length + token.length + suffix.length > maxLength) {
      if (!hasText) throw new Error('Telegram HTML markup exceeds the message limit');
      chunks.push(current + closingTags(stack));
      current = stack.map((open) => open.opening).join('');
      hasText = false;
    }
    if (current.length + token.length + suffix.length > maxLength) {
      throw new Error('Telegram HTML markup exceeds the message limit');
    }

    current += token;
    stack = nextStack;
    if (!tag) hasText = true;
  }
  if (hasText) chunks.push(current + closingTags(stack));
  return chunks;
}
