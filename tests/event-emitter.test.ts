import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from '../src/core/event-emitter'

interface TestEvents {
  message: [string]
  count: [number]
  pair: [string, number]
  empty: []
}

describe('EventEmitter', () => {
  it('should call listener when event is emitted', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    emitter.on('message', listener)
    emitter.emit('message', 'hello')

    expect(listener).toHaveBeenCalledWith('hello')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('should support multiple listeners on same event', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    emitter.on('count', listener1)
    emitter.on('count', listener2)
    emitter.emit('count', 42)

    expect(listener1).toHaveBeenCalledWith(42)
    expect(listener2).toHaveBeenCalledWith(42)
  })

  it('should return unsubscribe function', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    const unsub = emitter.on('message', listener)
    emitter.emit('message', 'first')
    unsub()
    emitter.emit('message', 'second')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('first')
  })

  it('once() should only fire once', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    emitter.once('count', listener)
    emitter.emit('count', 1)
    emitter.emit('count', 2)
    emitter.emit('count', 3)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(1)
  })

  it('should handle events with multiple arguments', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    emitter.on('pair', listener)
    emitter.emit('pair', 'hello', 42)

    expect(listener).toHaveBeenCalledWith('hello', 42)
  })

  it('should handle events with no arguments', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    emitter.on('empty', listener)
    emitter.emit('empty')

    expect(listener).toHaveBeenCalledWith()
  })

  it('removeAllListeners() should clear specific event', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = vi.fn()

    emitter.on('message', listener)
    emitter.removeAllListeners('message')
    emitter.emit('message', 'test')

    expect(listener).not.toHaveBeenCalled()
  })

  it('removeAllListeners() with no args should clear all', () => {
    const emitter = new EventEmitter<TestEvents>()
    const msgListener = vi.fn()
    const countListener = vi.fn()

    emitter.on('message', msgListener)
    emitter.on('count', countListener)
    emitter.removeAllListeners()
    emitter.emit('message', 'test')
    emitter.emit('count', 1)

    expect(msgListener).not.toHaveBeenCalled()
    expect(countListener).not.toHaveBeenCalled()
  })

  it('listenerCount() should return correct count', () => {
    const emitter = new EventEmitter<TestEvents>()

    expect(emitter.listenerCount('message')).toBe(0)

    const unsub1 = emitter.on('message', () => {})
    emitter.on('message', () => {})

    expect(emitter.listenerCount('message')).toBe(2)

    unsub1()
    expect(emitter.listenerCount('message')).toBe(1)
  })

  it('should catch and log errors in listeners', () => {
    const emitter = new EventEmitter<TestEvents>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const goodListener = vi.fn()

    emitter.on('message', () => { throw new Error('oops') })
    emitter.on('message', goodListener)
    emitter.emit('message', 'test')

    // Error was caught, second listener still ran
    expect(goodListener).toHaveBeenCalledWith('test')
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('should not fail when emitting event with no listeners', () => {
    const emitter = new EventEmitter<TestEvents>()
    expect(() => emitter.emit('message', 'test')).not.toThrow()
  })
})
