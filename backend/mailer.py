import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("jrpos.mailer")


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST", "").strip())


def send_email(to: str, subject: str, html: str) -> None:
    """Envía un correo por SMTP. Best-effort: nunca lanza (solo registra). No-op sin SMTP_HOST."""
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        logger.info("SMTP no configurado; correo omitido (to=%s, subject=%s)", to, subject)
        return
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", "").strip() or user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender or "JRPOS <no-reply@jrpos.app>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.sendmail(sender, [to], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.starttls()
                if user:
                    smtp.login(user, password)
                smtp.sendmail(sender, [to], msg.as_string())
        logger.info("Correo enviado (to=%s, subject=%s)", to, subject)
    except Exception as e:
        logger.warning("Fallo envío de correo (to=%s): %s", to, e)


def send_welcome_email(to: str, name: str, business_name: str) -> None:
    name_html = name or "propietario"
    html = f"""<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#059669">¡Bienvenido a JRPOS, {name_html}!</h2>
  <p>Tu tienda <b>{business_name}</b> ya está lista con un trial de 30 días, sin tarjeta.</p>
  <p>Durante el trial tienes todo el POS activo: ventas, inventario, créditos, caja y más.</p>
  <p style="color:#64748b;font-size:13px">Si no creaste esta cuenta, ignora este mensaje.</p>
</div>"""
    send_email(to, "Bienvenido a JRPOS — tu tienda está lista", html)
