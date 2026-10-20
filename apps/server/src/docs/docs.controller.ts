import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DocsService } from './docs.service.js';

@ApiExcludeController()
@Controller()
export class DocsController {
  constructor(@Inject(DocsService) private readonly docs: DocsService) {}

  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  index(): Promise<string> {
    return this.docs.llmsIndex();
  }

  @Get('llms-full.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  full(): Promise<string> {
    return this.docs.llmsFull();
  }

  @Get('knowledge/:slug.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  markdown(@Param('slug') slug: string): Promise<string> {
    return this.docs.markdown(slug);
  }

  @Get('')
  @Header('Content-Type', 'text/html; charset=utf-8')
  home(): Promise<string> {
    return this.docs.html('home');
  }

  @Get('knowledge')
  @Header('Content-Type', 'text/html; charset=utf-8')
  knowledge(): Promise<string> {
    return this.docs.html('knowledge');
  }

  @Get('knowledge/:slug')
  @Header('Content-Type', 'text/html; charset=utf-8')
  article(@Param('slug') slug: string): Promise<string> {
    return this.docs.html('article', slug);
  }
}
