/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { ConversationNoteService } from './conversation-note.service';

/**
 * Cover for conversation-linked staff notes (Plan 72).
 *
 * Notes are internal-only by construction — this table has no send path —
 * so the spec pins the behaviours that protect that contract and the list
 * experience: tenant isolation on every operation, pinned-first ordering,
 * the 3-pin cap with a named error, blank-content rejection (the DTO guards
 * empty strings but not whitespace), and the edited flag.
 */

function createService() {
  const notes: Record<string, any> = {};
  let seq = 0;
  let tick = 0;

  const noteRepository = {
    findAndCount: jest.fn(async (options: any) => {
      const rows = Object.values(notes).filter(
        (n: any) =>
          n.tenantId === options.where.tenantId &&
          n.conversationId === options.where.conversationId,
      );
      // Honour the repository `order` option exactly (key order included) so
      // the spec proves the service's ordering, not the mock's. TypeORM
      // applies multiple order keys in declaration order.
      const orderEntries = Object.entries(options.order ?? {});
      rows.sort((a: any, b: any) => {
        for (const [key, direction] of orderEntries) {
          let left = a[key];
          let right = b[key];
          if (left instanceof Date) left = left.getTime();
          if (right instanceof Date) right = right.getTime();
          if (typeof left === 'boolean') {
            left = left ? 1 : 0;
            right = right ? 1 : 0;
          }
          if (left === right) continue;
          return direction === 'DESC'
            ? (right as number) - (left as number)
            : (left as number) - (right as number);
        }
        return 0;
      });
      const skip = options.skip ?? 0;
      return [rows.slice(skip, skip + options.take), rows.length];
    }),
    findOne: jest.fn(async (options: any) => {
      const row = Object.values(notes).find(
        (n: any) =>
          n.id === options.where.id && n.tenantId === options.where.tenantId,
      );
      return row ?? null;
    }),
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => {
      tick += 1;
      const row = {
        ...value,
        id: value.id ?? `note-${++seq}`,
        createdAt: value.createdAt ?? new Date(tick * 1000),
        // Every save bumps updatedAt past createdAt exactly when the row
        // already existed — mirroring @UpdateDateColumn for the edited flag.
        updatedAt: new Date(tick * 1000 + (value.createdAt ? 500 : 0)),
      };
      notes[row.id] = row;
      return row;
    }),
    remove: jest.fn(async (value: any) => {
      delete notes[value.id];
    }),
    count: jest.fn(
      async (options: any) =>
        Object.values(notes).filter(
          (n: any) =>
            n.tenantId === options.where.tenantId &&
            n.conversationId === options.where.conversationId &&
            !!n.isPinned === !!options.where.isPinned,
        ).length,
    ),
  };
  const conversationRepository = {
    findOne: jest.fn(async (options: any) => ({
      id: options.where.id,
      tenantId: options.where.tenantId,
    })),
  };

  const service = new ConversationNoteService(
    noteRepository as any,
    conversationRepository as any,
  );
  return { service, noteRepository, conversationRepository, notes };
}

const TENANT = 'tenant-1';
const CONVERSATION = 'conv-1';

describe('ConversationNoteService', () => {
  it('lists pinned notes before newer unpinned ones', async () => {
    const { service } = createService();
    // The pinned note is deliberately the OLDEST: a plain createdAt DESC
    // would bury it last, so only the pinned-first ordering passes.
    const old = await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'old pinned',
    });
    await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'middle unpinned',
    });
    await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'new unpinned',
    });
    await service.updateNote(TENANT, old.id, { isPinned: true });

    const page = await service.listNotes(TENANT, CONVERSATION, {});
    expect(page.data.map((n) => n.content)).toEqual([
      'old pinned',
      'new unpinned',
      'middle unpinned',
    ]);
    expect(old.edited).toBe(false);
  });

  it('rejects blank content on create and update', async () => {
    const { service } = createService();
    await expect(
      service.createNote(TENANT, CONVERSATION, 'u1', { content: '   ' }),
    ).rejects.toThrow('must not be blank');

    const note = await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: '  real content  ',
    });
    expect(note.content).toBe('real content');
    await expect(
      service.updateNote(TENANT, note.id, { content: '  ' }),
    ).rejects.toThrow('must not be blank');
  });

  it('caps pinned notes at three with a named error', async () => {
    const { service } = createService();
    for (let i = 0; i < 3; i++) {
      const note = await service.createNote(TENANT, CONVERSATION, 'u1', {
        content: `pinned ${i}`,
      });
      await service.updateNote(TENANT, note.id, { isPinned: true });
    }
    const fourth = await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'fourth',
    });
    await expect(
      service.updateNote(TENANT, fourth.id, { isPinned: true }),
    ).rejects.toThrow('Only 3 pinned notes');
  });

  it('isolates tenants on every operation', async () => {
    const { service } = createService();
    const note = await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'mine',
    });
    await expect(service.updateNote('tenant-2', note.id, {})).rejects.toThrow(
      'not found',
    );
    await expect(service.deleteNote('tenant-2', note.id)).rejects.toThrow(
      'not found',
    );
    const page = await service.listNotes('tenant-2', CONVERSATION, {});
    expect(page.total).toBe(0);
  });

  it('404s on unknown conversations and notes', async () => {
    const { service, conversationRepository } = createService();
    conversationRepository.findOne.mockResolvedValueOnce(null as any);
    await expect(service.listNotes(TENANT, 'missing', {})).rejects.toThrow(
      'Conversation not found',
    );
    await expect(service.deleteNote(TENANT, 'missing')).rejects.toThrow(
      'Note not found',
    );
  });

  it('toggles resolved and flags edits', async () => {
    const { service } = createService();
    const note = await service.createNote(TENANT, CONVERSATION, 'u1', {
      content: 'follow up',
    });
    expect(note.isResolved).toBe(false);
    const resolved = await service.updateNote(TENANT, note.id, {
      isResolved: true,
    });
    expect(resolved.isResolved).toBe(true);
    const edited = await service.updateNote(TENANT, note.id, {
      content: 'followed up',
    });
    expect(edited.edited).toBe(true);
  });
});
