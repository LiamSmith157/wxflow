import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddChannelEntities1791000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`channel_instance\` (
                \`id\` varchar(36) NOT NULL,
                \`channel\` varchar(32) NOT NULL,
                \`instanceKey\` varchar(255) NOT NULL,
                \`displayName\` varchar(255),
                \`workspaceId\` varchar(255),
                \`lastSeenAt\` datetime(6),
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(
            `CREATE UNIQUE INDEX \`IDX_channel_instance_channel_instanceKey\` ON \`channel_instance\` (\`channel\`, \`instanceKey\`);`
        )

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`channel_subscription\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowId\` varchar(255) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`channel\` varchar(32) NOT NULL,
                \`eventType\` varchar(64) NOT NULL,
                \`instanceScope\` varchar(255) NOT NULL DEFAULT 'all',
                \`filters\` text,
                \`enabled\` tinyint(1) NOT NULL DEFAULT 0,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(
            `CREATE INDEX \`IDX_channel_subscription_lookup\` ON \`channel_subscription\` (\`workspaceId\`, \`channel\`, \`eventType\`, \`enabled\`);`
        )

        await queryRunner.query(`CREATE INDEX \`IDX_channel_subscription_chatflowId\` ON \`channel_subscription\` (\`chatflowId\`);`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`channel_setting\` (
                \`id\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`masterEnabled\` tinyint(1) NOT NULL DEFAULT 1,
                \`sendRateLimitPerMinute\` int NOT NULL DEFAULT 20,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_channel_setting_workspaceId\` ON \`channel_setting\` (\`workspaceId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`channel_setting\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`channel_subscription\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`channel_instance\``)
    }
}
