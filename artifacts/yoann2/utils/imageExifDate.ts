import * as FileSystem from 'expo-file-system/legacy';

type ExifDateFields = {
  DateTimeOriginal?: string;
  OffsetTimeOriginal?: string;
  DateTime?: string;
  OffsetTime?: string;
};

const MAX_EXIF_ITEM_BYTES = 512 * 1024;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(value: string): Uint8Array {
  const output = new Uint8Array(Math.floor(value.length * 3 / 4));
  let accumulator = 0;
  let bits = 0;
  let length = 0;
  for (const char of value) {
    if (char === '=') break;
    const digit = BASE64.indexOf(char);
    if (digit < 0) continue;
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[length++] = (accumulator >> bits) & 0xff;
    }
  }
  return output.subarray(0, length);
}

async function readRange(uri: string, position: number, length: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(length) || length <= 0) {
    return new Uint8Array();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  });
  return decodeBase64(base64);
}

function text(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || length < 0 || start + length > bytes.length) return '';
  let result = '';
  for (let i = start; i < start + length; i++) result += String.fromCharCode(bytes[i]!);
  return result;
}

function tiffDateFields(bytes: Uint8Array): ExifDateFields | undefined {
  if (bytes.length < 8) return undefined;
  const order = text(bytes, 0, 2);
  if (order !== 'II' && order !== 'MM') return undefined;
  const littleEndian = order === 'II';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const canRead = (offset: number, size: number) => offset >= 0 && offset + size <= bytes.length;
  const u16 = (offset: number) => canRead(offset, 2) ? view.getUint16(offset, littleEndian) : undefined;
  const u32 = (offset: number) => canRead(offset, 4) ? view.getUint32(offset, littleEndian) : undefined;
  if (u16(2) !== 42) return undefined;

  const readIfd = (offset: number) => {
    const count = u16(offset);
    if (count === undefined || count > 2048 || !canRead(offset + 2, count * 12 + 4)) return undefined;
    const fields = new Map<number, string | number>();
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const itemCount = u32(entry + 4);
      if (tag === undefined || type === undefined || itemCount === undefined) continue;
      if (tag === 0x8769 && type === 4 && itemCount === 1) {
        const pointer = u32(entry + 8);
        if (pointer !== undefined) fields.set(tag, pointer);
      } else if (type === 2 && itemCount > 0 && itemCount <= 512) {
        const valueOffset = itemCount <= 4 ? entry + 8 : u32(entry + 8);
        if (valueOffset === undefined || !canRead(valueOffset, itemCount)) continue;
        fields.set(tag, text(bytes, valueOffset, itemCount).replace(/\0+$/, '').trim());
      }
    }
    return fields;
  };

  const rootOffset = u32(4);
  if (rootOffset === undefined) return undefined;
  const root = readIfd(rootOffset);
  if (!root) return undefined;
  const exifOffset = root.get(0x8769);
  const exif = typeof exifOffset === 'number' ? readIfd(exifOffset) : undefined;
  const result: ExifDateFields = {
    DateTime: typeof root.get(0x0132) === 'string' ? root.get(0x0132) as string : undefined,
    DateTimeOriginal: typeof exif?.get(0x9003) === 'string' ? exif.get(0x9003) as string : undefined,
    OffsetTimeOriginal: typeof exif?.get(0x9011) === 'string' ? exif.get(0x9011) as string : undefined,
    OffsetTime: typeof exif?.get(0x9010) === 'string'
      ? exif.get(0x9010) as string
      : typeof root.get(0x9010) === 'string' ? root.get(0x9010) as string : undefined,
  };
  return result.DateTimeOriginal || result.DateTime ? result : undefined;
}

async function readJpegExif(uri: string): Promise<ExifDateFields | undefined> {
  const soi = await readRange(uri, 0, 2);
  if (soi[0] !== 0xff || soi[1] !== 0xd8) return undefined;
  let position = 2;
  for (let segments = 0; segments < 128; segments++) {
    const header = await readRange(uri, position, 4);
    let markerOffset = 0;
    while (header[markerOffset] === 0xff) markerOffset++;
    if (markerOffset === 0 || markerOffset + 2 >= header.length) return undefined;
    const marker = header[markerOffset]!;
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      position += markerOffset + 1;
      continue;
    }
    const segmentLength = (header[markerOffset + 1]! << 8) | header[markerOffset + 2]!;
    if (segmentLength < 2) return undefined;
    const payloadPosition = position + markerOffset + 3;
    const payloadLength = segmentLength - 2;
    if (marker === 0xe1 && payloadLength >= 8) {
      const payload = await readRange(uri, payloadPosition, payloadLength);
      if (text(payload, 0, 6) === 'Exif\0\0') {
        return tiffDateFields(payload.subarray(6));
      }
    }
    position += markerOffset + 1 + segmentLength;
  }
  return undefined;
}

type Box = { type: string; start: number; dataStart: number; end: number };

async function readBox(uri: string, start: number, parentEnd: number): Promise<Box | undefined> {
  const header = await readRange(uri, start, 16);
  if (header.length < 8) return undefined;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  let size = view.getUint32(0, false);
  let headerSize = 8;
  if (size === 1) {
    if (header.length < 16) return undefined;
    const high = view.getUint32(8, false);
    const low = view.getUint32(12, false);
    size = high * 0x1_0000_0000 + low;
    headerSize = 16;
  } else if (size === 0) {
    size = parentEnd - start;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || start + size > parentEnd) return undefined;
  return {
    type: text(header, 4, 4),
    start,
    dataStart: start + headerSize,
    end: start + size,
  };
}

function readBoxInBuffer(bytes: Uint8Array, start: number, end: number): Box | undefined {
  if (start + 8 > end) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(start, false);
  let headerSize = 8;
  if (size === 1) {
    if (start + 16 > end) return undefined;
    size = view.getUint32(start + 8, false) * 0x1_0000_0000 + view.getUint32(start + 12, false);
    headerSize = 16;
  } else if (size === 0) {
    size = end - start;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || start + size > end) return undefined;
  return { type: text(bytes, start + 4, 4), start, dataStart: start + headerSize, end: start + size };
}

function exifItemId(iinf: Uint8Array, box: Box): number | undefined {
  const view = new DataView(iinf.buffer, iinf.byteOffset, iinf.byteLength);
  if (box.dataStart + 6 > box.end) return undefined;
  const version = iinf[box.dataStart]!;
  let cursor = box.dataStart + 4;
  const entryCount = version === 0
    ? (cursor + 2 <= box.end ? view.getUint16(cursor, false) : undefined)
    : (cursor + 4 <= box.end ? view.getUint32(cursor, false) : undefined);
  if (entryCount === undefined) return undefined;
  cursor += version === 0 ? 2 : 4;
  for (let i = 0; i < Math.min(entryCount, 2048); i++) {
    const entry = readBoxInBuffer(iinf, cursor, box.end);
    if (!entry) break;
    if (entry.type === 'infe' && entry.dataStart + 12 <= entry.end) {
      const entryVersion = iinf[entry.dataStart]!;
      const idOffset = entry.dataStart + 4;
      if (entryVersion >= 2) {
        const idBytes = entryVersion >= 3 ? 4 : 2;
        const typeOffset = idOffset + idBytes + 2;
        if (typeOffset + 4 <= entry.end && text(iinf, typeOffset, 4) === 'Exif') {
          return idBytes === 4 ? view.getUint32(idOffset, false) : view.getUint16(idOffset, false);
        }
      }
    }
    cursor = entry.end;
  }
  return undefined;
}

type Extent = { method: number; baseOffset: number; offset: number; length: number };

function exifItemExtents(iloc: Uint8Array, box: Box, targetId: number): Extent[] | undefined {
  const view = new DataView(iloc.buffer, iloc.byteOffset, iloc.byteLength);
  if (box.dataStart + 8 > box.end) return undefined;
  const version = iloc[box.dataStart]!;
  let cursor = box.dataStart + 4;
  const offsetAndLength = iloc[cursor++]!;
  const baseAndIndex = iloc[cursor++]!;
  const offsetSize = offsetAndLength >> 4;
  const lengthSize = offsetAndLength & 0x0f;
  const baseOffsetSize = baseAndIndex >> 4;
  const indexSize = version >= 1 ? baseAndIndex & 0x0f : 0;
  const readSized = (size: number): number | undefined => {
    if (size > 8 || cursor + size > box.end) return undefined;
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + iloc[cursor++]!;
    return Number.isSafeInteger(value) ? value : undefined;
  };
  const itemCountSize = version < 2 ? 2 : 4;
  if (cursor + itemCountSize > box.end) return undefined;
  const itemCount = itemCountSize === 2 ? view.getUint16(cursor, false) : view.getUint32(cursor, false);
  cursor += itemCountSize;
  for (let item = 0; item < Math.min(itemCount, 2048); item++) {
    const itemIdSize = version < 2 ? 2 : 4;
    if (cursor + itemIdSize > box.end) return undefined;
    const itemId = itemIdSize === 2 ? view.getUint16(cursor, false) : view.getUint32(cursor, false);
    cursor += itemIdSize;
    let method = 0;
    if (version === 1 || version === 2) {
      if (cursor + 2 > box.end) return undefined;
      method = view.getUint16(cursor, false) & 0x0f;
      cursor += 2;
    }
    if (cursor + 2 > box.end) return undefined;
    const dataReference = view.getUint16(cursor, false);
    cursor += 2;
    const baseOffset = readSized(baseOffsetSize);
    if (baseOffset === undefined || cursor + 2 > box.end) return undefined;
    const extentCount = view.getUint16(cursor, false);
    cursor += 2;
    const extents: Extent[] = [];
    for (let extent = 0; extent < Math.min(extentCount, 256); extent++) {
      if (indexSize && readSized(indexSize) === undefined) return undefined;
      const offset = readSized(offsetSize);
      const length = readSized(lengthSize);
      if (offset === undefined || length === undefined) return undefined;
      if (itemId === targetId && dataReference === 0) extents.push({ method, baseOffset, offset, length });
    }
    if (itemId === targetId && extents.length) return extents;
  }
  return undefined;
}

function tiffFromHeifExifItem(item: Uint8Array): ExifDateFields | undefined {
  if (item.length < 12) return undefined;
  const view = new DataView(item.buffer, item.byteOffset, item.byteLength);
  const offset = view.getUint32(0, false);
  const candidates = [4 + offset, offset, 10];
  for (const candidate of candidates) {
    if (text(item, candidate, 6) === 'Exif\0\0') {
      const fields = tiffDateFields(item.subarray(candidate + 6));
      if (fields) return fields;
    }
    const fields = tiffDateFields(item.subarray(candidate));
    if (fields) return fields;
  }
  return undefined;
}

async function readHeifExif(uri: string, fileSize: number): Promise<ExifDateFields | undefined> {
  let position = 0;
  let meta: Box | undefined;
  for (let boxes = 0; boxes < 256 && position + 8 <= fileSize; boxes++) {
    const box = await readBox(uri, position, fileSize);
    if (!box) return undefined;
    if (box.type === 'meta') {
      meta = box;
      break;
    }
    position = box.end;
  }
  if (!meta) return undefined;

  let iinf: Box | undefined;
  let iloc: Box | undefined;
  let idatStart: number | undefined;
  let childPosition = meta.dataStart + 4; // FullBox version and flags.
  for (let boxes = 0; boxes < 256 && childPosition + 8 <= meta.end; boxes++) {
    const box = await readBox(uri, childPosition, meta.end);
    if (!box) return undefined;
    if (box.type === 'iinf') iinf = box;
    else if (box.type === 'iloc') iloc = box;
    else if (box.type === 'idat') idatStart = box.dataStart;
    childPosition = box.end;
  }
  if (!iinf || !iloc || iinf.end - iinf.start > 1024 * 1024 || iloc.end - iloc.start > 1024 * 1024) {
    return undefined;
  }

  const iinfBytes = await readRange(uri, iinf.start, iinf.end - iinf.start);
  const ilocBytes = await readRange(uri, iloc.start, iloc.end - iloc.start);
  const itemId = exifItemId(iinfBytes, { ...iinf, start: 0, dataStart: iinf.dataStart - iinf.start, end: iinf.end - iinf.start });
  if (itemId === undefined) return undefined;
  const extents = exifItemExtents(ilocBytes, { ...iloc, start: 0, dataStart: iloc.dataStart - iloc.start, end: iloc.end - iloc.start }, itemId);
  if (!extents) return undefined;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const extent of extents) {
    const start = extent.method === 1
      ? (idatStart ?? -1) + extent.baseOffset + extent.offset
      : extent.baseOffset + extent.offset;
    if (start < 0 || !Number.isSafeInteger(start) || extent.length <= 0) continue;
    const length = Math.min(extent.length, MAX_EXIF_ITEM_BYTES - total);
    if (length <= 0) break;
    const chunk = await readRange(uri, start, length);
    if (!chunk.length) continue;
    chunks.push(chunk);
    total += chunk.length;
    if (total >= MAX_EXIF_ITEM_BYTES) break;
  }
  if (!total) return undefined;
  const item = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    item.set(chunk, cursor);
    cursor += chunk.length;
  }
  return tiffFromHeifExifItem(item);
}

/**
 * Reads only JPEG APP1 or HEIF Exif metadata ranges; image pixels and media-data
 * boxes are skipped. HEIF Exif item reads are bounded to 512 KiB.
 */
export async function readImageExifDateFields(uri: string): Promise<ExifDateFields | undefined> {
  let fileSize: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number') fileSize = info.size;
  } catch { /* JPEG segment reads do not depend on a size query. */ }
  const header = await readRange(uri, 0, 12);
  if (header[0] === 0xff && header[1] === 0xd8) return readJpegExif(uri);
  if (text(header, 4, 4) === 'ftyp' && fileSize !== undefined) return readHeifExif(uri, fileSize);
  return undefined;
}
