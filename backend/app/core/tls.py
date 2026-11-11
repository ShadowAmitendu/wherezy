"""Local HTTPS / TLS certificate management for Wherezy."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import ipaddress
import os
from pathlib import Path
import socket
import ssl
import tempfile
from typing import Iterable

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from backend.app.core.config import get_user_data_base_dir

MAX_SAFE_CERT_DAYS = 825


def _detect_local_ipv4() -> str:
    """Return the active outbound LAN IPv4 address or 127.0.0.1 if offline."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def get_default_cert_dir() -> Path:
    """Return the per-user directory used to store generated Wherezy TLS certs."""
    override = os.getenv("WHEREZY_CERT_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return get_user_data_base_dir() / "certs"


def get_default_cert_paths(cert_dir: Path | None = None) -> tuple[Path, Path]:
    """Return the default `(cert_path, key_path)` tuple for self-signed HTTPS."""
    base = (cert_dir or get_default_cert_dir()).expanduser()
    return base / "wherezy-cert.pem", base / "wherezy-key.pem"


def discover_san_entries(
    extra_hosts: Iterable[str] | None = None,
) -> tuple[list[str], list[ipaddress.IPv4Address | ipaddress.IPv6Address]]:
    """Collect local DNS names and IP addresses for SubjectAlternativeName."""
    dns_names: list[str] = []
    ip_addrs: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    seen_dns: set[str] = set()
    seen_ips: set[str] = set()

    def _add_dns(candidate: str) -> None:
        cleaned = candidate.strip().rstrip(".").lower()
        if not cleaned or cleaned in {"*", "localhost.localdomain"}:
            return
        if any(ch.isspace() for ch in cleaned):
            return
        if cleaned not in seen_dns:
            seen_dns.add(cleaned)
            dns_names.append(cleaned)

    def _add_ip(candidate: str | ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
        try:
            raw = str(candidate).split("%", 1)[0].strip()
            parsed = ipaddress.ip_address(raw)
        except ValueError:
            return
        if parsed.is_unspecified:
            return
        norm = str(parsed)
        if norm not in seen_ips:
            seen_ips.add(norm)
            ip_addrs.append(parsed)

    _add_dns("localhost")
    _add_ip("127.0.0.1")
    _add_ip("::1")

    local_ip = _detect_local_ipv4()
    if local_ip and local_ip != "127.0.0.1":
        _add_ip(local_ip)

    hostname = ""
    try:
        hostname = socket.gethostname().strip()
    except OSError:
        hostname = ""
    if hostname:
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            _add_dns(hostname)
            if "." not in hostname:
                _add_dns(f"{hostname}.local")
        try:
            for info in socket.getaddrinfo(hostname, None):
                sockaddr = info[4]
                if not sockaddr:
                    continue
                candidate_ip = str(sockaddr[0]).split("%", 1)[0]
                try:
                    addr_obj = ipaddress.ip_address(candidate_ip)
                except ValueError:
                    continue
                if not addr_obj.is_link_local and not addr_obj.is_multicast:
                    _add_ip(addr_obj)
        except OSError:
            pass

    if extra_hosts:
        for item in extra_hosts:
            raw = (item or "").strip()
            if not raw or raw in {"0.0.0.0", "::", "*"}:
                continue
            try:
                _add_ip(ipaddress.ip_address(raw.split("%", 1)[0]))
            except ValueError:
                _add_dns(raw)

    return dns_names, ip_addrs


def validate_cert_pair(cert_path: Path, key_path: Path) -> None:
    """Verify that `cert_path` and `key_path` exist and form a valid TLS keypair."""
    if not cert_path.is_file():
        raise FileNotFoundError(f"SSL certificate file not found: {cert_path}")
    if not key_path.is_file():
        raise FileNotFoundError(f"SSL private key file not found: {key_path}")
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    try:
        ctx.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    except (ssl.SSLError, OSError) as exc:
        raise ValueError(f"Invalid SSL certificate/key pair: {exc}") from exc


def _certificate_matches_requirements(
    cert_path: Path,
    key_path: Path,
    *,
    required_dns: set[str],
    required_ips: set[str],
    renew_within_days: int = 30,
) -> bool:
    if not cert_path.is_file() or not key_path.is_file():
        return False
    try:
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        priv_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
        validate_cert_pair(cert_path, key_path)

        cert_pub = cert.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        key_pub = priv_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        if cert_pub != key_pub:
            return False

        cutoff = datetime.now(timezone.utc) + timedelta(days=renew_within_days)
        if cert.not_valid_after_utc <= cutoff:
            return False

        san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        cert_dns = {name.lower() for name in san_ext.get_values_for_type(x509.DNSName)}
        cert_ips = {str(ip) for ip in san_ext.get_values_for_type(x509.IPAddress)}
        if not required_dns.issubset(cert_dns):
            return False
        if not required_ips.issubset(cert_ips):
            return False
        return True
    except Exception:
        return False


def _atomic_write_bytes(target: Path, payload: bytes, *, restrict_mode: bool = False) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
        if restrict_mode and os.name != "nt":
            os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, target)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def ensure_self_signed_cert(
    *,
    cert_dir: Path | None = None,
    extra_hosts: Iterable[str] | None = None,
    validity_days: int = 800,
    force: bool = False,
) -> tuple[Path, Path]:
    """Ensure a valid local self-signed HTTPS cert/key exists and covers current LAN IPs."""
    cert_path, key_path = get_default_cert_paths(cert_dir)
    dns_names, ip_addrs = discover_san_entries(extra_hosts=extra_hosts)

    if not force and _certificate_matches_requirements(
        cert_path,
        key_path,
        required_dns=set(dns_names),
        required_ips={str(ip) for ip in ip_addrs},
    ):
        return cert_path, key_path

    bounded_days = max(1, min(int(validity_days), MAX_SAFE_CERT_DAYS))
    now = datetime.now(timezone.utc)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Wherezy"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Wherezy Local Server"),
        ]
    )

    san_entries: list[x509.GeneralName] = [x509.DNSName(name) for name in dns_names]
    san_entries.extend(x509.IPAddress(ip) for ip in ip_addrs)

    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=bounded_days))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(private_key.public_key()),
            critical=False,
        )
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
    )
    certificate = builder.sign(private_key=private_key, algorithm=hashes.SHA256())

    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    cert_pem = certificate.public_bytes(serialization.Encoding.PEM)

    _atomic_write_bytes(key_path, key_pem, restrict_mode=True)
    _atomic_write_bytes(cert_path, cert_pem, restrict_mode=False)
    return cert_path, key_path


def get_cert_sha256_fingerprint(cert_path: Path) -> str:
    """Return the uppercase colon-separated SHA-256 fingerprint of a PEM certificate."""
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    digest = cert.fingerprint(hashes.SHA256()).hex().upper()
    return ":".join(digest[i : i + 2] for i in range(0, len(digest), 2))


def resolve_tls_files(
    *,
    https_enabled: bool,
    certfile: str = "",
    keyfile: str = "",
    bind_host: str = "127.0.0.1",
    extra_hosts: Iterable[str] | None = None,
    cert_dir: Path | None = None,
) -> tuple[str | None, str | None]:
    """Return validated `(certfile, keyfile)` strings when HTTPS is enabled, else `(None, None)`."""
    if not https_enabled:
        return None, None

    raw_cert = (certfile or "").strip()
    raw_key = (keyfile or "").strip()
    if bool(raw_cert) != bool(raw_key):
        raise ValueError("Both SSL certificate and private key files must be specified together.")

    if raw_cert and raw_key:
        cert_path = Path(raw_cert).expanduser()
        key_path = Path(raw_key).expanduser()
        validate_cert_pair(cert_path, key_path)
        return str(cert_path), str(key_path)

    hosts = [bind_host]
    if extra_hosts:
        hosts.extend(extra_hosts)
    cert_path, key_path = ensure_self_signed_cert(cert_dir=cert_dir, extra_hosts=hosts)
    return str(cert_path), str(key_path)
