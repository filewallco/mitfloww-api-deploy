const textEncoder = new TextEncoder();

export type ZipEntryInput = {
  data: Uint8Array;
  filename: string;
  lastModified?: Date;
};

function getDosDateParts(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function buildCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crc32Table = buildCrc32Table();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

export function createStoredZip(entries: ZipEntryInput[]) {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBytes = textEncoder.encode(entry.filename);
    const fileDate = entry.lastModified ?? new Date();
    const { date, time } = getDosDateParts(fileDate);
    const checksum = crc32(entry.data);

    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const localView = new DataView(
      localHeader.buffer,
      localHeader.byteOffset,
      localHeader.byteLength,
    );

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, time);
    writeUint16(localView, 12, date);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, entry.data.length);
    writeUint32(localView, 22, entry.data.length);
    writeUint16(localView, 26, filenameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(filenameBytes, 30);

    localFileParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(
      centralHeader.buffer,
      centralHeader.byteOffset,
      centralHeader.byteLength,
    );

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, time);
    writeUint16(centralView, 14, date);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, entry.data.length);
    writeUint32(centralView, 24, entry.data.length);
    writeUint16(centralView, 28, filenameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(filenameBytes, 46);
    centralDirectoryParts.push(centralHeader);

    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectorySize = centralDirectoryParts.reduce(
    (total, part) => total + part.byteLength,
    0,
  );
  const endRecord = new Uint8Array(22);
  const endView = new DataView(
    endRecord.buffer,
    endRecord.byteOffset,
    endRecord.byteLength,
  );

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const totalLength =
    offset + centralDirectorySize + endRecord.byteLength;
  const zip = new Uint8Array(totalLength);
  let pointer = 0;

  for (const part of [...localFileParts, ...centralDirectoryParts, endRecord]) {
    zip.set(part, pointer);
    pointer += part.byteLength;
  }

  return zip;
}
