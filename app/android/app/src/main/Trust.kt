package com.tuyufactory.client

import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date

/** 固定厂家叶证书是已确认的信任对象；不扩大到系统 CA 或仅凭错误类型放行。 */
internal class Trust(val hostname: String, private val pin: String, val origin: String) {
    init {
        require(Regex("tuyufactory-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.local").matches(hostname))
        require(Regex("[0-9a-f]{64}").matches(pin))
        val uri = URI(origin)
        require(uri.scheme == "https" && uri.host == "127.0.0.1" && uri.port in 1024..65535)
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null)
        require(uri.rawPath.isNullOrEmpty())
    }

    fun allows(value: String): Boolean = runCatching {
        val uri = URI(value)
        val target = URI(origin)
        uri.scheme == target.scheme && uri.host == target.host && uri.port == target.port &&
            uri.rawUserInfo == null && uri.rawAuthority == target.rawAuthority
    }.getOrDefault(false)

    fun certificate(der: ByteArray): X509Certificate =
        (CertificateFactory.getInstance("X.509").generateCertificate(der.inputStream()) as X509Certificate)
            .also { verify(it) }

    fun verify(certificate: X509Certificate, now: Date = Date()) {
        val actual = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        val expected = pin.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        require(MessageDigest.isEqual(actual, expected)) { "Certificate identity changed" }
        certificate.checkValidity(now)
        require(certificate.subjectX500Principal == certificate.issuerX500Principal)
        certificate.verify(certificate.publicKey)
        require(certificate.basicConstraints == -1) { "Only a server leaf is trusted" }
        require(certificate.extendedKeyUsage?.contains("1.3.6.1.5.5.7.3.1") == true)
        require(certificate.subjectAlternativeNames?.any {
            it.size == 2 && it[0] == 2 && it[1] == hostname
        } == true) { "Certificate hostname does not match the saved factory" }
        certificate.keyUsage?.let { require(it.isNotEmpty() && it[0]) }
        val handled = setOf("2.5.29.15", "2.5.29.17", "2.5.29.19", "2.5.29.37")
        require(certificate.criticalExtensionOIDs.orEmpty().all { it in handled })
        require(certificate.sigAlgName.uppercase().let { !it.contains("MD5") && !it.contains("SHA1") })
    }
}
