export interface CounterState {
  value: number
  step: number
}

export interface EventStateState {
  value: string
  options: string[]
  colors?: Record<string, string>
}

export interface TimerState {
  mode: 'countdown' | 'countup'
  durationMs: number
  startedAtMs: number | null
  pausedAccumMs: number
  isRunning: boolean
  continueBelowZero: boolean
}

export interface TextState { value: string }

export interface ControlStateData {
  counters: Record<string, CounterState>
  eventStates: Record<string, EventStateState>
  timers: Record<string, TimerState>
  texts: Record<string, TextState>
}

export interface ControlStatePersistence {
  load: () => Promise<unknown>
  save: (state: ControlStateData) => Promise<void>
}

export const RESERVED_CONTROL_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export function validateControlName(name: string): string | null {
  if (RESERVED_CONTROL_NAMES.has(name)) return 'Nama grup reserved dan tidak boleh digunakan'
  if (name.length > 64) return 'Nama grup maksimal 64 karakter'
  return null
}

export function getTimerDisplayMs(timer: TimerState, now = Date.now()): number {
  const elapsed = timer.pausedAccumMs + (timer.isRunning && timer.startedAtMs !== null ? now - timer.startedAtMs : 0)
  if (timer.mode !== 'countdown') return elapsed
  const remaining = timer.durationMs - elapsed
  return remaining < 0 && !timer.continueBelowZero ? 0 : remaining
}

export function createEmptyControlState(): ControlStateData {
  return {
    counters: Object.create(null),
    eventStates: Object.create(null),
    timers: Object.create(null),
    texts: Object.create(null),
  }
}

export function normalizeControlState(data: Partial<ControlStateData> | null | undefined): ControlStateData {
  const state = createEmptyControlState()
  if (data?.counters && typeof data.counters === 'object') {
    for (const [name, raw] of Object.entries(data.counters)) {
      if (!raw || typeof raw !== 'object') continue
      state.counters[name] = {
        value: Number.isFinite((raw as CounterState).value) ? Number((raw as CounterState).value) : 0,
        step: Number.isFinite((raw as CounterState).step) && Number((raw as CounterState).step) !== 0 ? Number((raw as CounterState).step) : 1,
      }
    }
  }
  if (data?.eventStates && typeof data.eventStates === 'object') {
    for (const [group, raw] of Object.entries(data.eventStates)) {
      if (!raw || typeof raw !== 'object') continue
      const options = Array.isArray((raw as EventStateState).options)
        ? (raw as EventStateState).options.filter((opt) => typeof opt === 'string' && opt.length > 0)
        : []
      const colors: Record<string, string> = Object.create(null)
      const rawColors = (raw as EventStateState).colors
      if (rawColors && typeof rawColors === 'object') {
        for (const [option, color] of Object.entries(rawColors)) {
          if (typeof color === 'string' && color.trim()) colors[option] = color.trim()
        }
      }
      state.eventStates[group] = {
        value: typeof (raw as EventStateState).value === 'string' ? (raw as EventStateState).value : (options[0] || ''),
        options,
        colors,
      }
    }
  }
  if (data?.timers && typeof data.timers === 'object') {
    for (const [name, raw] of Object.entries(data.timers)) {
      if (!raw || typeof raw !== 'object') continue
      const timer = raw as Partial<TimerState>
      state.timers[name] = {
        mode: timer.mode === 'countup' ? 'countup' : 'countdown',
        durationMs: Number.isFinite(timer.durationMs) ? Number(timer.durationMs) : 0,
        startedAtMs: Number.isFinite(timer.startedAtMs as number) ? Number(timer.startedAtMs) : null,
        pausedAccumMs: Number.isFinite(timer.pausedAccumMs) ? Number(timer.pausedAccumMs) : 0,
        isRunning: typeof timer.isRunning === 'boolean' ? timer.isRunning : false,
        continueBelowZero: typeof timer.continueBelowZero === 'boolean' ? timer.continueBelowZero : false,
      }
    }
  }
  if (data?.texts && typeof data.texts === 'object') {
    for (const [name, raw] of Object.entries(data.texts)) {
      if (!raw || typeof raw !== 'object') continue
      state.texts[name] = { value: typeof (raw as TextState).value === 'string' ? (raw as TextState).value : '' }
    }
  }
  return state
}

export class ControlStateStore {
  private state: ControlStateData | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly persistence: ControlStatePersistence, private readonly now = () => Date.now()) {}

  private async getState(): Promise<ControlStateData> {
    if (this.state) return this.state
    try {
      this.state = normalizeControlState(await this.persistence.load() as Partial<ControlStateData>)
    } catch {
      this.state = createEmptyControlState()
    }
    return this.state
  }

  async read(): Promise<ControlStateData> {
    await this.queue
    return this.getState()
  }

  private mutate(fn: (state: ControlStateData) => void): Promise<ControlStateData> {
    const run = this.queue.then(async () => {
      const state = await this.getState()
      fn(state)
      await this.persistence.save(state)
      return state
    })
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  private counter(state: ControlStateData, name: string) {
    return state.counters[name] ??= { value: 0, step: 1 }
  }
  private eventState(state: ControlStateData, group: string) {
    return state.eventStates[group] ??= { value: '', options: [], colors: Object.create(null) }
  }
  private timer(state: ControlStateData, name: string) {
    return state.timers[name] ??= { mode: 'countdown', durationMs: 0, startedAtMs: null, pausedAccumMs: 0, isRunning: false, continueBelowZero: false }
  }

  async bumpCounter(name: string, direction: 1 | -1) { return this.mutate((state) => { const counter = this.counter(state, name); counter.value += direction * (counter.step || 1) }) }
  async resetCounter(name: string) { return this.mutate((state) => { this.counter(state, name).value = 0 }) }
  async setCounter(name: string, value: number) { return this.mutate((state) => { const counter = this.counter(state, name); if (Number.isFinite(value)) counter.value = value }) }

  async setEventState(group: string, value: string) { return this.mutate((state) => { const event = this.eventState(state, group); if (!event.options.includes(value)) event.options = [...event.options, value]; event.value = value }) }
  async addEventStateOption(group: string, option: string) { return this.mutate((state) => { const event = this.eventState(state, group); const clean = option.trim(); if (clean && !event.options.includes(clean)) event.options = [...event.options, clean]; if (!event.value && event.options.length) event.value = event.options[0] ?? '' }) }
  async setEventStateOptionColor(group: string, option: string, color: string) { return this.mutate((state) => { const event = this.eventState(state, group); if (!event.options.includes(option)) event.options = [...event.options, option]; const colors = event.colors ??= Object.create(null); const clean = color.trim(); if (clean) colors[option] = clean; else delete colors[option] }) }
  async removeEventStateOption(group: string, option: string) { return this.mutate((state) => { const event = this.eventState(state, group); event.options = event.options.filter((item) => item !== option); if (event.colors) delete event.colors[option]; if (event.value === option) event.value = event.options[0] || '' }) }
  async setControlText(name: string, value: string) { return this.mutate((state) => { state.texts[name] = { value: value.replace(/\r\n/g, '\n').slice(0, 5000) } }) }

  async startTimer(name: string, mode?: 'countdown' | 'countup', durationMs?: number, restart = false) {
    return this.mutate((state) => {
      const timer = this.timer(state, name)
      if (timer.isRunning && !restart) return
      if (mode === 'countdown' || mode === 'countup') timer.mode = mode
      if (Number.isFinite(durationMs)) timer.durationMs = Number(durationMs)
      if (restart) timer.pausedAccumMs = 0
      timer.startedAtMs = this.now()
      timer.isRunning = true
    })
  }
  async pauseTimer(name: string) { return this.mutate((state) => { const timer = this.timer(state, name); if (timer.isRunning && typeof timer.startedAtMs === 'number') timer.pausedAccumMs += this.now() - timer.startedAtMs; timer.startedAtMs = null; timer.isRunning = false }) }
  async resetTimer(name: string) { return this.mutate((state) => { const timer = this.timer(state, name); timer.startedAtMs = null; timer.pausedAccumMs = 0; timer.isRunning = false }) }
  async configureTimer(name: string, patch: { mode?: 'countdown' | 'countup'; durationMs?: number; continueBelowZero?: boolean }) { return this.mutate((state) => { const timer = this.timer(state, name); if (patch.mode === 'countdown' || patch.mode === 'countup') timer.mode = patch.mode; if (Number.isFinite(patch.durationMs)) timer.durationMs = Number(patch.durationMs); if (typeof patch.continueBelowZero === 'boolean') timer.continueBelowZero = patch.continueBelowZero }) }
}
