/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

/** Index of which flows listen to which channel events; synced from the Start node when a flow is saved. */
@Entity()
@Index('IDX_channel_subscription_lookup', ['workspaceId', 'channel', 'eventType', 'enabled'])
export class ChannelSubscription {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index('IDX_channel_subscription_chatflowId')
    @Column({ type: 'varchar' })
    chatflowId: string

    @Column({ type: 'varchar' })
    workspaceId: string

    @Column({ type: 'varchar', length: 32 })
    channel: string

    @Column({ type: 'varchar', length: 64 })
    eventType: string

    /** 'all' (every instance of the workspace) or a specific instanceKey */
    @Column({ type: 'varchar', default: 'all' })
    instanceScope: string

    /** JSON-serialized filters (direction, talker, talkerType, msgType, ...) */
    @Column({ nullable: true, type: 'text' })
    filters?: string

    @Column({ type: 'boolean', default: false })
    enabled: boolean

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
