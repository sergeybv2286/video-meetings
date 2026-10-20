import { crc32 } from 'node:zlib';

/** Минимальные синтетические образцы с корректными сигнатурами (без бинарных файлов в git). */

const ascii = (s: string) => Buffer.from(s, 'latin1');
const pad = (b: Buffer, size = 64) =>
  Buffer.concat([b, Buffer.alloc(Math.max(0, size - b.length))]);

function ftyp(brand: string, compat: string[]): Buffer {
  const body = Buffer.concat([
    ascii(brand),
    Buffer.alloc(4),
    ...compat.map(ascii),
  ]);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write('ftyp', 4, 'latin1');
  return pad(Buffer.concat([head, body]));
}

/** zip с несжатыми записями. */
export function makeZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

/** mp4 с брендом `M4V ` (экспорт из Apple): `file-type` определяет его как video/x-m4v. */
export const mp4M4vBrand = () => ftyp('M4V ', ['M4V ', 'mp42', 'isom']);

export const samples = {
  mp4: () => ftyp('isom', ['isom', 'mp42']),
  mov: () => ftyp('qt  ', ['qt  ']),
  m4a: () => ftyp('M4A ', ['M4A ', 'mp42', 'isom']),
  mp3: () => pad(Buffer.from([0xff, 0xfb, 0x90, 0x00])),
  wav: () => {
    const b = Buffer.alloc(64);
    b.write('RIFF', 0, 'latin1');
    b.writeUInt32LE(56, 4);
    b.write('WAVEfmt ', 8, 'latin1');
    b.writeUInt32LE(16, 16);
    return b;
  },
  webm: () =>
    pad(
      Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x89, 0x42, 0x82, 0x84]),
        ascii('webm'),
      ]),
    ),
  pdf: () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n'),
  docx: () =>
    makeZip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document/>',
    }),
  pptx: () =>
    makeZip({
      '[Content_Types].xml': '<Types/>',
      'ppt/presentation.xml': '<p:presentation/>',
    }),
  txt: () => Buffer.from('Протокол встречи\nРешения приняты.'),
  vtt: () => Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nПривет\n'),
  srt: () => Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nПривет\n'),
  /** Windows-исполняемый файл, переименованный в запись встречи. */
  exe: () => pad(Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'), 256),
};

/** Минимальные образцы изображений для тестов аватара. */
export const imageSamples = {
  jpeg: () =>
    pad(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    ),
  png: () =>
    pad(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]),
        ascii('IHDR'),
      ]),
    ),
  webp: () => {
    const b = Buffer.alloc(64);
    b.write('RIFF', 0, 'latin1');
    b.writeUInt32LE(56, 4);
    b.write('WEBPVP8 ', 8, 'latin1');
    return b;
  },
};
