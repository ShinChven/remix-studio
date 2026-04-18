import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

const WAV_HEADER_BYTES = 44;

// Point fluent-ffmpeg at the bundled static binaries so we don't need a system install.
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
if (ffprobeInstaller?.path) ffmpeg.setFfprobePath(ffprobeInstaller.path);

export type AudioOutputFormat = 'wav' | 'mp3' | 'aac';

async function writeTempAudio(audioBytes: Buffer, ext: string): Promise<string> {
  const tmp = path.join(os.tmpdir(), `remix-audio-${randomUUID()}.${ext}`);
  await fs.writeFile(tmp, audioBytes);
  return tmp;
}

async function safeUnlink(file: string) {
  try {
    await fs.unlink(file);
  } catch {
    /* ignore */
  }
}

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

export function resolveAudioOutput(format?: string): { format: AudioOutputFormat; ext: AudioOutputFormat; mimeType: string } {
  switch (format) {
    case 'mp3':
      return { format: 'mp3', ext: 'mp3', mimeType: 'audio/mpeg' };
    case 'aac':
      return { format: 'aac', ext: 'aac', mimeType: 'audio/aac' };
    case 'wav':
    default:
      return { format: 'wav', ext: 'wav', mimeType: 'audio/wav' };
  }
}

function extFromMimeType(mimeType?: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/aac':
      return 'aac';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
    default:
      return 'wav';
  }
}

export async function transcodeAudioBuffer(
  audioBytes: Buffer,
  targetFormat: AudioOutputFormat,
  mimeType?: string
): Promise<Buffer> {
  if (targetFormat === 'wav') {
    return ensureWavBuffer(audioBytes, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
  }

  const inputBuffer = isWavBuffer(audioBytes)
    ? audioBytes
    : ensureWavBuffer(audioBytes, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });

  const input = await writeTempAudio(inputBuffer, extFromMimeType(mimeType));
  const output = path.join(os.tmpdir(), `remix-audio-out-${randomUUID()}.${targetFormat}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(input).noVideo();

      if (targetFormat === 'mp3') {
        command
          .audioCodec('libmp3lame')
          .format('mp3')
          .outputOptions(['-b:a', '192k']);
      } else {
        command
          .audioCodec('aac')
          .format('adts')
          .outputOptions(['-b:a', '192k']);
      }

      command
        .output(output)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    return await fs.readFile(output);
  } catch (err: any) {
    throw new Error(`ffmpeg audio transcode failed: ${err?.message || err}`);
  } finally {
    await safeUnlink(input);
    await safeUnlink(output);
  }
}
