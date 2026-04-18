const WAV_HEADER_BYTES = 44;

export function isWavBuffer(buffer: Buffer): boolean {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
}

export function pcm16leToWav(
  pcm: Buffer,
  options: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}
): Buffer {
  const sampleRate = options.sampleRate ?? 24000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;

  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export function ensureWavBuffer(
  buffer: Buffer,
  options: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}
): Buffer {
  return isWavBuffer(buffer) ? buffer : pcm16leToWav(buffer, options);
}
