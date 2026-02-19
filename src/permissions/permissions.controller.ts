import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
  ) {}

  ////////////////////////////////////////////////////////////
  // GET ALL PERMISSIONS
  ////////////////////////////////////////////////////////////

  @Permissions('settings.view')
  @Get()
  getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  ////////////////////////////////////////////////////////////
  // GET ROLE PERMISSIONS
  ////////////////////////////////////////////////////////////

  @Permissions('settings.view')
  @Get('role/:roleName')
  getRolePermissions(@Param('roleName') roleName: string) {
    return this.permissionsService.getRolePermissions(roleName);
  }

  ////////////////////////////////////////////////////////////
  // UPDATE ROLE PERMISSIONS (REPLACE MATRIX)
  ////////////////////////////////////////////////////////////

  @Permissions('settings.update')
  @Put('role/:roleName')
  updateRolePermissions(
    @Param('roleName') roleName: string,
    @Body() body: { permissionCodes: string[] },
  ) {
    return this.permissionsService.updateRolePermissions(
      roleName,
      body.permissionCodes,
    );
  }
}
