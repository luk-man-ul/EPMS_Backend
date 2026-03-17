import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  Request,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(private filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string', enum: ['task', 'ticket', 'project', 'chat'] },
        entityId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new BadRequestException(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
        }
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(new BadRequestException(`MIME type not allowed: ${file.mimetype}`), false);
        }
        cb(null, true);
      },
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadFileDto: UploadFileDto,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    this.logger.log(`File upload request: ${file.originalname} (${file.size} bytes) for ${uploadFileDto.entityType}:${uploadFileDto.entityId}`);
    return this.filesService.uploadFile(file, uploadFileDto.entityType, uploadFileDto.entityId, req.user.userId);
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Get files attached to an entity' })
  @ApiParam({ name: 'entityType', description: 'Entity type (task, ticket, project, chat)' })
  @ApiParam({ name: 'entityId', description: 'Entity UUID' })
  @ApiResponse({ status: 200, description: 'Returns list of file attachments' })
  async getFilesByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.filesService.getFilesByEntity(entityType, entityId);
  }

  @Get('file/:id')
  @ApiOperation({ summary: 'Get a single file by ID' })
  @ApiParam({ name: 'id', description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'Returns file metadata' })
  async getFileById(@Param('id') id: string) {
    return this.filesService.getFileById(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiParam({ name: 'id', description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  async deleteFile(@Param('id') id: string, @Request() req) {
    return this.filesService.deleteFile(id, req.user.userId);
  }
}
