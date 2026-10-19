import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropAssistantAndCustomTemplate1790000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`assistant\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`custom_template\`;`)
    }

    // Recreates the tables with their final columns; the workspace foreign keys and indexes are not restored
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`assistant\` (\`id\` varchar(36) NOT NULL, \`credential\` varchar(255) NOT NULL, \`details\` text NOT NULL, \`iconSrc\` varchar(255) DEFAULT NULL, \`type\` text, \`workspaceId\` varchar(36) DEFAULT NULL, \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`custom_template\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`flowData\` text NOT NULL, \`description\` varchar(255) DEFAULT NULL, \`badge\` varchar(255) DEFAULT NULL, \`framework\` varchar(255) DEFAULT NULL, \`usecases\` varchar(255) DEFAULT NULL, \`type\` varchar(30) DEFAULT NULL, \`workspaceId\` varchar(36) DEFAULT NULL, \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
        )
    }
}
