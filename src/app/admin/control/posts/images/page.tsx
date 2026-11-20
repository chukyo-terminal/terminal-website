import { eq } from 'drizzle-orm';

import ImageManager from './_components/image-manager';
import { imagesTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { selectImageUsages, selectManagedImages } from '@/lib/image-queries';
import { saveUploadedImage } from '@/lib/image-upload';
import { isValidImageId } from '@/lib/images';

import type { JSX } from 'react';
import type { ManagedImage } from '@/lib/images';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


export default async function ImagesControlPage(): Promise<JSX.Element> {
  const images = await selectManagedImages();

  async function handleUploadImage(formData: FormData): Promise<ActionResult<ManagedImage>> {
    'use server';
    const result = await saveUploadedImage(formData);
    if (!result.ok) {
      return result;
    }
    try {
      const [image] = await selectManagedImages(result.data.id);
      if (image) {
        return { ok: true, data: image };
      }
    } catch (e) {
      console.error('Failed to load uploaded image:', e);
    }
    // アップロードには成功しているため、取得できなかった情報を補って返す
    return { ok: true, data: { ...result.data, uploaderName: null, usages: [] } };
  }

  async function handleDeleteImage(id: string, isUsageConfirmed: boolean): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidImageId(id) || typeof isUsageConfirmed !== 'boolean') {
      return { ok: false, error: '画像IDが正しくありません。' };
    }
    try {
      // 画面を開いた後に記事で使われるようになった画像を、確認せずに削除しないようにする
      const usages = await selectImageUsages(id);
      if (usages.has(id) && !isUsageConfirmed) {
        return {
          ok: false,
          error: 'この画像は記事で使用されています。ページを再読み込みして、使用状況を確認してください。',
        };
      }
      await db.delete(imagesTable).where(eq(imagesTable.id, id));
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete image:', e);
      return { ok: false, error: '画像の削除に失敗しました。' };
    }
  }

  return <ImageManager initialImages={images} onUpload={handleUploadImage} onDelete={handleDeleteImage} />;
}
