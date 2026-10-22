import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddResourceEntity1792000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`resource\` (
                \`id\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`name\` varchar(100) NOT NULL,
                \`nameKey\` varchar(100) NOT NULL,
                \`groupName\` varchar(100),
                \`kind\` varchar(16) NOT NULL,
                \`mimeType\` varchar(100) NOT NULL,
                \`ext\` varchar(16) NOT NULL,
                \`size\` int NOT NULL,
                \`originalName\` varchar(255) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_resource_workspaceId_nameKey\` ON \`resource\` (\`workspaceId\`, \`nameKey\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`resource\``)
    }
}
