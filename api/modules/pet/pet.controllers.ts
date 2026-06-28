import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put } from '@nestjs/common';

import { PetService } from './pet.service.js';
import { throwPetError } from './pet.errors.js';

function ok<T>(data: T, message?: string, legacyPayload: Record<string, unknown> = {}) {
  return message ? { success: true, data, message, ...legacyPayload } : { success: true, data, ...legacyPayload };
}

@Controller('api/pet')
export class PetController {
  constructor(@Inject(PetService) private readonly petService: PetService) {}

  @Get('students/:studentId')
  getStudentPet(@Param('studentId') studentId: string) {
    try {
      const data = this.petService.getStudentPet(studentId);
      return ok(data, undefined, { pet: data.pet, has_parent_buff: data.hasParentBuff });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('students/:studentId/dashboard')
  getStudentDashboard(@Param('studentId') studentId: string) {
    try {
      return ok(this.petService.getStudentDashboard(studentId));
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('students/:studentId/classmates')
  getClassmates(@Param('studentId') studentId: string) {
    try {
      const classmatesPets = this.petService.listClassmates(studentId);
      return ok({ classmatesPets }, undefined, { classmatesPets });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('students/:studentId/adoptions')
  @HttpCode(HttpStatus.OK)
  adoptPet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.petService.adoptPet(studentId, {
        elementType: body?.elementType,
      });
      return ok(data, undefined, { petId: data.petId, pet: data.pet });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('students/:studentId/actions')
  @HttpCode(HttpStatus.OK)
  interact(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.petService.interact(studentId, body as any);
      return ok(data, undefined, { pet: data.pet, points: data.points });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Put('students/:studentId')
  updatePet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.petService.updatePet(studentId, body);
      return ok(data, 'Pet updated successfully', { pet: data.pet });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('classes/:classId')
  listClassPets(@Param('classId') classId: string) {
    try {
      const students = this.petService.listClassPets(classId);
      return ok({ students }, undefined, { students });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('classes/:classId/leaderboard')
  listLeaderboard(@Param('classId') classId: string) {
    try {
      const leaderboard = this.petService.listLeaderboard(classId);
      return ok({ leaderboard }, undefined, { leaderboard });
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('battles')
  @HttpCode(HttpStatus.OK)
  battle(@Body() body: Record<string, any>) {
    try {
      const result = this.petService.battle(body as any);
      return ok({ result }, undefined, { result });
    } catch (error) {
      throwPetError(error);
    }
  }
}

@Controller('api/pets')
export class LegacyPetsController {
  constructor(@Inject(PetService) private readonly petService: PetService) {}

  @Get('admin/class/:classId')
  listClassPets(@Param('classId') classId: string) {
    try {
      return { success: true, students: this.petService.listClassPets(classId) };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('classmates/:studentId')
  listClassmates(@Param('studentId') studentId: string) {
    try {
      return { success: true, classmatesPets: this.petService.listClassmates(studentId) };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('battle')
  @HttpCode(HttpStatus.OK)
  battle(@Body() body: Record<string, any>) {
    try {
      return { success: true, result: this.petService.battle(body as any) };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get('leaderboard/:classId')
  listLeaderboard(@Param('classId') classId: string) {
    try {
      return { success: true, leaderboard: this.petService.listLeaderboard(classId) };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('adopt')
  @HttpCode(HttpStatus.OK)
  adoptPet(@Body() body: Record<string, any>) {
    try {
      const data = this.petService.adoptPet(body?.studentId, {
        ...body,
        elementType: body?.elementType ?? body?.element_type,
        custom_image: body?.custom_image ?? body?.customImage,
      });
      return { success: true, petId: data.petId, pet: data.pet };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Post('interact')
  @HttpCode(HttpStatus.OK)
  interact(@Body() body: Record<string, any>) {
    try {
      const data = this.petService.interact(body?.studentId, body as any);
      return { success: true, pet: data.pet, points: data.points };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Get(':studentId')
  getStudentPet(@Param('studentId') studentId: string) {
    try {
      const data = this.petService.getStudentPet(studentId);
      return { success: true, pet: data.pet, has_parent_buff: data.hasParentBuff };
    } catch (error) {
      throwPetError(error);
    }
  }

  @Put(':studentId')
  updatePet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.petService.updatePet(studentId, body);
      return { success: true, message: 'Pet updated successfully', pet: data.pet };
    } catch (error) {
      throwPetError(error);
    }
  }
}
