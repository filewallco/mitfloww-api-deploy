const DEFAULT_FILE_NAME_DISPLAY_MAX_LENGTH = 48;
const TRUNCATION_MARKER = "...";

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= TRUNCATION_MARKER.length) {
    return TRUNCATION_MARKER.slice(0, Math.max(maxLength, 0));
  }

  const visibleLength = maxLength - TRUNCATION_MARKER.length;
  const leadingLength = Math.ceil(visibleLength * 0.65);
  const trailingLength = Math.max(0, visibleLength - leadingLength);

  return `${value.slice(0, leadingLength)}${TRUNCATION_MARKER}${value.slice(-trailingLength)}`;
}

export function truncateFileNameForDisplay(
  value: string,
  maxLength = DEFAULT_FILE_NAME_DISPLAY_MAX_LENGTH,
) {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  const extensionIndex = normalizedValue.lastIndexOf(".");
  const hasVisibleExtension =
    extensionIndex > 0 && extensionIndex >= normalizedValue.length - 12;

  if (!hasVisibleExtension) {
    return truncateMiddle(normalizedValue, maxLength);
  }

  const baseName = normalizedValue.slice(0, extensionIndex);
  const extension = normalizedValue.slice(extensionIndex);
  const availableBaseLength =
    maxLength - extension.length - TRUNCATION_MARKER.length;

  if (availableBaseLength < 6) {
    return truncateMiddle(normalizedValue, maxLength);
  }

  return `${truncateMiddle(baseName, availableBaseLength)}${extension}`;
}
