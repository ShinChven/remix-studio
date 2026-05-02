#!/bin/sh

echo "Running database migrations..."

if npx prisma migrate deploy; then
  echo "Migrations successful. Starting application..."
  # Use exec to replace the shell process with Node
  exec npm run start
else
  echo "====================================================="
  echo " ERROR: Prisma Migration Failed!"
  echo "====================================================="
  echo "The container is kept alive for debugging."
  echo "Please exec into the container to fix the issue:"
  echo "  docker exec -it <container_name> /bin/sh"
  echo "  npx prisma migrate resolve --applied <migration_name>"
  echo "====================================================="
  # This command keeps the container running indefinitely 
  # without consuming CPU, allowing you to jump in and debug.
  tail -f /dev/null
fi
