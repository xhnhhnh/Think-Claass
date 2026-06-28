import { Module } from '@nestjs/common';

import {
  AttendanceController,
  ClassesController,
  GroupsController,
  LeavesController,
  PresetsController,
  StudentsController,
} from './classroom.controllers.js';
import { ClassroomService } from './classroom.service.js';

@Module({
  controllers: [
    AttendanceController,
    ClassesController,
    GroupsController,
    LeavesController,
    PresetsController,
    StudentsController,
  ],
  providers: [ClassroomService],
})
export class ClassroomModule {}
