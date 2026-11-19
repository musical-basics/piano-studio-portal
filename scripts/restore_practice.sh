#!/bin/zsh
# Practice for docs/restore-studio.md: a throwaway stand-in for "a new Supabase
# project", made from Supabase's own Docker images (its Postgres 17.6.1.063, the
# live version, its sign-in server and its Storage server). Private network,
# data only in memory, ports on 127.0.0.1 only. Never touches the live studio.
#
#   scripts/restore_practice.sh up     # start it; prints what to source and run
#   scripts/restore_practice.sh down   # remove every container, the network and the key file
set -e
D=/usr/local/bin/docker
[[ -x $D ]] || D=$(command -v docker)
NET=studio-restore-practice
LABEL=musicalbasics.studio-restore-practice=1
T=${TMPDIR:-/tmp}
ENVFILE=${T%/}/studio-restore-practice.env

down() {
  local ids=$($D ps -aq --filter label=$LABEL)
  [[ -n $ids ]] && $D rm -fv ${=ids} >/dev/null
  $D network rm $NET >/dev/null 2>&1 || true
  rm -f $ENVFILE
  echo "practice stand-in removed (containers left: $($D ps -aq --filter label=$LABEL | wc -l | tr -d ' '))"
}

if [[ $1 == down ]]; then down; exit 0; fi
[[ $1 == up ]] || { echo "usage: $0 up|down"; exit 1; }
[[ -z $($D ps -aq --filter label=$LABEL) ]] || down

PW=$(openssl rand -hex 16)
JWT=$(openssl rand -hex 32)
mint() { python3 -I -c "
import base64,hashlib,hmac,json,sys,time
b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({'alg':'HS256','typ':'JWT'}).encode())
p=b(json.dumps({'iss':'studio-restore-practice','role':sys.argv[2],'iat':int(time.time()),'exp':int(time.time())+86400}).encode())
print((h+b'.'+p+b'.'+b(hmac.new(sys.argv[1].encode(),h+b'.'+p,hashlib.sha256).digest())).decode())" $JWT $1; }
SERVICE=$(mint service_role)

$D network create --label $LABEL $NET >/dev/null
$D run -d --label $LABEL --name $NET-db --network $NET --tmpfs /var/lib/postgresql/data:rw,size=2g \
  -e POSTGRES_PASSWORD=$PW -e JWT_SECRET=$JWT -e JWT_EXP=3600 public.ecr.aws/supabase/postgres:17.6.1.063 >/dev/null
for i in $(seq 1 120); do
  $D exec $NET-db pg_isready -h 127.0.0.1 -U supabase_admin -d postgres >/dev/null 2>&1 && break; sleep 1
done
sleep 3
$D exec -e PGPASSWORD=$PW $NET-db psql -h 127.0.0.1 -U supabase_admin -d postgres -q -c "
alter user postgres with password '$PW'; alter user supabase_auth_admin with password '$PW';
alter user supabase_storage_admin with password '$PW';"
# The sign-in server builds Supabase's auth tables, as in a new project.
$D run -d --label $LABEL --name $NET-auth --network $NET -p 127.0.0.1::9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgresql://supabase_auth_admin:$PW@$NET-db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://127.0.0.1:3000 -e GOTRUE_JWT_SECRET=$JWT -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  public.ecr.aws/supabase/gotrue:v2.185.0 >/dev/null
$D run -d --label $LABEL --name $NET-storage --network $NET -p 127.0.0.1::5000 --tmpfs /mnt:rw,size=1g \
  -e ANON_KEY=$(mint anon) -e SERVICE_KEY=$SERVICE -e AUTH_JWT_SECRET=$JWT -e PGRST_JWT_SECRET=$JWT \
  -e DATABASE_URL="postgresql://supabase_storage_admin:$PW@$NET-db:5432/postgres" \
  -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/mnt -e TENANT_ID=stub \
  -e STORAGE_S3_REGION=local -e REGION=local -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false \
  public.ecr.aws/supabase/storage-api:v1.33.5 >/dev/null
AUTH=$($D port $NET-auth 9999 | head -1 | sed 's/.*://')
STORAGE=$($D port $NET-storage 5000 | head -1 | sed 's/.*://')
for i in $(seq 1 90); do
  [[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$AUTH/health) == 200 &&
     $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$STORAGE/status) == 200 ]] && break; sleep 1
done
umask 077
cat > $ENVFILE <<EOF
export PGPASSWORD=$PW
export SUPABASE_SERVICE_KEY=$SERVICE
export PRACTICE_AUTH=http://127.0.0.1:$AUTH
export PRACTICE_STORAGE=http://127.0.0.1:$STORAGE
EOF
cat <<EOF
Practice stand-in is up (sign-in server :$AUTH, Storage :$STORAGE). Now:
  source $ENVFILE
  python3 scripts/restore_studio_db.py database --docker $NET-db --new-url \$PRACTICE_STORAGE
  python3 scripts/restore_studio_db.py storage --storage-url \$PRACTICE_STORAGE
  python3 scripts/restore_studio_db.py check --docker $NET-db
  scripts/restore_practice.sh down
EOF
