import { DrizzleQueryError, eq } from 'drizzle-orm';
import { HttpStatus } from 'http-status-ts';
import { Hono } from 'hono';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';
import { zValidator } from '@hono/zod-validator';

import {
  UsersApiDeleteResponseSchema, UsersApiGetResponseSchema, UsersApiPatchRequestSchema,
  UsersApiPatchResponseSchema, UsersApiPostRequestSchema, UsersApiPostResponseSchema,
} from '@/api-schemas/users';
import { usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { ApiErrorResponseSchema } from '@/api-schemas/common';
import { isNullOrNotEmptyString, isNotEmptyString } from '@/utils/string';


const app = new Hono()
  .get('/', async (c) => {
    const users = await db
      .select({
        id: usersTable.id,
        cuId: usersTable.cuId,
        name: usersTable.name,
        email: usersTable.email,
        displayName: usersTable.displayName,
        roles: usersTable.roles,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable);
    return c.json(UsersApiGetResponseSchema.parse({
      status: HttpStatus.OK,
      title: 'Users retrieved',
      detail: 'Users have been retrieved successfully.',
      data: { users },
    }));
  })
  .post('/', zValidator('json', UsersApiPostRequestSchema), async (c) => {
    const { cuId, name, roles } = c.req.valid('json');
    if (!isNotEmptyString(cuId)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid CU_ID',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"cu_id" must be a non-empty string.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    }
    if (!isNotEmptyString(name)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid name',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"name" must be a non-empty string.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    }
    try {
      const result = await db.insert(usersTable).values({
        cuId,
        name,
        roles,
      }).returning({
        id: usersTable.id,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });
      return c.json(UsersApiPostResponseSchema.parse({
        status: HttpStatus.CREATED,
        title: 'User created',
        detail: `User with CU_ID "${cuId}" has been created successfully.`,
        data: {
          user: result[0],
        },
      }), HttpStatus.CREATED);
    } catch (e) {
      console.error('Error creating user:', e);
      if (e instanceof DrizzleQueryError && e.cause instanceof DatabaseError && e.cause.code === PostgresError.UNIQUE_VIOLATION) {
        return c.json(ApiErrorResponseSchema.parse({
          title: 'CU_ID already exists',
          status: HttpStatus.CONFLICT,
          detail: `A user with CU_ID "${cuId}" already exists.`,
        }), HttpStatus.CONFLICT, { 'Content-Type': 'application/problem+json' });
      }
      throw e;
    }
  })
  .patch('/:userId', zValidator('json', UsersApiPatchRequestSchema), async (c) => {
    const userId = Number(c.req.param('userId'));
    if (Number.isNaN(userId)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid user ID',
        status: HttpStatus.BAD_REQUEST,
        detail: 'User ID must be a valid number.',
      }), HttpStatus.BAD_REQUEST, { 'Content-Type': 'application/problem+json' });
    }

    const { cuId, name, displayName, email, roles, isActive } = c.req.valid('json');
    if (!cuId && !name && displayName === undefined && !email && !roles && isActive === undefined) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'No updates provided',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'At least one field must be provided for update.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    } else if (cuId && !isNotEmptyString(cuId)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid CU_ID',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"cu_id" must be a non-empty string.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    } else if (name && !isNotEmptyString(name)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid name',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"name" must be a non-empty string.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    } else if (displayName !== undefined && !isNullOrNotEmptyString(displayName)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid display name',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"display_name" must be a non-empty string or null.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    } else if (email !== undefined && !isNullOrNotEmptyString(email)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid email',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: '"email" must be a valid email address or null.',
      }), HttpStatus.UNPROCESSABLE_ENTITY, { 'Content-Type': 'application/problem+json' });
    }

    const updateData: Partial<typeof usersTable.$inferInsert> = {};
    if (cuId) {
      updateData.cuId = cuId;
    }
    if (name) {
      updateData.name = name;
    }
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    if (email !== undefined) {
      updateData.email = email;
    }
    if (roles) {
      updateData.roles = roles;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, userId))
      .returning({ updatedAt: usersTable.updatedAt });
    return c.json(UsersApiPatchResponseSchema.parse({
      status: HttpStatus.OK,
      title: 'User updated',
      detail: `User with ID ${userId} has been updated successfully.`,
      data: {
        updatedAt: result[0].updatedAt,
      },
    }), HttpStatus.OK);
  })
  .delete('/:userId', async (c) => {
    const userId = Number(c.req.param('userId'));
    if (Number.isNaN(userId)) {
      return c.json(ApiErrorResponseSchema.parse({
        title: 'Invalid user ID',
        status: HttpStatus.BAD_REQUEST,
        detail: 'User ID must be a valid number.',
      }), HttpStatus.BAD_REQUEST, { 'Content-Type': 'application/problem+json' });
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));
    return c.json(UsersApiDeleteResponseSchema.parse({
      status: HttpStatus.OK,
      title: 'User deleted',
      detail: `User with ID ${userId} has been deleted successfully.`,
    }), HttpStatus.OK);
  });


export default app;
