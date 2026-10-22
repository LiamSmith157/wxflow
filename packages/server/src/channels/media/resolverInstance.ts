import { MediaResolver } from './resolver'

const resolver = new MediaResolver()

/** The process-wide media resolver; the resource library of a later change registers its `res://` source here */
export const getMediaResolver = (): MediaResolver => resolver
