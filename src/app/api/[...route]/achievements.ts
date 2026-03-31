import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  AchievementsApiGetResponseSchema, AchievementsApiPostRequestSchema, AchievementsApiPostResponseSchema,
  AchievementsApiPatchRequestSchema, AchievementsApiPatchResponseSchema, AchievementsApiDeleteResponseSchema
} from '@/api-schemas/achievements';
import { achievementsTable, postsTable } from '@/db/schema';
import { db } from '@/lib/drizzle';


const app = new Hono()
  .get('/', async (c) => {
    const achievementsRaw = await db
      .select({
        id: achievementsTable.id,
        title: achievementsTable.title,
        description: achievementsTable.description,
        postId: postsTable.id,
        postSlug: postsTable.slug,
        date: achievementsTable.date,
        createdAt: achievementsTable.createdAt,
        updatedAt: achievementsTable.updatedAt,
      })
      .from(achievementsTable)
      .leftJoin(postsTable, eq(achievementsTable.postId, postsTable.id))
      .orderBy(desc(achievementsTable.date));

    const achievements = achievementsRaw.map((achievement) => {
      let post: { id: number; slug: string } | null = null;
      if (achievement.postId !== null && achievement.postSlug !== null) {
        post = {
          id: achievement.postId,
          slug: achievement.postSlug,
        };
      }

      return {
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        post,
        date: new Date(`${achievement.date}T00:00:00.000Z`),
        createdAt: achievement.createdAt,
        updatedAt: achievement.updatedAt,
      };
    });

    return c.json(AchievementsApiGetResponseSchema.parse({
      title: 'Achievements retrieved successfully',
      status: 200,
      data: {
        achievements,
      },
    }));
  })
  .post('/', zValidator('json', AchievementsApiPostRequestSchema), async (c) => {
    const { title, description, postId, date } = c.req.valid('json');
    const normalizedDate = date instanceof Date ? date.toISOString().slice(0, 10) : date;

    const [newAchievement] = await db
      .insert(achievementsTable)
      .values({
        title,
        description,
        postId,
        date: normalizedDate,
      })
      .returning({ id: achievementsTable.id, createdAt: achievementsTable.createdAt });

    return c.json(AchievementsApiPostResponseSchema.parse({
      title: 'Achievement created successfully',
      status: 201,
      data: {
        id: newAchievement.id,
        createdAt: newAchievement.createdAt,
      },
    }));
  })
  .patch('/:id', zValidator('json', AchievementsApiPatchRequestSchema), async (c) => {
    const { id } = c.req.param();
    const { title, description, postId, date } = c.req.valid('json');
    const normalizedDate = date instanceof Date ? date.toISOString().slice(0, 10) : date;

    const [updatedAchievement] = await db
      .update(achievementsTable)
      .set({
        title,
        description,
        postId,
        date: normalizedDate,
      })
      .where(eq(achievementsTable.id, Number(id)))
      .returning({ updatedAt: achievementsTable.updatedAt });

    return c.json(AchievementsApiPatchResponseSchema.parse({
      title: 'Achievement updated successfully',
      status: 200,
      data: {
        updatedAt: updatedAchievement.updatedAt,
      },
    }));
  })
  .delete('/:id', async (c) => {
    const { id } = c.req.param();

    await db
      .delete(achievementsTable)
      .where(eq(achievementsTable.id, Number(id)));

    return c.json(AchievementsApiDeleteResponseSchema.parse({
      title: 'Achievement deleted successfully',
      status: 200,
    }));
  });

export default app;
