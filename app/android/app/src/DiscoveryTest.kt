package com.tuyufactory.client

/** 独立 JVM 组件测试：不加载 Flutter、SDK、厂家业务进程或真实无线权限。 */
fun main() {
    var acquired = 0
    var released = 0
    val discovery = Discovery({ acquired++ }, { released++ })
    check(runCatching { discovery.acquire() }.isFailure)
    discovery.start()
    discovery.acquire()
    discovery.acquire()
    check(acquired == 1)
    discovery.stop()
    check(released == 1)
    check(runCatching { discovery.acquire() }.isFailure)
    discovery.release()
    check(released == 1)
    discovery.start()
    discovery.acquire()
    discovery.close()
    discovery.close()
    check(acquired == 2 && released == 2)
    check(runCatching { discovery.start() }.isFailure)
    check(runCatching { discovery.acquire() }.isFailure)

    var failAcquire = true
    var failRelease = true
    val failures = Discovery(
        { if (failAcquire) error("acquire denied") },
        { if (failRelease) error("release denied") },
    )
    failures.start()
    check(runCatching { failures.acquire() }.isFailure)
    failAcquire = false
    failures.acquire()
    check(runCatching { failures.stop() }.isFailure)
    check(runCatching { failures.acquire() }.isFailure)
    failRelease = false
    failures.release()
    failures.close()
    println("Discovery lifecycle: all assertions passed")
}
