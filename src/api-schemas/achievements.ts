import { z } from 'zod';

import { ApiGenericSuccessResponseSchema, TransformableDateSchema } from './common';


/**
 * `/api/achievements` のGETレスポンスのスキーマ定義
 */
export const AchievementsApiGetResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    achievements: z.array(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().nullable(),
      post: z.object({
        id: z.number(),
        slug: z.string(),
      }).nullable(),
      date: TransformableDateSchema,
      createdAt: TransformableDateSchema,
      updatedAt: TransformableDateSchema,
    })),
  }),
});


/**
 * `/api/achievements` のPOSTリクエストのスキーマ定義
 */
export const AchievementsApiPostRequestSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  postId: z.number().nullable(),
  date: TransformableDateSchema,
});


/**
 * `/api/achievements` のPOSTレスポンスのスキーマ定義
 */
export const AchievementsApiPostResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    id: z.number(),
    createdAt: TransformableDateSchema,
  }),
});


/**
 * `/api/achievements/:id` のPATCHリクエストのスキーマ定義
 */
export const AchievementsApiPatchRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  postId: z.number().nullable().optional(),
  date: TransformableDateSchema.optional(),
});


/**
 * `/api/achievements/:id` のPATCHレスポンスのスキーマ定義
 */
export const AchievementsApiPatchResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    updatedAt: TransformableDateSchema,
  }),
});


/**
 * `/api/achievements/:id` のDELETEレスポンスのスキーマ定義
 */
export const AchievementsApiDeleteResponseSchema = ApiGenericSuccessResponseSchema.omit({ data: true });
