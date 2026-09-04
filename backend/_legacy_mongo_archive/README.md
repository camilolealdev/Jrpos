# Archivo — backend legado sobre MongoDB

`server.py` fue la primera versión de la API de JRPOS, construida sobre MongoDB (Motor Async)
durante el prototipado inicial en emergent.sh. Quedó reemplazada por completo por `backend/app.py`
más `backend/routers/*.py` (PostgreSQL vía Supabase, arquitectura modular), que es el único backend
que corre en producción (Vercel) hoy.

Este archivo se conserva solo como referencia histórica. **No se importa ni se ejecuta desde
ningún punto activo del proyecto** — ningún `Procfile`, `Dockerfile` ni `railway.json` lo apunta.
No tiene las funcionalidades ni fixes de los últimos meses (reset de contraseña de admin, RBAC,
etc.) y sus dependencias (`pymongo`, `motor`) ya no están en `requirements.txt`.

Si necesitas correrlo por alguna razón, instala `pymongo`/`motor` aparte y define `MONGO_URL` y
`DB_NAME` en el entorno.
