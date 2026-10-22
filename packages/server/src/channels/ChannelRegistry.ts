import { ChannelAdapter } from './types'

export class ChannelNotRegisteredError extends Error {
    constructor(public readonly channel: string) {
        super(`Channel "${channel}" is not registered`)
        this.name = 'ChannelNotRegisteredError'
    }
}

/** Lookup of channel adapters by channel id; nodes and triggers only ever see adapters through this. */
export class ChannelRegistry {
    private adapters = new Map<string, ChannelAdapter>()

    register(adapter: ChannelAdapter): void {
        this.adapters.set(adapter.channel, adapter)
    }

    unregister(channel: string): void {
        this.adapters.delete(channel)
    }

    has(channel: string): boolean {
        return this.adapters.has(channel)
    }

    get(channel: string): ChannelAdapter {
        const adapter = this.adapters.get(channel)
        if (!adapter) throw new ChannelNotRegisteredError(channel)
        return adapter
    }

    list(): ChannelAdapter[] {
        return [...this.adapters.values()]
    }
}

let registry: ChannelRegistry | undefined

/** Process-wide registry, created on first use */
export const getChannelRegistry = (): ChannelRegistry => {
    if (!registry) registry = new ChannelRegistry()
    return registry
}

/** For tests */
export const resetChannelRegistry = (): void => {
    registry = undefined
}
