#!/bin/bash
set -e

# Wait for PostgreSQL
until curl -s http://postgres:5432/ > /dev/null 2>&1 || [ $? -eq 52 ]; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

echo "PostgreSQL is up - executing command"

# Execute the main command (uvicorn or celery)
exec "$@"
