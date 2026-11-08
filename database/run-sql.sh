#!/bin/bash
# Runs a .sql file from this folder against the app database.
# Executed INSIDE the SQL Server container (see the db:* scripts in the root package.json),
# where MSSQL_SA_PASSWORD and DB_NAME are already set by docker-compose.
#
# Usage: bash /database/run-sql.sh schema.sql
set -euo pipefail

FILE="/database/${1:?Usage: run-sql.sh <file.sql>}"

# -C: trust the self-signed certificate (local only)
# -b: stop and return an error code when a statement fails
# -f 65001: read the file as UTF-8 so Vietnamese text is stored correctly
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -f 65001 \
  -d "$DB_NAME" -i "$FILE"
