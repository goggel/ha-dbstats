import { Controller, Get, Query } from '@nestjs/common';
import { StatisticService } from './statistic.service';

@Controller('statistic')
export class StatisticController {
  constructor(private readonly statService: StatisticService) {}

  @Get('short/count')
  async countStatShort() {
    return this.statService.countStatsShort();
  }

  @Get('short/overview')
  getShortOverview(@Query('window') window = 'day') {
    return this.statService.getShortOverview(window);
  }

  @Get('short/days')
  getShortDays(@Query('metadataId') id: string) {
    return this.statService.getShortDays(Number(id));
  }

  @Get('long/count')
  async countStatLong() {
    return this.statService.countStatsLong();
  }
}
