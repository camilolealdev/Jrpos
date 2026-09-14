import { Check, X } from "lucide-react";

// Espejo en el cliente de la política real en backend/auth.py::validate_password_strength.
// Esto es solo feedback visual — el backend es quien realmente la hace cumplir,
// así que basta con acercarse a sus reglas, no reimplementarlas al 100%.
const WEAK_PASSWORDS = new Set([
  "testpass123", "test12345", "12345678", "123456789", "1234567890",
  "password", "password1", "password123", "qwerty123", "11111111",
  "admin123", "admin1234", "superadmin", "superadmin123",
  "jrpos2026", "jrpos123", "contraseña", "contraseña123", "contrasena123",
  "cambiar123", "changeme123", "cambiame123",
]);

const MIN_LENGTH = 8;

export function evaluatePasswordStrength(password, email) {
  const pw = password || "";
  const checks = {
    length: pw.length >= MIN_LENGTH,
    classes: false,
    notWeak: pw.length > 0 && !WEAK_PASSWORDS.has(pw.toLowerCase()),
    notEmail: true,
  };

  const classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  checks.classes = classCount >= 2;

  if (email) {
    const local = email.split("@")[0]?.trim().toLowerCase();
    if (local && pw.toLowerCase().includes(local)) checks.notEmail = false;
  }

  const valid = pw.length > 0 && checks.length && checks.classes && checks.notWeak && checks.notEmail;

  // Puntaje 0-4 solo para la barra visual (no afecta si pasa o no la validación real)
  let score = 0;
  if (pw.length >= MIN_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  if (classCount >= 2) score += 1;
  if (classCount >= 3) score += 1;
  if (!valid) score = Math.min(score, 2);

  return { valid, checks, score: Math.min(score, 4) };
}

const SEGMENT_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];
const LABELS = ["Muy débil", "Muy débil", "Débil", "Buena", "Fuerte"];
const LABEL_COLORS = ["text-red-500", "text-red-500", "text-amber-500", "text-emerald-500", "text-emerald-500"];

/**
 * Medidor visual de fuerza de contraseña. No valida nada por sí solo — el
 * backend es la única fuente de verdad; esto es feedback en vivo para que el
 * usuario no descubra el rechazo recién al enviar el formulario.
 */
export default function PasswordStrengthMeter({ password, email, className = "" }) {
  if (!password) return null;
  const { checks, score } = evaluatePasswordStrength(password, email);

  const requirements = [
    { key: "length", label: `Al menos ${MIN_LENGTH} caracteres`, met: checks.length },
    { key: "classes", label: "Mayúsculas, minúsculas, números o símbolos (2+)", met: checks.classes },
    { key: "notWeak", label: "No es una contraseña común/conocida", met: checks.notWeak },
    { key: "notEmail", label: "No contiene tu correo", met: checks.notEmail },
  ];

  return (
    <div className={`space-y-1.5 ${className}`} data-testid="password-strength-meter">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? SEGMENT_COLORS[score] : "bg-slate-700/50"}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold ${LABEL_COLORS[score]}`}>{LABELS[score]}</span>
      </div>
      <ul className="space-y-0.5">
        {requirements.filter((r) => !r.met).map((r) => (
          <li key={r.key} className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <X className="w-3 h-3 text-red-500/80 shrink-0" />
            {r.label}
          </li>
        ))}
        {requirements.every((r) => r.met) && (
          <li className="text-[11px] text-emerald-500 flex items-center gap-1.5">
            <Check className="w-3 h-3 shrink-0" />
            Cumple todos los requisitos
          </li>
        )}
      </ul>
    </div>
  );
}
