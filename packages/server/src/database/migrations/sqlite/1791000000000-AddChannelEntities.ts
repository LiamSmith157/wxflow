import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddChannelEntities1791000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "channel_instance" (
                "id" varchar PRIMARY KEY NOT NULL,
                "channel" varchar(32) NOT NULL,
                "instanceKey" varchar NOT NULL,
                "displayName" varchar,
                "workspaceId" varchar,
                "lastSeenAt" datetime,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_channel_instance_channel_instanceKey" ON "channel_instance" ("channel", "instanceKey");`
        )

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "channel_subscription" (
                "id" varchar PRIMARY KEY NOT NULL,
                "chatflowId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "channel" varchar(32) NOT NULL,
                "eventType" varchar(64) NOT NULL,
                "instanceScope" varchar NOT NULL DEFAULT 'all',
                "filters" text,
                "enabled" boolean NOT NULL DEFAULT 0,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_channel_subscription_lookup" ON "channel_subscription" ("workspaceId", "channel", "eventType", "enabled");`
        )

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_channel_subscription_chatflowId" ON "channel_subscription" ("chatflowId");`
        )

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "channel_setting" (
                "id" varchar PRIMARY KEY NOT NULL,
                "workspaceId" varchar NOT NULL,
                "masterEnabled" boolean NOT NULL DEFAULT 1,
                "sendRateLimitPerMinute" integer NOT NULL DEFAULT 20,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_channel_setting_workspaceId" ON "channel_setting" ("workspaceId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_setting"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_subscription"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_instance"`)
    }
}
