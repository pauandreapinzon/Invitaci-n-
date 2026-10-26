import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { DeterministicAiProvider } from './providers/deterministic.provider';

@Module({
  providers: [AiService, DeterministicAiProvider],
  exports: [AiService, DeterministicAiProvider],
})
export class AiModule {}
