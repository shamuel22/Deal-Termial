import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { DbHandle } from '@deal/db';
import {
  listMemberships,
  login,
  loginInput,
  logout,
  registerInput,
  registerOwner,
  type LoginInput,
  type RegisterInput,
} from '@deal/core';
import type { AppConfig } from '@deal/shared';
import { APP_CONFIG } from '../config.module.js';
import { DB } from '../database.module.js';
import { ApiZodBody, ZodPipe } from '../http/zod.js';
import { Auth, CurrentSession, SESSION_COOKIE } from './auth.guard.js';

@ApiTags('portal: cuenta')
@Controller()
export class AuthController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        this.config.PUBLIC_BASE_URL.startsWith('https://') && this.config.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
  }

  @Post('auth/register')
  @ApiOperation({ summary: 'Alta de empresa y de su usuario dueño; inicia sesión' })
  @ApiZodBody(registerInput)
  async register(
    @Body(new ZodPipe(registerInput)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, orgId } = await registerOwner(this.handle.db, body);
    const session = await login(this.handle.db, { email: body.email, password: body.password });
    this.setSessionCookie(res, session.token, session.expiresAt);
    return { userId, orgId };
  }

  @Post('auth/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicio de sesión del portal (cookie httpOnly)' })
  @ApiZodBody(loginInput)
  async login(
    @Body(new ZodPipe(loginInput)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await login(this.handle.db, body);
    this.setSessionCookie(res, session.token, session.expiresAt);
    return { userId: session.userId, expiresAt: session.expiresAt };
  }

  @Post('auth/logout')
  @HttpCode(204)
  @Auth('session')
  @ApiCookieAuth()
  async logout(
    @CurrentSession() session: { token: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await logout(this.handle.db, session.token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @Auth('session')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Usuario de la sesión y organizaciones a las que pertenece' })
  async me(@CurrentSession() session: { userId: string; email: string; name: string }) {
    return {
      user: { id: session.userId, email: session.email, name: session.name },
      memberships: await listMemberships(this.handle.db, session.userId),
    };
  }
}
