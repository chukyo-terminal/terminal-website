import { z } from 'zod';

import { ApiGenericSuccessResponseSchema, TransformableDateSchema } from './common';


/**
 * `/api/sudoers` のGETレスポンスのスキーマ定義
 */
export const SudoersApiGetResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    sudoers: z.array(z.object({
      id: z.number(),
      createdAt: TransformableDateSchema,
    })),
  }),
});


/**
 * `/api/sudoers` のPOSTリクエストのスキーマ定義
 */
export const SudoersApiPostRequestSchema = z.object({
  user: z.object({
    id: z.number(),
  }),
});


/**
 * `/api/sudoers` のPOSTレスポンスのスキーマ定義
 */
export const SudoersApiPostResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    createdAt: TransformableDateSchema,
  }),
});


/**
 * `/api/sudoers/:id` のDELETEレスポンスのスキーマ定義
 */
export const SudoersApiDeleteResponseSchema = ApiGenericSuccessResponseSchema.omit({ data: true });
