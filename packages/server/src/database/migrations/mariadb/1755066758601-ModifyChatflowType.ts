import { MigrationInterface, QueryRunner } from 'typeorm'

export class ModifyChatflowType1755066758601 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE \`chat_flow\` SET \`type\` = 'CHATFLOW' WHERE \`type\` IS NULL OR \`type\` = '';
        `)
        await queryRunner.query(`
            ALTER TABLE \`chat_flow\` MODIFY COLUMN \`type\` VARCHAR(20) NOT NULL DEFAULT 'CHATFLOW';
        `)
    }

    public async down(): Promise<void> {}
}
