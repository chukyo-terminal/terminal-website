-- 未使用だった post_reviews は、レビューの依頼（post_review_requests）と操作（post_review_actions）に置き換える。
-- データが残っている場合は削除せず失敗させる（手で移行してから、このマイグレーションを再実行する）。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "post_reviews") THEN
    RAISE EXCEPTION 'post_reviews にデータがあるため削除できません';
  END IF;
END
$$;--> statement-breakpoint
DROP TABLE "post_reviews" CASCADE;
