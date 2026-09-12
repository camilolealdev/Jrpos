# Postgres con el script de creación del rol de aplicación ya integrado en la
# imagen — necesario para plataformas de deploy (p.ej. Hostinger Docker
# Manager) que solo aceptan la definición de compose y no clonan el repo, por
# lo que un bind mount relativo (./docker/postgres-init.sh) no resuelve a
# ningún archivo real en su host.
FROM postgres:16-alpine
COPY postgres-init.sh /docker-entrypoint-initdb.d/01-app-role.sh
