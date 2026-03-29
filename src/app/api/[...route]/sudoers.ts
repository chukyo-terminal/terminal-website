import { DrizzleQueryError, eq } from 'drizzle-orm';
import { HttpStatus } from 'http-status-ts';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import {
  SudoersApiDeleteResponseSchema, SudoersApiGetResponseSchema,
  SudoersApiPostRequestSchema, SudoersApiPostResponseSchema
} from '@/api-schemas/sudoers';
import { sudoersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { ApiErrorResponseSchema } from '@/api-schemas/common';


const app = new Hono()
  .get('/', async (c) => {
    const sudoers = await db.select({
      id: sudoersTable.id,
      createdAt: sudoersTable.createdAt,
    }).from(sudoersTable).orderBy(sudoersTable.id);
    return c.json(SudoersApiGetResponseSchema.parse({
      status: HttpStatus.OK,
      title: 'Sudoers retrieved',
      detail: 'Sudoers have been retrieved successfully.',
      data: { sudoers },
    }));
  })
  .post('/', zValidator('json', SudoersApiPostRequestSchema), async (c) => {
    const { user } = await c.req.json();
    try {
      const result = await db
        .insert(sudoersTable)
        .values({ id: user.id })
        .returning({ createdAt: sudoersTable.createdAt });
      return c.json(SudoersApiPostResponseSchema.parse({
        status: HttpStatus.CREATED,
        title: 'Sudoer created',
        detail: 'Sudoer has been created successfully.',
        data: { createdAt: result[0].createdAt },
      }));
    } catch (e) {
      console.error('Error creating sudoer:', e);
      if (e instanceof DrizzleQueryError && e.cause instanceof DatabaseError && e.cause.code === PostgresError.UNIQUE_VIOLATION) {
        return c.json(ApiErrorResponseSchema.parse({
          title: 'Sudoer already exists',
          status: HttpStatus.CONFLICT,
          detail: `User with ID ${user.id} is already a sudoer.`,
        }), HttpStatus.CONFLICT, { 'Content-Type': 'application/problem+json' });
      }
    }
  })
  .delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid ID',
        status: HttpStatus.BAD_REQUEST,
        detail: 'ID must be a valid number.',
      }), HttpStatus.BAD_REQUEST, { 'Content-Type': 'application/problem+json' });
    }

    await db.delete(sudoersTable).where(eq(sudoersTable.id, id));
    return c.json(SudoersApiDeleteResponseSchema.parse({
      status: HttpStatus.OK,
      title: 'Sudoer deleted',
      detail: `Sudoer with ID ${id} has been deleted successfully.`,
    }));
  });

  
export default app;
