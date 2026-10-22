import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddResourceEntity1792000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS resource (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspaceId" varchar NOT NULL,
                "name" varchar(100) NOT NULL,
                "nameKey" varchar(100) NOT NULL,
                "groupName" varchar(100),
                "kind" varchar(16) NOT NULL,
                "mimeType" varchar(100) NOT NULL,
                "ext" varchar(16) NOT NULL,
                "size" integer NOT NULL,
                "originalName" varchar(255) NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_resource" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_resource_workspaceId_nameKey" ON resource ("workspaceId", "nameKey");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS resource`)
    }
}
