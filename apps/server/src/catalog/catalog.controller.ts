import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  createProduct,
  updateProduct,
  listOwnProducts,
  getOwnProduct,
  createOffer,
  updateOffer,
  listOwnOffers,
  getOwnOffer,
  setOfferStatus,
  productInput,
  offerInput,
  updateOfferInput,
  offerStatusInput,
  type ProductInput,
  type OfferInput,
  type UpdateOfferInput,
  type OfferStatusInput,
  type UserActor,
  type AgentActor,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentAgent, CurrentUser } from '../auth/auth.guard.js';

@ApiTags('portal: catálogo')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class CatalogController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('products')
  listProducts(@CurrentUser() actor: UserActor) {
    return listOwnProducts(this.handle.db, actor);
  }

  @Post('products')
  @ApiOperation({ summary: 'Crea un producto con atributos normalizados' })
  @ApiZodBody(productInput)
  createProduct(@CurrentUser() actor: UserActor, @Body() raw: ProductInput) {
    return createProduct(this.handle.db, actor, raw);
  }

  @Get('products/:productId')
  getProduct(@CurrentUser() actor: UserActor, @Param('productId') id: string) {
    return getOwnProduct(this.handle.db, actor, id);
  }

  @Put('products/:productId')
  @ApiOperation({ summary: 'Reemplaza los datos de un producto propio' })
  @ApiZodBody(productInput)
  updateProduct(
    @CurrentUser() actor: UserActor,
    @Param('productId') id: string,
    @Body() raw: ProductInput,
  ) {
    return updateProduct(this.handle.db, actor, id, raw);
  }

  @Get('offers')
  listOffers(@CurrentUser() actor: UserActor) {
    return listOwnOffers(this.handle.db, actor);
  }

  @Post('offers')
  @ApiOperation({ summary: 'Crea una oferta con tramos y reglas privadas de negociación' })
  @ApiZodBody(offerInput)
  createOffer(@CurrentUser() actor: UserActor, @Body() raw: OfferInput) {
    return createOffer(this.handle.db, actor, raw);
  }

  @Get('offers/:offerId')
  getOffer(@CurrentUser() actor: UserActor, @Param('offerId') id: string) {
    return getOwnOffer(this.handle.db, actor, id);
  }

  @Put('offers/:offerId')
  @ApiOperation({ summary: 'Reemplaza condiciones y crea una nueva versión de la oferta' })
  @ApiZodBody(updateOfferInput)
  updateOffer(
    @CurrentUser() actor: UserActor,
    @Param('offerId') id: string,
    @Body() raw: UpdateOfferInput,
  ) {
    return updateOffer(this.handle.db, actor, id, raw);
  }

  @Put('offers/:offerId/status')
  @ApiOperation({ summary: 'Activa, pausa o archiva una oferta propia' })
  @ApiZodBody(offerStatusInput)
  setStatus(
    @CurrentUser() actor: UserActor,
    @Param('offerId') id: string,
    @Body() raw: OfferStatusInput,
  ) {
    return setOfferStatus(this.handle.db, actor, id, raw?.status);
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentCatalogController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('products')
  listProducts(@CurrentAgent() actor: AgentActor) {
    return listOwnProducts(this.handle.db, actor);
  }

  @Post('products')
  @ApiOperation({ summary: 'Crea un producto con atributos normalizados' })
  @ApiZodBody(productInput)
  createProduct(@CurrentAgent() actor: AgentActor, @Body() raw: ProductInput) {
    return createProduct(this.handle.db, actor, raw);
  }

  @Get('products/:productId')
  getProduct(@CurrentAgent() actor: AgentActor, @Param('productId') id: string) {
    return getOwnProduct(this.handle.db, actor, id);
  }

  @Put('products/:productId')
  @ApiOperation({ summary: 'Reemplaza los datos de un producto propio' })
  @ApiZodBody(productInput)
  updateProduct(
    @CurrentAgent() actor: AgentActor,
    @Param('productId') id: string,
    @Body() raw: ProductInput,
  ) {
    return updateProduct(this.handle.db, actor, id, raw);
  }

  @Get('offers')
  listOffers(@CurrentAgent() actor: AgentActor) {
    return listOwnOffers(this.handle.db, actor);
  }

  @Post('offers')
  @ApiOperation({ summary: 'Crea una oferta con tramos y reglas privadas de negociación' })
  @ApiZodBody(offerInput)
  createOffer(@CurrentAgent() actor: AgentActor, @Body() raw: OfferInput) {
    return createOffer(this.handle.db, actor, raw);
  }

  @Get('offers/:offerId')
  getOffer(@CurrentAgent() actor: AgentActor, @Param('offerId') id: string) {
    return getOwnOffer(this.handle.db, actor, id);
  }

  @Put('offers/:offerId')
  @ApiOperation({ summary: 'Reemplaza condiciones y crea una nueva versión de la oferta' })
  @ApiZodBody(updateOfferInput)
  updateOffer(
    @CurrentAgent() actor: AgentActor,
    @Param('offerId') id: string,
    @Body() raw: UpdateOfferInput,
  ) {
    return updateOffer(this.handle.db, actor, id, raw);
  }

  @Put('offers/:offerId/status')
  @ApiOperation({ summary: 'Activa, pausa o archiva una oferta propia' })
  @ApiZodBody(offerStatusInput)
  setStatus(
    @CurrentAgent() actor: AgentActor,
    @Param('offerId') id: string,
    @Body() raw: OfferStatusInput,
  ) {
    return setOfferStatus(this.handle.db, actor, id, raw?.status);
  }
}
