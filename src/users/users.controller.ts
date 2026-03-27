import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
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
import * as fs from 'fs';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  ////////////////////////////////////////////////////////////
  // UPLOAD PROFILE PHOTO
  ////////////////////////////////////////////////////////////

  @Permissions('employees.create')
  @Post('upload-photo')
  @ApiOperation({ summary: 'Upload employee profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Returns the uploaded photo URL' })
  @ApiResponse({ status: 400, description: 'Invalid file type or no file uploaded' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/profile-photos';
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `photo-${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Only JPEG, PNG, and WebP images are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  uploadProfilePhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image uploaded');
    }
    return {
      url: `/uploads/profile-photos/${file.filename}`,
    };
  }

  ////////////////////////////////////////////////////////////
  // CREATE USER
  ////////////////////////////////////////////////////////////

  @Permissions('employees.create')
  @Post()
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createUser(@Body() body: any, @Req() req: any) {
    return this.usersService.createUser(body, req.user);
  }

  ////////////////////////////////////////////////////////////
  // GET ALL USERS
  ////////////////////////////////////////////////////////////

  @Permissions('employees.view')
  @Get()
  @ApiOperation({ summary: 'Get all users (role-filtered)' })
  @ApiResponse({ status: 200, description: 'Returns list of users' })
  getAllUsers(@Req() req: any) {
    return this.usersService.getAllUsers(req.user);
  }

  ////////////////////////////////////////////////////////////
  // PROMOTE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/promote')
  @ApiOperation({ summary: 'Promote user to Team Lead' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User promoted to Team Lead' })
  promoteToTeamLead(@Param('id') id: string, @Req() req: any) {
    return this.usersService.promoteToTeamLead(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // DEMOTE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/demote')
  @ApiOperation({ summary: 'Demote Team Lead to Employee' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User demoted to Employee' })
  demoteToEmployee(@Param('id') id: string, @Req() req: any) {
    return this.usersService.demoteToEmployee(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // DEACTIVATE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  deactivateUser(@Param('id') id: string, @Req() req: any) {
    return this.usersService.deactivateUser(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // ACTIVATE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User activated' })
  activateUser(@Param('id') id: string, @Req() req: any) {
    return this.usersService.activateUser(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // UPDATE USER
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update user details' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  updateUser(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.usersService.updateUser(id, body, req.user);
  }
}
