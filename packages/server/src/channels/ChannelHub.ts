import { ChannelEvent, ChannelInstanceRef, ChannelJobResult, ChannelSink } from './types'

type EventHandler = (event: ChannelEvent) => void | Promise<void>
type InstanceHandler = (channel: string, pool: ChannelInstanceRef[]) => void | Promise<void>
type JobDoneHandler = (channel: string, jobId: string, result: ChannelJobResult, instance: string) => void | Promise<void>

/**
 * The ChannelSink handed to adapters: fans each notification out to the services that subscribed
 * (instance bookkeeping, event dispatch), isolating adapters from handler failures.
 */
export class ChannelHub implements ChannelSink {
    private eventHandlers: EventHandler[] = []
    private instanceHandlers: InstanceHandler[] = []
    private jobDoneHandlers: JobDoneHandler[] = []

    constructor(private readonly onHandlerError: (error: unknown) => void = () => {}) {}

    subscribeEvents(handler: EventHandler): void {
        this.eventHandlers.push(handler)
    }

    subscribeInstanceChanges(handler: InstanceHandler): void {
        this.instanceHandlers.push(handler)
    }

    subscribeJobDone(handler: JobDoneHandler): void {
        this.jobDoneHandlers.push(handler)
    }

    onEvent(event: ChannelEvent): void {
        this.fan(this.eventHandlers.map((h) => () => h(event)))
    }

    onInstanceChange(channel: string, pool: ChannelInstanceRef[]): void {
        this.fan(this.instanceHandlers.map((h) => () => h(channel, pool)))
    }

    onJobDone(channel: string, jobId: string, result: ChannelJobResult, instance: string): void {
        this.fan(this.jobDoneHandlers.map((h) => () => h(channel, jobId, result, instance)))
    }

    private fan(calls: Array<() => void | Promise<void>>): void {
        for (const call of calls) {
            try {
                Promise.resolve(call()).catch(this.onHandlerError)
            } catch (e) {
                this.onHandlerError(e)
            }
        }
    }
}

let hub: ChannelHub | undefined

export const getChannelHub = (): ChannelHub => {
    if (!hub) hub = new ChannelHub()
    return hub
}

/** For tests */
export const resetChannelHub = (): void => {
    hub = undefined
}
