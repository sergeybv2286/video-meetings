import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function setupApp(app: INestApplication): void {
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
