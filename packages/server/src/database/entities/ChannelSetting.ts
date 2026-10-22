/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

/** Per-workspace channel safety valves shared by all channels. */
@Entity()
export class ChannelSetting {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index('IDX_channel_setting_workspaceId', { unique: true })
    @Column({ type: 'varchar' })
    workspaceId: string

    /** Master switch: when off, no channel event triggers a flow and send nodes are skipped */
    @Column({ type: 'boolean', default: true })
    masterEnabled: boolean

    /** Send calls allowed per instance per minute */
    @Column({ type: 'integer', default: 20 })
    sendRateLimitPerMinute: number

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
