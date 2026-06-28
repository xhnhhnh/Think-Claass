import { Module } from '@nestjs/common';

import { SqliteBattlesRepository } from '../battles/battles.repository.sqlite.js';
import { BattlesService } from '../battles/battles.service.js';
import { SqliteChallengeRepository } from '../challenge/challenge.repository.sqlite.js';
import { ChallengeService } from '../challenge/challenge.service.js';
import { SqliteDungeonRepository } from '../dungeon/dungeon.repository.sqlite.js';
import { DungeonService } from '../dungeon/dungeon.service.js';
import { SqliteEconomyRepository } from '../economy/economy.repository.sqlite.js';
import { EconomyService } from '../economy/economy.service.js';
import { SqliteGachaRepository } from '../gacha/gacha.repository.sqlite.js';
import { GachaService } from '../gacha/gacha.service.js';
import { SqliteSlgRepository } from '../slg/slg.repository.sqlite.js';
import { SlgService } from '../slg/slg.service.js';
import {
  BattlesController,
  ChallengeController,
  DungeonController,
  EconomyController,
  GachaController,
  SlgController,
} from './game.controllers.js';

@Module({
  controllers: [
    BattlesController,
    ChallengeController,
    DungeonController,
    EconomyController,
    GachaController,
    SlgController,
  ],
  providers: [
    { provide: BattlesService, useFactory: () => new BattlesService(new SqliteBattlesRepository()) },
    { provide: ChallengeService, useFactory: () => new ChallengeService(new SqliteChallengeRepository()) },
    { provide: DungeonService, useFactory: () => new DungeonService(new SqliteDungeonRepository()) },
    { provide: EconomyService, useFactory: () => new EconomyService(new SqliteEconomyRepository()) },
    { provide: GachaService, useFactory: () => new GachaService(new SqliteGachaRepository()) },
    { provide: SlgService, useFactory: () => new SlgService(new SqliteSlgRepository()) },
  ],
})
export class GameModule {}
