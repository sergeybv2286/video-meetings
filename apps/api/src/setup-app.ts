import { ValidationPipe, type INestApplication } from '@nestjs/common';

export function setupApp(app: INestApplication): void {
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
}
