import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir = 'uploads';

  constructor(private prisma: PrismaService) {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    uploadedById: string,
  ) {
    const fileUrl = `/uploads/${file.filename}`;

    const attachment = await this.prisma.fileAttachment.create({
      data: {
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        fileSize: file.size,
        entityType,
        entityId,
        uploadedById,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(
      `File uploaded: ${file.originalname} for ${entityType}:${entityId} by user ${uploadedById}`,
    );

    return attachment;
  }

  async getFilesByEntity(entityType: string, entityId: string) {
    const files = await this.prisma.fileAttachment.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return files;
  }

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.fileAttachment.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Only allow file owner to delete
    if (file.uploadedById !== userId) {
      throw new NotFoundException('You can only delete your own files');
    }

    // Delete physical file
    const filePath = path.join(process.cwd(), file.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`Deleted physical file: ${filePath}`);
    }

    // Delete database record
    await this.prisma.fileAttachment.delete({
      where: { id: fileId },
    });

    this.logger.log(`File deleted: ${file.fileName} by user ${userId}`);

    return { success: true, message: 'File deleted successfully' };
  }

  async getFileById(fileId: string) {
    const file = await this.prisma.fileAttachment.findUnique({
      where: { id: fileId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }
}
