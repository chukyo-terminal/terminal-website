import { z } from 'zod';


/**
 * APIエラーのレスポンスのスキーマ定義
 *
 * このスキーマは、RFC 9457に準拠している。
 * このレスポンスを返す場合は、Content-Typeを `application/problem+json` にすべきである。
 *
 * @see https://tex2e.github.io/rfc-translater/html/rfc9457.html
 */
export const ApiErrorResponseSchema = z.object({
  type: z.url().optional(),
  status: z.number().min(400).max(599),
  title: z.string(),
  detail: z.string().optional(),
  instance: z.url().optional(),
});


/**
 * APIリクエストが成功した場合に返すレスポンスのベースとなるスキーマ定義
 *
 * このスキーマは、RFC 9457と同じような形式を採用しているが、エラーレスポンスに用いるものではない。
 * このレスポンスを返す場合は、Content-Typeが `application/problem+json` であってはならないことに注意すること。
 *
 * なお、`data` フィールドは、APIごとに異なるレスポンスの内容を表すためのものである。
 * 必要に応じて、APIごとにこのスキーマを拡張して使用することが想定されている。
 */
export const ApiGenericSuccessResponseSchema = z.object({
  type: z.url().optional(),
  status: z.number().min(200).max(299),
  title: z.string(),
  detail: z.string().optional(),
  instance: z.url().optional(),
  data: z.unknown().optional(),
});


/**
 * Date型とstring型を相互に自動変換するZodスキーマ
 */
export const TransformableDateSchema = z.preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.iso.datetime().transform((str) => new Date(str)));
