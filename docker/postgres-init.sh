#!/bin/sh
set -e

# Postgres crea el POSTGRES_USER bootstrap SIEMPRE como superusuario (no se le
# puede quitar despues: ALTER ROLE ... NOSUPERUSER falla contra el bootstrap
# user), y un superusuario ignora Row-Level Security sin importar
# FORCE ROW LEVEL SECURITY. Por eso el backend NO se conecta con ese rol para
# trafico normal -- se conecta con este segundo rol, sin privilegios de
# superusuario, para que las politicas RLS de backend/db_migrations.py
# apliquen de verdad. Solo corre en un volumen nuevo (Postgres solo ejecuta
# /docker-entrypoint-initdb.d en el primer arranque de un volumen vacio).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
		IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${POSTGRES_APP_USER:-jrpos_app}') THEN
			CREATE ROLE ${POSTGRES_APP_USER:-jrpos_app} WITH LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
		END IF;
	END
	\$\$;
	GRANT ALL ON SCHEMA public TO ${POSTGRES_APP_USER:-jrpos_app};
	GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO ${POSTGRES_APP_USER:-jrpos_app};
EOSQL
