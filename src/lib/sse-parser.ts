export interface SseChunkState {
  buffer: string
  events: string[]
}

export function consumeSseChunk(state: SseChunkState, chunk: string): SseChunkState {
  const buffer = state.buffer + chunk
  const parts = buffer.split(/\r?\n\r?\n/)
  const nextBuffer = parts.pop() || ""
  const events = parts
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    buffer: nextBuffer,
    events: [...state.events, ...events],
  }
}
