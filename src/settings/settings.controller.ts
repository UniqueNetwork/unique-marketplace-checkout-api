import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SettingsService } from './settings.service';
import { SettingsDto } from './dto';
import { AllowedListService } from './allowedlist.service';
import * as fs from 'fs';
import { ResponseAdminForbiddenDto, ResponseAdminUnauthorizedDto } from '../admin/dto';
import { SignatureGuard } from './guards/signature.guard';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService, private readonly allowedList: AllowedListService) {}

  @Get('/')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ type: SettingsDto, status: HttpStatus.OK })
  async getSettings(): Promise<SettingsDto> {
    return this.settingsService.getSettings();
  }

  @Post('/allowed_list/:address')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Unauthorized address or bad signature',
    type: ResponseAdminUnauthorizedDto,
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Marketplace disabled management for administrators.',
    type: ResponseAdminForbiddenDto,
  })
  @ApiOperation({
    summary: 'Addresses allowed to contract',
    description: fs.readFileSync('docs/settings_allowedlist.md').toString(),
  })
  @UseGuards(SignatureGuard)
  async setAllowedList(@Param('address') address: string): Promise<SettingsDto> {
    return this.allowedList.setAllowedList(address);
  }

  @Get('/check/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check configuration market',
    description: fs.readFileSync('docs/settings_ckeckconfig.md').toString(),
  })
  async checkConfig(): Promise<any> {
    return this.settingsService.checkConfig();
  }

  @Get('/check/address/:address')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check configuration market',
    description: fs.readFileSync('docs/settings_ckeckconfig.md').toString(),
  })
  @ApiParam({ name: 'address', description: 'Address to check', example: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw' })
  async checkAddress(@Param('address') address: string): Promise<any> {
    return this.settingsService.checkSubtrateAddress(address);
  }
}
