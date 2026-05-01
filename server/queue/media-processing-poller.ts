import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

export class MediaProcessingPoller {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private prisma: PrismaClient,
    private storage: any // Replace with actual IS3Storage type if available
  ) {}

  start(intervalMs = 5000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find a pending media item using SKIP LOCKED for safe concurrency
      const items = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM "PostMedia"
        WHERE status = 'pending'
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      if (items.length === 0) {
        this.isProcessing = false;
        return;
      }

      const media = items[0];
      await this.prisma.postMedia.update({
        where: { id: media.id },
        data: { status: 'processing' }
      });

      await this.processMedia(media);

    } catch (e) {
      console.error('[MediaProcessingPoller] Error polling:', e);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processMedia(media: any) {
    try {
      if (media.type === 'image') {
        const sourceBuffer = await this.storage.read(media.sourceUrl);
        
        let sharpInstance = sharp(sourceBuffer);
        const metadata = await sharpInstance.metadata();

        // 3.2 Image Optimization Pipeline
        if (metadata.width && metadata.width > 4096) {
          sharpInstance = sharpInstance.resize({ width: 4096, withoutEnlargement: true });
        }
        
        const processedBuffer = await sharpInstance
          .jpeg({ quality: 85 })
          .toBuffer();

        // 3.3 Thumbnail Generation
        const thumbBuffer = await sharp(sourceBuffer)
          .resize({ width: 200 })
          .jpeg({ quality: 60 })
          .toBuffer();

        const post = await this.prisma.post.findUnique({ where: { id: media.postId } });
        if (!post) throw new Error('Post not found');

        const processedUrl = `campaigns/${post.campaignId}/media/${media.id}.jpg`;
        const thumbnailUrl = `campaigns/${post.campaignId}/media/${media.id}_thumb.jpg`;

        await this.storage.save(processedUrl, processedBuffer, 'image/jpeg');
        await this.storage.save(thumbnailUrl, thumbBuffer, 'image/jpeg');

        await this.prisma.postMedia.update({
          where: { id: media.id },
          data: {
            status: 'ready',
            processedUrl,
            thumbnailUrl,
            mimeType: 'image/jpeg',
            size: processedBuffer.length,
          }
        });
      } else {
        // Video/GIF processing placeholder
        await this.prisma.postMedia.update({
          where: { id: media.id },
          data: {
            status: 'ready',
            processedUrl: media.sourceUrl, // pass-through for now
          }
        });
      }
    } catch (e: any) {
      console.error(`[MediaProcessingPoller] Error processing media ${media.id}:`, e);
      await this.prisma.postMedia.update({
        where: { id: media.id },
        data: {
          status: 'failed',
          errorMsg: e.message
        }
      });
    }
  }
}
