import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureServer } from './server-config.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  configureServer(app.getHttpServer());
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
