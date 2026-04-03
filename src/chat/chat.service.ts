import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ensure company-wide chat room exists
   * Creates it if it doesn't exist and adds all active users as members
   */
  async ensureCompanyRoom(): Promise<void> {
    // Check if company room already exists
    const existingRoom = await this.prisma.chatRoom.findFirst({
      where: { type: 'COMPANY' },
    });

    if (existingRoom) {
      // Company room exists, ensure all active users are members
      const allUsers = await this.prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });

      const existingMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId: existingRoom.id },
        select: { userId: true },
      });

      const existingMemberIds = new Set(existingMembers.map(m => m.userId));
      const newMembers = allUsers.filter(u => !existingMemberIds.has(u.id));

      if (newMembers.length > 0) {
        await this.prisma.chatRoomMember.createMany({
          data: newMembers.map(user => ({
            roomId: existingRoom.id,
            userId: user.id,
          })),
          skipDuplicates: true,
        });
      }

      return;
    }

    // Create company room
    const allUsers = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    await this.prisma.chatRoom.create({
      data: {
        name: 'Company',
        type: 'COMPANY',
        members: {
          create: allUsers.map(user => ({ userId: user.id })),
        },
      },
    });
  }

  /**
   * Ensure team chat room exists for a project
   * Creates it if it doesn't exist and adds all project members
   * If duplicates exist, returns the oldest one and cleans up duplicates
   */
  async ensureTeamRoom(projectId: string): Promise<void> {
    // Check if team room already exists for this project
    const existingRooms = await this.prisma.chatRoom.findMany({
      where: {
        type: 'TEAM',
        projectId,
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          select: { userId: true },
        },
        lead: {
          select: { id: true },
        },
      },
    });

    if (!project) {
      return;
    }

    // Collect all team member IDs (project members + lead)
    const memberIds = new Set(project.members.map(m => m.userId));
    if (project.lead) {
      memberIds.add(project.lead.id);
    }

    // If duplicates exist, keep the oldest and delete the rest
    if (existingRooms.length > 1) {
      const [keepRoom, ...duplicateRooms] = existingRooms;
      
      // Delete duplicate rooms
      await this.prisma.chatRoom.deleteMany({
        where: {
          id: {
            in: duplicateRooms.map(r => r.id),
          },
        },
      });

      // Use the oldest room
      const existingRoom = keepRoom;
      
      // Ensure all project members are in the room
      const existingMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId: existingRoom.id },
        select: { userId: true },
      });

      const existingMemberIds = new Set(existingMembers.map(m => m.userId));
      const newMembers = Array.from(memberIds).filter(id => !existingMemberIds.has(id));

      if (newMembers.length > 0) {
        await this.prisma.chatRoomMember.createMany({
          data: newMembers.map(userId => ({
            roomId: existingRoom.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return;
    }

    // If one room exists, sync members
    if (existingRooms.length === 1) {
      const existingRoom = existingRooms[0];
      
      // Ensure all project members are members
      const existingMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId: existingRoom.id },
        select: { userId: true },
      });

      const existingMemberIds = new Set(existingMembers.map(m => m.userId));
      const newMembers = Array.from(memberIds).filter(id => !existingMemberIds.has(id));

      if (newMembers.length > 0) {
        await this.prisma.chatRoomMember.createMany({
          data: newMembers.map(userId => ({
            roomId: existingRoom.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return;
    }

    // No room exists, create one
    await this.prisma.chatRoom.create({
      data: {
        name: `${project.name} Team`,
        type: 'TEAM',
        projectId,
        members: {
          create: Array.from(memberIds).map(userId => ({ userId })),
        },
      },
    });
  }

  async createRoom(createRoomDto: CreateRoomDto, creatorId: string) {
    const { name, type, projectId, memberIds = [] } = createRoomDto;

    // Prevent duplicate COMPANY rooms
    if (type === 'COMPANY') {
      const existingCompanyRoom = await this.prisma.chatRoom.findFirst({
        where: { type: 'COMPANY' },
      });

      if (existingCompanyRoom) {
        throw new ForbiddenException('Company room already exists');
      }
    }

    // Prevent duplicate TEAM rooms for the same project
    if (type === 'TEAM' && projectId) {
      const existingTeamRoom = await this.prisma.chatRoom.findFirst({
        where: {
          type: 'TEAM',
          projectId,
        },
      });

      if (existingTeamRoom) {
        throw new ForbiddenException('Team room already exists for this project');
      }
    }

    // Ensure creator is in the member list
    const allMemberIds = [...new Set([creatorId, ...memberIds])];

    const room = await this.prisma.chatRoom.create({
      data: {
        name,
        type,
        projectId,
        members: {
          create: allMemberIds.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profilePhoto: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return room;
  }

  async getUserRooms(userId: string, userRole: string) {
    // Admin can see all rooms
    if (userRole === 'ADMIN') {
      const allRooms = await this.prisma.chatRoom.findMany({
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  profilePhoto: true,
                },
              },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            take: 1,
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: [
          { type: 'asc' },
          { updatedAt: 'desc' },
        ],
      });

      // Sort rooms: COMPANY first, then TEAM, then others
      return allRooms.sort((a, b) => {
        if (a.type === 'COMPANY') return -1;
        if (b.type === 'COMPANY') return 1;
        if (a.type === 'TEAM' && b.type !== 'TEAM') return -1;
        if (b.type === 'TEAM' && a.type !== 'TEAM') return 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    }

    // For non-admin users, ensure company room exists and user is a member
    await this.ensureCompanyRoom();

    // Ensure team rooms exist for all projects the user is a member of
    const userProjects = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });

    // Also include projects where user is the lead
    const ledProjects = await this.prisma.project.findMany({
      where: { leadId: userId },
      select: { id: true },
    });

    const allProjectIds = [
      ...userProjects.map(p => p.projectId),
      ...ledProjects.map(p => p.id),
    ];

    // Ensure team rooms exist for all user's projects
    await Promise.all(
      allProjectIds.map(projectId => this.ensureTeamRoom(projectId))
    );

    // Only return rooms where user is a member
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profilePhoto: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: [
        // Company room first
        { type: 'asc' }, // COMPANY comes before TEAM alphabetically
        // Then by updated time
        { updatedAt: 'desc' },
      ],
    });

    // Sort rooms: COMPANY first, then TEAM, then others
    return rooms.sort((a, b) => {
      if (a.type === 'COMPANY') return -1;
      if (b.type === 'COMPANY') return 1;
      if (a.type === 'TEAM' && b.type !== 'TEAM') return -1;
      if (b.type === 'TEAM' && a.type !== 'TEAM') return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }

  /**
   * Add a new user to the company room
   * Called when a new user is created
   */
  async addUserToCompanyRoom(userId: string): Promise<void> {
    // Ensure company room exists
    await this.ensureCompanyRoom();

    // Get company room
    const companyRoom = await this.prisma.chatRoom.findFirst({
      where: { type: 'COMPANY' },
    });

    if (!companyRoom) {
      return;
    }

    // Check if user is already a member
    const existingMember = await this.prisma.chatRoomMember.findFirst({
      where: {
        roomId: companyRoom.id,
        userId,
      },
    });

    if (existingMember) {
      return;
    }

    // Add user to company room
    await this.prisma.chatRoomMember.create({
      data: {
        roomId: companyRoom.id,
        userId,
      },
    });
  }

  async getRoomMessages(roomId: string, userId: string, userRole: string, limit = 50) {
    // Admin can access all rooms
    if (userRole !== 'ADMIN') {
      // Verify user is a member of the room
      const membership = await this.prisma.chatRoomMember.findFirst({
        where: {
          roomId,
          userId,
        },
      });

      if (!membership) {
        throw new ForbiddenException('You are not a member of this room');
      }
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePhoto: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return messages.reverse();
  }

  async createMessage(roomId: string, senderId: string, senderRole: string, content: string) {
    // Admin can send messages to any room
    if (senderRole !== 'ADMIN') {
      // Verify user is a member of the room
      const membership = await this.prisma.chatRoomMember.findFirst({
        where: {
          roomId,
          userId: senderId,
        },
      });

      if (!membership) {
        throw new ForbiddenException('You are not a member of this room');
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePhoto: true,
          },
        },
      },
    });

    // Update room's updatedAt timestamp
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.isDeleted) {
      throw new ForbiddenException('Cannot edit a deleted message');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const diff = Date.now() - message.createdAt.getTime();
    if (diff > 15 * 60 * 1000) {
      throw new BadRequestException('Edit time window expired');
    }

    if (!newContent.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: newContent,
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePhoto: true,
          },
        },
      },
    });
  }

  async deleteMessage(messageId: string, userId: string, userRole?: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isAdmin = userRole === 'ADMIN';
    if (!isAdmin && message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePhoto: true,
          },
        },
      },
    });
  }

  async verifyRoomMembership(roomId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.chatRoomMember.findFirst({
      where: {
        roomId,
        userId,
      },
    });

    return !!membership;
  }

  async getRoomById(roomId: string, userId: string, userRole: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profilePhoto: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Admin can access all rooms
    if (userRole !== 'ADMIN') {
      // Verify user is a member of the room
      const isMember = room.members.some(member => member.userId === userId);
      
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this room');
      }
    }

    return room;
  }
}
