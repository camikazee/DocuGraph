import { Controller, Get, Param } from '@nestjs/common';
import { DocumentsService } from './documents.service';

/**
 * Publiczny, NIEuwierzytelniony odczyt dokumentu po tokenie udostępnienia.
 * Bez prefiksu workspace i bez ujawniania id — tylko wyrenderowana treść.
 * Globalny ThrottlerGuard ogranicza tempo (ochrona przed skanowaniem tokenów).
 */
@Controller('public/docs')
export class PublicDocsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.documentsService.resolveShare(token);
  }
}
