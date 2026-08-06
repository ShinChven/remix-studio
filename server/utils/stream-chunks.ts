import type { Readable } from 'node:stream';

function bufferFromChunk(chunk: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  return typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
}

function takeBufferedBytes(buffers: Buffer[], bytesToTake: number): Buffer {
  const chunk = Buffer.allocUnsafe(bytesToTake);
  let written = 0;

  while (written < bytesToTake) {
    const head = buffers[0];
    if (!head) throw new Error('Buffered stream ended unexpectedly');

    const bytes = Math.min(head.length, bytesToTake - written);
    head.copy(chunk, written, 0, bytes);
    written += bytes;

    if (bytes === head.length) {
      buffers.shift();
    } else {
      buffers[0] = head.subarray(bytes);
    }
  }

  return chunk;
}

/** Re-chunk a readable into fixed-size buffers (the tail chunk may be shorter). */
export async function* chunkReadable(readable: Readable, chunkSize: number): AsyncGenerator<Buffer> {
  const buffers: Buffer[] = [];
  let bufferedBytes = 0;

  for await (const rawChunk of readable) {
    const chunk = bufferFromChunk(rawChunk as Buffer | Uint8Array | string);
    buffers.push(chunk);
    bufferedBytes += chunk.length;

    while (bufferedBytes >= chunkSize) {
      yield takeBufferedBytes(buffers, chunkSize);
      bufferedBytes -= chunkSize;
    }
  }

  if (bufferedBytes > 0) {
    yield takeBufferedBytes(buffers, bufferedBytes);
  }
}

/**
 * IMPORTANT: convert Buffer → Uint8Array before handing a body to fetch. Passing a
 * Buffer directly to undici-based fetch can serialize wrong (empty body, wrong
 * length) and the remote end will happily accept a zero-byte upload.
 */
export function toFetchBody(chunk: Buffer): Uint8Array {
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}
