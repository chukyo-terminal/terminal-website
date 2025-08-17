-- CreateEnum
CREATE TYPE "dev"."Role" AS ENUM ('ADMIN', 'REVIEWER', 'CONTRIBUTOR');

-- CreateTable
CREATE TABLE "dev"."sudoers" (
    "id" SERIAL NOT NULL,
    "cu_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sudoers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev"."users" (
    "id" SERIAL NOT NULL,
    "cu_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "roles" "dev"."Role"[] DEFAULT ARRAY[]::"dev"."Role"[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sudoers_cu_id_key" ON "dev"."sudoers"("cu_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_cu_id_key" ON "dev"."users"("cu_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_display_name_key" ON "dev"."users"("display_name");

-- AddForeignKey
ALTER TABLE "dev"."sudoers" ADD CONSTRAINT "sudoers_cu_id_fkey" FOREIGN KEY ("cu_id") REFERENCES "dev"."users"("cu_id") ON DELETE RESTRICT ON UPDATE CASCADE;
