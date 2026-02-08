import { Readable } from "node:stream";

/**
 * Encode string lines into Docker's multiplexed log format.
 * Header: [streamType (1 byte), 0, 0, 0, size (4 bytes BE)] + payload.
 * streamType: 1 = stdout, 2 = stderr
 */
export function createMockLogStream(lines: string[]): Readable {
  const chunks: Buffer[] = [];

  for (const line of lines) {
    const payload = Buffer.from(line, "utf8");
    const header = Buffer.alloc(8);
    header[0] = 1; // stdout
    header.writeUInt32BE(payload.length, 4);
    chunks.push(Buffer.concat([header, payload]));
  }

  return Readable.from(chunks);
}
