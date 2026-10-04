package com.tuyufactory.client

/** 发现锁只在前台短期持有；重复调用、后台切换和引擎销毁都不累计引用。 */
internal class Discovery(
    private val acquire: () -> Unit,
    private val release: () -> Unit,
) {
    private var active = false
    private var closed = false
    private var held = false

    fun start() {
        check(!closed) { "Discovery is closed" }
        active = true
    }

    fun acquire() {
        check(active && !closed) { "Discovery requires the foreground activity" }
        if (!held) {
            acquire.invoke()
            held = true
        }
    }

    fun release() {
        if (held) {
            release.invoke()
            held = false
        }
    }

    fun stop() {
        active = false
        release()
    }

    fun close() {
        active = false
        closed = true
        release()
    }
}
