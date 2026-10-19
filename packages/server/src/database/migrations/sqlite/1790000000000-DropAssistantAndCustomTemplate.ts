import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropAssistantAndCustomTemplate1790000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "assistant";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "custom_template";`)
    }

    // Recreates the tables with their final columns; the workspace foreign keys and indexes are not restored
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "assistant" ("id" varchar PRIMARY KEY NOT NULL, "details" text NOT NULL, "credential" varchar NOT NULL, "iconSrc" varchar, "type" text, "workspaceId" text, "createdDate" datetime NOT NULL DEFAULT (datetime('now')), "updatedDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "custom_template" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "flowData" text NOT NULL, "description" varchar, "badge" varchar, "framework" varchar, "usecases" varchar, "type" varchar, "workspaceId" text, "updatedDate" datetime NOT NULL DEFAULT (datetime('now')), "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
    }
}
