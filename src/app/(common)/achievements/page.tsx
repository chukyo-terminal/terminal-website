import { desc, eq } from 'drizzle-orm';
import { Code } from 'lucide-react';

import { achievementsTable, postsTable } from '@/db/schema';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';


export const dynamic = 'force-dynamic';


/**
 * 日付をフォーマットする。
 */
function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toLocaleDateString('ja-JP');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString('ja-JP');
}


export default async function Achievements(): Promise<JSX.Element> {
  const achievements = await db
    .select({
      id: achievementsTable.id,
      title: achievementsTable.title,
      description: achievementsTable.description,
      date: achievementsTable.date,
      postSlug: postsTable.slug,
    })
    .from(achievementsTable)
    .leftJoin(postsTable, eq(achievementsTable.postId, postsTable.id))
    .orderBy(desc(achievementsTable.date), desc(achievementsTable.id));

  return (
    <div className="space-y-8 z-50 pt-20">
      <div className="space-y-4">
        <h2 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          活動実績
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </div>

      {achievements.length === 0 && (
        <p className="text-gray-400">表示できる活動実績はありません。</p>
      )}

      <div className="space-y-16">
        {achievements.map((achievement, index) => (
          <article
            key={achievement.id}
            className={
              `flex flex-col md:items-stretch ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} ` +
              'gap-8'
            }
          >
            <div className="w-full md:w-1/2">
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-6 space-y-4 h-full">
                <div className="space-y-2">
                  <p className="text-sm text-emerald-300">{formatDate(achievement.date)}</p>
                  <h3 className="text-2xl font-bold">{achievement.title}</h3>
                </div>
                {achievement.description && (
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {achievement.description}
                  </p>
                )}
              </div>
            </div>
            <div className="hidden md:block md:w-1/2" aria-hidden="true" />
          </article>
        ))}
      </div>
    </div>
  );
}
