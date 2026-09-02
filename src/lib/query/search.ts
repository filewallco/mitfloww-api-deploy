function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function buildContainsSearchPattern(value: string) {
  return `%${escapeLikePattern(value)}%`;
}
