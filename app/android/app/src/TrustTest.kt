package com.tuyufactory.client

import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date
import java.util.concurrent.TimeUnit

/** 使用现场生成的自签名 X509；私钥只进入指定临时目录，结束后删除。 */
fun main(args: Array<String>) {
    val directory = Path.of(args.single()).toRealPath()
    require(directory.isAbsolute && Files.isDirectory(directory))
    val workspace = Files.createTempDirectory(directory, "trust-").toFile()
    val hostname = "tuyufactory-12345678-1234-1234-1234-123456789abc.local"
    val origin = "https://127.0.0.1:45123"
    fun certificate(name: String, dns: String = hostname, usage: Boolean = true, critical: Boolean = false): X509Certificate {
        val pem = workspace.resolve("$name.pem")
        val command = mutableListOf(
            "/opt/homebrew/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", workspace.resolve("$name.key").path, "-out", pem.path,
            "-days", "1", "-subj", "/CN=$dns", "-addext", "subjectAltName=DNS:$dns",
            "-addext", "basicConstraints=critical,CA:FALSE",
        )
        if (usage) command.addAll(listOf("-addext", "extendedKeyUsage=serverAuth"))
        if (critical) command.addAll(listOf("-addext", "1.2.3.4=critical,DER:01:01:FF"))
        val process = ProcessBuilder(command).redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD).start()
        check(process.waitFor(20, TimeUnit.SECONDS) && process.exitValue() == 0)
        return pem.inputStream().use { CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate }
    }
    fun pin(value: X509Certificate) = MessageDigest.getInstance("SHA-256").digest(value.encoded)
        .joinToString("") { "%02x".format(it) }
    fun rejected(action: () -> Unit) { check(runCatching(action).isFailure) }
    try {
        val good = certificate("good")
        val trust = Trust(hostname, pin(good), origin)
        trust.verify(good)
        trust.certificate(good.encoded)
        check(trust.allows("$origin/login"))
        check(trust.allows("$origin/app#workspace"))
        listOf("https://127.0.0.1:45124/login", "https://$hostname:59460/", "file:///private", "content://documents/a", "javascript:alert(1)", "https://user@127.0.0.1:45123/", "$origin.evil.invalid/").forEach {
            check(!trust.allows(it))
        }
        rejected { Trust(hostname, pin(good), "https://127.0.0.1:45123/") }
        rejected { Trust(hostname, pin(good), "https://127.0.0.1:45123?query") }
        rejected { Trust(hostname, "0".repeat(64), origin).verify(good) }
        rejected { trust.verify(good, Date(good.notAfter.time + 1)) }
        rejected { trust.verify(good, Date(good.notBefore.time - 1)) }
        val wrong = certificate("wrong", "another.local")
        rejected { Trust(hostname, pin(wrong), origin).verify(wrong) }
        val noUsage = certificate("usage", usage = false)
        rejected { Trust(hostname, pin(noUsage), origin).verify(noUsage) }
        val unknown = certificate("critical", critical = true)
        rejected { Trust(hostname, pin(unknown), origin).verify(unknown) }
        val damaged = good.encoded.apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
        val malformed = CertificateFactory.getInstance("X.509").generateCertificate(damaged.inputStream()) as X509Certificate
        rejected { Trust(hostname, pin(malformed), origin).verify(malformed) }
        println("Trust X509/origin: all assertions passed")
    } finally { check(workspace.deleteRecursively()) }
}
