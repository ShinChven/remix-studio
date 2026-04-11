import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

// Point fluent-ffmpeg at the bundled static binaries so we don't need a system install.
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
if (ffprobeInstaller?.path) ffmpeg.setFfprobePath(ffprobeInstaller.path);

async function writeTempVideo(videoBytes: Buffer, ext = 'mp4'): Promise<string> {
  const tmp = path.join(os.tmpdir(), `remix-video-${randomUUID()}.${ext}`);
  await fs.writeFile(tmp, videoBytes);
  return tmp;
}

async function safeUnlink(file: string) {
  try {
    await fs.unlink(file);
  } catch {
    /* ignore */
  }
}

/**
 * Extract a single PNG frame at ~0.5s (or the very first frame if the video is
 * shorter than that) from the given video bytes. Returns a PNG buffer suitable
 * for feeding through the existing sharp-based thumbnail helpers.
 */
export async function extractFirstFramePng(videoBytes: Buffer): Promise<Buffer> {
  const input = await writeTempVideo(videoBytes);
  const output = path.join(os.tmpdir(), `remix-frame-${randomUUID()}.png`);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .inputOptions(['-ss', '0.5'])
        .outputOptions(['-frames:v', '1', '-f', 'image2', '-c:v', 'png'])
        .output(output)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    return await fs.readFile(output);
  } catch (err: any) {
    // Retry once from 0s in case the 0.5s seek failed (very short clip).
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(input)
          .outputOptions(['-frames:v', '1', '-f', 'image2', '-c:v', 'png'])
          .output(output)
          .on('end', () => resolve())
          .on('error', (e) => reject(e))
          .run();
      });
      return await fs.readFile(output);
    } catch (err2: any) {
      throw new Error(`ffmpeg first-frame extract failed: ${err2?.message || err?.message}`);
    }
  } finally {
    await safeUnlink(input);
    await safeUnlink(output);
  }
}

export interface VideoProbeResult {
  durationSeconds?: number;
  width?: number;
  height?: number;
}

/**
 * Probe video metadata (duration, dimensions) using ffprobe.
 */
export async function probeVideo(videoBytes: Buffer): Promise<VideoProbeResult> {
  const input = await writeTempVideo(videoBytes);
  try {
    const data: any = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(input, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });

    const videoStream = (data.streams || []).find((s: any) => s.codec_type === 'video');
    const durationSeconds =
      typeof data.format?.duration === 'number'
        ? data.format.duration
        : data.format?.duration
          ? Number(data.format.duration)
          : undefined;

    return {
      durationSeconds:
        typeof durationSeconds === 'number' && !Number.isNaN(durationSeconds)
          ? Math.round(durationSeconds)
          : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
    };
  } catch {
    return {};
  } finally {
    await safeUnlink(input);
  }
}
