import { Controller, Get } from '@nestjs/common';
import { StateService } from './state.service';

@Controller('state')
export class StateController {
  constructor(private readonly stateService: StateService) {}

  @Get('countStates')
  async countEventTypes() {
    return this.stateService.countStateTypes();
  }

  @Get('countRecentAttributesSize')
  async countRecentAttributesSize() {
    return this.stateService.countRecentAttributesSize();
  }

  @Get('countAttributesSize')
  async countAttributesSize() {
    return this.stateService.countAttributesSize();
  }
}
