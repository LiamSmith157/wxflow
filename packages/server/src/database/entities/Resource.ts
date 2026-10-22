/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

export type ResourceKind = 'image' | 'video' | 'file'

/** A reusable media asset (image, video or document) kept per workspace. The file itself lives on local disk. */
@Entity()
@Index('IDX_resource_workspaceId_nameKey', ['workspaceId', 'nameKey'], { unique: true })
export class Resource {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    workspaceId: string

    /** Name as the user typed it (trimmed) */
    @Column({ type: 'varchar', length: 100 })
    name: string

    /** `name` lower-cased: unique per workspace and used to look a resource up by name */
    @Column({ type: 'varchar', length: 100 })
    nameKey: string

    /** One-level group, display only. Not called `group`: that is a reserved word in SQL */
    @Column({ type: 'varchar', length: 100, nullable: true })
    groupName?: string | null

    @Column({ type: 'varchar', length: 16 })
    kind: ResourceKind

    @Column({ type: 'varchar', length: 100 })
    mimeType: string

    /** File extension of the stored file, with the dot (".jpg") */
    @Column({ type: 'varchar', length: 16 })
    ext: string

    @Column({ type: 'integer' })
    size: number

    /** File name at upload time, used for downloads */
    @Column({ type: 'varchar', length: 255 })
    originalName: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
