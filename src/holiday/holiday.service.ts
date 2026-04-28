import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { toISTDate } from '../common/utils/ist-date.util';

@Injectable()
export class HolidayService {
  constructor(private prisma: PrismaService) {}

  async createHoliday(dto: CreateHolidayDto) {
    // Normalize to UTC midnight of the IST calendar date — same convention as Attendance.date
    const date = toISTDate(new Date(dto.date));

    const existing = await this.prisma.holiday.findUnique({ where: { date } });
    if (existing) {
      throw new ConflictException(`A holiday already exists on ${dto.date}`);
    }

    return this.prisma.holiday.create({
      data: {
        date,
        name: dto.name,
        description: dto.description,
        isRecurring: dto.isRecurring ?? false,
      },
    });
  }

  async getAllHolidays() {
    return this.prisma.holiday.findMany({
      orderBy: { date: 'asc' },
    });
  }

  async deleteHoliday(id: string) {
    const existing = await this.prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Holiday with id ${id} not found`);
    }
    return this.prisma.holiday.delete({ where: { id } });
  }
}
