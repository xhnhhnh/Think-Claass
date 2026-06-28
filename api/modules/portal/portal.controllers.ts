import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { throwPortalError } from './portal.errors.js';
import { PortalService } from './portal.service.js';

function returnLegacy(result: { status: number; body: Record<string, any> }) {
  if (result.status >= 400) throw new HttpException(result.body, result.status);
  return result.body;
}

@Controller('api/website')
export class WebsiteController {
  constructor(@Inject(PortalService) private readonly portalService: PortalService) {}

  @Get('home')
  getHome() {
    try {
      return { success: true, data: this.portalService.getHome() };
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Put('home')
  @HttpCode(HttpStatus.OK)
  updateHome(@Body() body: unknown) {
    try {
      return returnLegacy(this.portalService.updateHome(body));
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Get('articles')
  listArticles(@Query() query: Record<string, any>) {
    try {
      return { success: true, ...this.portalService.listArticles(query) };
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    try {
      return returnLegacy(this.portalService.getArticle(id));
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Post('articles')
  @HttpCode(HttpStatus.OK)
  createArticle(@Body() body: Record<string, any>) {
    try {
      return returnLegacy(this.portalService.createArticle(body));
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Put('articles/:id')
  @HttpCode(HttpStatus.OK)
  updateArticle(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return returnLegacy(this.portalService.updateArticle(id, body));
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.OK)
  deleteArticle(@Param('id') id: string) {
    try {
      return returnLegacy(this.portalService.deleteArticle(id));
    } catch (error) {
      throwPortalError(error);
    }
  }

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  createContact(@Body() body: Record<string, any>) {
    try {
      return returnLegacy(this.portalService.createContact(body));
    } catch (error) {
      throwPortalError(error);
    }
  }
}
