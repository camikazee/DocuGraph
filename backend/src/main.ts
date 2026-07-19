import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ErrorLogService } from './error-log/error-log.service';
import { hydrateFileSecrets } from './config/file-secrets';

async function bootstrap() {
  // Wczytaj sekrety z plików (*_FILE → env) PRZED walidacją configu, aby móc
  // uruchamiać z sekretami montowanymi jako pliki zamiast .env na dysku.
  const loaded = hydrateFileSecrets();
  if (loaded.length) {
    new Logger('Secrets').log(`Loaded from *_FILE: ${loaded.join(', ')}`);
  }

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Nagłówki bezpieczeństwa.
  app.use(helmet());

  // Większy limit ciała żądania — duże dokumenty .md oraz avatar (data URL).
  // `verify` zachowuje surowy bufor (req.rawBody) do weryfikacji sygnatur webhooków.
  app.use(
    json({
      limit: '5mb',
      verify: (
        req: IncomingMessage & { rawBody?: Buffer },
        _res: ServerResponse,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // CORS — '*' lub lista origin po przecinku.
  const corsOrigins = config.get<string>('corsOrigins') ?? '*';
  const allowAllOrigins = corsOrigins === '*';
  if (allowAllOrigins && config.get<string>('nodeEnv') === 'production') {
    Logger.warn(
      'CORS_ORIGINS=* w produkcji — ustaw konkretną listę origin.',
      'Bootstrap',
    );
  }
  app.enableCors({
    origin: allowAllOrigins
      ? true
      : corsOrigins.split(',').map((o) => o.trim()),
    // Nie łączymy wildcardu z credentials; auth i tak jest na Bearer (nie cookie).
    credentials: !allowAllOrigins,
  });

  // Wszystkie endpointy pod /api/v1
  app.setGlobalPrefix('api/v1');

  // Walidacja wejść na podstawie DTO + class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Spójny kształt błędów + zapis 5xx do lokalnego dziennika błędów.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorLogService)));

  // Dokumentacja OpenAPI pod /api/docs — domyślnie wyłączona w produkcji
  // (włącz świadomie przez SWAGGER_ENABLED=true).
  const isProd = config.get<string>('nodeEnv') === 'production';
  const swaggerEnabled =
    config.get<string>('swaggerEnabled') === 'true' || !isProd;
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DocuGraph API')
      .setDescription('DocuGraph — developer documentation SaaS')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  Logger.log(`DocuGraph API listening on http://localhost:${port}/api/v1`);
  if (swaggerEnabled) {
    Logger.log(`API docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
