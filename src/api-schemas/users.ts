import z from 'zod';

import { ApiGenericSuccessResponseSchema, TransformableDateSchema } from './common';


/**
 * `/api/users` のGETレスポンスのスキーマ定義
 */
export const UsersApiGetResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    users: z.array(z.object({
      id: z.number(),
      cuId: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
      email: z.email().nullable(),
      roles: z.array(z.enum(['ADMIN', 'REVIEWER', 'CONTRIBUTOR'])),
      isActive: z.boolean(),
      createdAt: TransformableDateSchema,
      updatedAt: TransformableDateSchema,
    }))
  }),
});


/**
 * `/api/users` のPOSTリクエストのスキーマ定義
 */
export const UsersApiPostRequestSchema = z.object({
  cuId: z.string(),
  name: z.string(), // 初期登録時の識別用。Google連携時に自動で上書きされる
  roles: z.array(z.enum(['ADMIN', 'REVIEWER', 'CONTRIBUTOR'])),
});


/**
 * `/api/users` のPOSTレスポンスのスキーマ定義
 */
export const UsersApiPostResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({
    user: z.object({
      id: z.number(),
      createdAt: TransformableDateSchema,
      updatedAt: TransformableDateSchema,
    }),
  }),
});


/**
 * `/api/users/:userId` のPATCHリクエストのスキーマ定義
 */
export const UsersApiPatchRequestSchema = z.object({
  cuId: z.string().optional(), // 内部進学時に変更するため
  name: z.string().optional(),
  displayName: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  roles: z.array(z.enum(['ADMIN', 'REVIEWER', 'CONTRIBUTOR'])).optional(),
  isActive: z.boolean().optional(),
});


/**
 * `/api/users/:userId` のPATCHレスポンスのスキーマ定義
 */
export const UsersApiPatchResponseSchema = ApiGenericSuccessResponseSchema.extend({
  data: z.object({ 
    updatedAt: TransformableDateSchema,
  }),
});


/**
 * `/api/users/:userId` のDELETEレスポンスのスキーマ定義
 */
export const UsersApiDeleteResponseSchema = ApiGenericSuccessResponseSchema.omit({ data: true });
