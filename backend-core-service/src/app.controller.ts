import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  async getReadiness() {
    const readiness = await this.appService.getReadiness();
    if (!readiness.ready) throw new ServiceUnavailableException(readiness);
    return readiness;
  }

  @Get('metrics')
  getMetrics() {
    return this.appService.getMetrics();
  }
}
