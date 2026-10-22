/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

/** A channel account discovered by a gateway (e.g. one logged-in WeChat, keyed by wxid). */
@Entity()
@Index('IDX_channel_instance_channel_instanceKey', ['channel', 'instanceKey'], { unique: true })
export class ChannelInstance {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar', length: 32 })
    channel: string

    /** Channel-specific identity; wxid for WeChat */
    @Column({ type: 'varchar' })
    instanceKey: string

    @Column({ nullable: true, type: 'varchar' })
    displayName?: string

    /** null = unassigned: events are dropped and send nodes cannot use the instance */
    @Column({ nullable: true, type: 'varchar' })
    workspaceId?: string | null

    @Column({ nullable: true, type: 'timestamp' })
    lastSeenAt?: Date

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
