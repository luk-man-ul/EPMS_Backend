import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: { role: true },
        },
      },
    })

    if (!user) throw new UnauthorizedException('Invalid credentials')

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) throw new UnauthorizedException('Invalid credentials')

    const payload = { sub: user.id }

    const token = this.jwtService.sign(payload)

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles.map(r => r.role.name),
      },
    }
  }
}
