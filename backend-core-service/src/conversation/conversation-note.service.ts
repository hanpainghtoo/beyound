import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Conversation } from './entities/conversation.entity';
import { ConversationNote } from './entities/conversation-note.entity';
import {
  CreateConversationNoteDto,
  UpdateConversationNoteDto,
} from './dto/conversation-note.dto';
import { buildPaginatedResult } from '../common/pagination/paginated-result.dto';

/** Pinned notes are a section, not a second list — the cap keeps them that way. */
export const MAX_PINNED_CONVERSATION_NOTES = 3;
export const CONVERSATION_NOTES_DEFAULT_LIMIT = 15;
export const CONVERSATION_NOTES_MAX_LIMIT = 100;

export type ConversationNoteView = {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  isPinned: boolean;
  isResolved: boolean;
  edited: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ConversationNoteService {
  constructor(
    @InjectRepository(ConversationNote)
    private readonly noteRepository: Repository<ConversationNote>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
  ) {}

  private async requireConversation(tenantId: string, conversationId: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private toView(note: ConversationNote): ConversationNoteView {
    return {
      id: note.id,
      conversationId: note.conversationId,
      authorId: note.authorId,
      authorName: note.author?.fullName ?? null,
      content: note.content,
      isPinned: note.isPinned,
      isResolved: note.isResolved,
      edited:
        note.updatedAt instanceof Date &&
        note.createdAt instanceof Date &&
        note.updatedAt.getTime() > note.createdAt.getTime(),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  async listNotes(
    tenantId: string,
    conversationId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    await this.requireConversation(tenantId, conversationId);
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(
      Math.max(options.limit ?? CONVERSATION_NOTES_DEFAULT_LIMIT, 1),
      CONVERSATION_NOTES_MAX_LIMIT,
    );
    // Pinned first, then newest — one list, not two queries, so pagination
    // counts stay consistent.
    const [rows, total] = await this.noteRepository.findAndCount({
      where: { tenantId, conversationId },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      relations: ['author'],
      skip: (page - 1) * limit,
      take: limit,
    });
    return buildPaginatedResult(
      rows.map((row) => this.toView(row)),
      total,
      page,
      limit,
    );
  }

  async createNote(
    tenantId: string,
    conversationId: string,
    authorId: string,
    dto: CreateConversationNoteDto,
  ): Promise<ConversationNoteView> {
    await this.requireConversation(tenantId, conversationId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Note content must not be blank');
    }
    const note = await this.noteRepository.save(
      this.noteRepository.create({
        tenantId,
        conversationId,
        authorId,
        content,
        isPinned: false,
        isResolved: false,
      }),
    );
    const created = await this.noteRepository.findOne({
      where: { id: note.id, tenantId },
      relations: ['author'],
    });
    return this.toView(created ?? note);
  }

  async updateNote(
    tenantId: string,
    noteId: string,
    dto: UpdateConversationNoteDto,
  ): Promise<ConversationNoteView> {
    const note = await this.noteRepository.findOne({
      where: { id: noteId, tenantId },
      relations: ['author'],
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    if (dto.content !== undefined) {
      const content = dto.content.trim();
      if (!content) {
        throw new BadRequestException('Note content must not be blank');
      }
      note.content = content;
    }
    if (dto.isPinned === true && !note.isPinned) {
      const pinned = await this.noteRepository.count({
        where: {
          tenantId,
          conversationId: note.conversationId,
          isPinned: true,
        },
      });
      if (pinned >= MAX_PINNED_CONVERSATION_NOTES) {
        throw new BadRequestException(
          `Only ${MAX_PINNED_CONVERSATION_NOTES} pinned notes are allowed per conversation — unpin one first`,
        );
      }
      note.isPinned = true;
    } else if (dto.isPinned === false) {
      note.isPinned = false;
    }
    if (dto.isResolved !== undefined) {
      note.isResolved = dto.isResolved;
    }
    return this.toView(await this.noteRepository.save(note));
  }

  async deleteNote(tenantId: string, noteId: string): Promise<void> {
    const note = await this.noteRepository.findOne({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    await this.noteRepository.remove(note);
  }
}
