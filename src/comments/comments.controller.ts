import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

class CreateCommentDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  content: string;
}

class UpdateCommentDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  content: string;
}

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Get comments for an entity' })
  @ApiParam({ name: 'entityType', example: 'ticket' })
  @ApiParam({ name: 'entityId', example: 'uuid' })
  getComments(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.commentsService.getComments(entityType, entityId);
  }

  @Post(':entityType/:entityId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment to an entity' })
  createComment(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() dto: CreateCommentDto,
    @Req() req,
  ) {
    return this.commentsService.createComment(entityType, entityId, req.user.id, dto.content);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a comment (author only)' })
  updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @Req() req,
  ) {
    return this.commentsService.updateComment(id, req.user.id, dto.content);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  deleteComment(@Param('id') id: string, @Req() req) {
    return this.commentsService.deleteComment(id, req.user.id, req.user.role);
  }
}
