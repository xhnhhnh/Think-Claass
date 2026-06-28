import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { throwMarketplaceError } from './marketplace.errors.js';
import { MarketplaceService } from './marketplace.service.js';

@Controller('api/shop')
export class MarketplaceController {
  constructor(@Inject(MarketplaceService) private readonly marketplaceService: MarketplaceService) {}

  @Get('items')
  listItems(@Req() req: Request, @Query() query: Record<string, any>) {
    try {
      return { success: true, items: this.marketplaceService.listItems(req, query) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Get('all')
  listAllItems(@Query() query: Record<string, any>) {
    try {
      return { success: true, items: this.marketplaceService.listAllItems(query) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createItem(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.createItem(body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Put(':id/status')
  updateItemStatus(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.marketplaceService.updateItemStatus(id, body);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Put(':id')
  updateItem(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.marketplaceService.updateItem(id, body);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post('buy')
  @HttpCode(HttpStatus.OK)
  buyItem(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.buyItem(body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Get('auctions')
  listAuctions(@Req() req: Request) {
    try {
      return { success: true, auctions: this.marketplaceService.listAuctions(req) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post('auctions/:id/bid')
  @HttpCode(HttpStatus.OK)
  bidAuction(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.bidAuction(id, body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post('blind_box')
  @HttpCode(HttpStatus.OK)
  buyBlindBox(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.buyBlindBox(body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post('auctions')
  @HttpCode(HttpStatus.OK)
  createAuction(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.createAuction(body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Put('auctions/:id')
  updateAuction(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.marketplaceService.updateAuction(id, body);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Delete('auctions/:id')
  deleteAuction(@Param('id') id: string) {
    try {
      this.marketplaceService.deleteAuction(id);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Get('blind_boxes')
  listBlindBoxes(@Req() req: Request) {
    try {
      return { success: true, boxes: this.marketplaceService.listBlindBoxes(req) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Post('blind_boxes')
  @HttpCode(HttpStatus.OK)
  createBlindBox(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.marketplaceService.createBlindBox(body) };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Put('blind_boxes/:id')
  updateBlindBox(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.marketplaceService.updateBlindBox(id, body);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }

  @Delete('blind_boxes/:id')
  deleteBlindBox(@Param('id') id: string) {
    try {
      this.marketplaceService.deleteBlindBox(id);
      return { success: true };
    } catch (error) {
      throwMarketplaceError(error);
    }
  }
}
