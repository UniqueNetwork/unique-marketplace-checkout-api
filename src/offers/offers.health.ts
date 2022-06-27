import { PrometheusService } from '../utils/prometheus/prometheus.service';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { OffersService } from './offers.service';
import { BaseHealthIndicator, HealthIndicator } from '../utils/health';

export class OffersHealthIndicator extends BaseHealthIndicator implements HealthIndicator {
  public readonly name = 'OffersHealthIndicator';
  protected readonly help = 'Status of ' + this.name;

  constructor(private service: OffersService, protected promClientService: PrometheusService) {
    super();
    this.registerMetrics();
    this.registerGauges();
  }

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const isHealthy = this.service.isConnected;
    this.updatePrometheusData(isHealthy);
    return this.getStatus(this.name, isHealthy);
  }
}
