const STRICT_PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const HEX_BODY_PATTERN = /^[a-fA-F0-9]{64}$/;

export function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return `0x${trimmed.slice(2)}`;
  }

  if (HEX_BODY_PATTERN.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return trimmed;
}

export function isValidPrivateKey(value: string): boolean {
  return STRICT_PRIVATE_KEY_PATTERN.test(value.trim());
}

export function maskPrivateKey(value: string): string {
  const normalized = normalizePrivateKey(value);
  if (!isValidPrivateKey(normalized)) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}
