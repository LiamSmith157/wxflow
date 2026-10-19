import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropAssistantAndCustomTemplate1790000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "assistant";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "custom_template";`)
    }

    // Recreates the tables with their final columns; the workspace foreign keys and indexes are not restored
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS assistant (id uuid NOT NULL DEFAULT uuid_generate_v4(), "credential" uuid NOT NULL, "details" text NOT NULL, "iconSrc" varchar NULL, "type" text NULL, "workspaceId" varchar NULL, "createdDate" timestamp NOT NULL DEFAULT now(), "updatedDate" timestamp NOT NULL DEFAULT now(), CONSTRAINT "PK_3c7cea7a044ac4c92764576cdbf" PRIMARY KEY (id));`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS custom_template (id uuid NOT NULL DEFAULT uuid_generate_v4(), "name" varchar NOT NULL, "flowData" text NOT NULL, "description" varchar NULL, "badge" varchar NULL, "framework" varchar NULL, "usecases" varchar NULL, "type" varchar NULL, "workspaceId" varchar NULL, "createdDate" timestamp NOT NULL DEFAULT now(), "updatedDate" timestamp NOT NULL DEFAULT now(), CONSTRAINT "PK_3c7cea7d087ac4b91764574cdbf" PRIMARY KEY (id));`
        )
    }
}
