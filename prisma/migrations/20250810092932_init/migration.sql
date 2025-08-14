-- CreateEnum
CREATE TYPE "dev"."Role" AS ENUM ('ADMIN', 'REVIEWER', 'CONTRIBUTOR');

-- CreateTable
CREATE TABLE "dev"."sudoers" (
    "id" SERIAL NOT NULL,
    "cu_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sudoers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev"."users" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "roles" "dev"."Role"[] DEFAULT ARRAY[]::"dev"."Role"[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sudoers_cu_id_key" ON "dev"."sudoers"("cu_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_id_key" ON "dev"."users"("user_id");
