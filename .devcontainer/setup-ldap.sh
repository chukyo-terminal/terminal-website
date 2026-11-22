#!/bin/bash
# 開発用の LDAP (389ds) を初期化する。devcontainer の postCreateCommand から実行する。何度実行しても同じ結果になる。
#   - サフィックス (dc=cut,dc=gr,dc=jp) の作成と、パスワードの保存形式 (CRYPT-YESCRYPT) の設定 (cluvela の tools/ldap_setup.sh と同じ結果)
#   - cluvela の開発用データ (res/ldifs。スキーマ拡張・組織・サービスアカウント・開発用の会員) の投入
# dsconf は Debian のパッケージにある設定ファイル (defaults.inf) が無いため使えない。サフィックスは cn=config に直接追加する。
# LDIF は親ディレクトリの cluvela (/workspaces/cluvela/res/ldifs) から読む。投入済みの場合は何もしない。
set -uo pipefail

SUFFIX="${LDAP_SUFFIX:-dc=cut,dc=gr,dc=jp}"
URI="${LDAP_URI:-ldap://ldap:3389}"
DM_DN="cn=Directory Manager"
DM_PASSWORD="${LDAP_DM_PASSWORD:-389ds}"
LDIF_DIR="${LDIF_DIR:-$(dirname "$0")/../../cluvela/res/ldifs}"

ldap_search() {
  ldapsearch -x -H "$URI" -D "$DM_DN" -w "$DM_PASSWORD" "$@"
}

ldap_modify() {
  ldapmodify -a -x -H "$URI" -D "$DM_DN" -w "$DM_PASSWORD" -f "$1" >/dev/null
}

# 起動を待つ
echo "LDAP の起動を待っています（$URI）..."
ready=0
for _ in $(seq 1 90); do
  if ldap_search -s base -b '' dn >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" != 1 ]; then
  echo "LDAP に接続できません: $URI" >&2
  exit 1
fi

# サフィックス（バックエンド）の作成。既にあれば何もしない
if ! ldap_search -s base -b "$SUFFIX" dn 2>/dev/null | grep -q '^dn:'; then
  echo "サフィックス $SUFFIX を作成します"
  backend_ldif="$(mktemp)"
  first_rdn="${SUFFIX%%,*}"
  cat > "$backend_ldif" <<LDIF
dn: cn=userRoot,cn=ldbm database,cn=plugins,cn=config
objectClass: top
objectClass: extensibleObject
objectClass: nsBackendInstance
cn: userRoot
nsslapd-suffix: $SUFFIX

dn: cn="$SUFFIX",cn=mapping tree,cn=config
objectClass: top
objectClass: extensibleObject
objectClass: nsMappingTree
cn: $SUFFIX
nsslapd-state: backend
nsslapd-backend: userRoot

dn: $SUFFIX
objectClass: top
objectClass: domain
dc: ${first_rdn#dc=}
LDIF
  ldap_modify "$backend_ldif" || { echo "サフィックスを作成できませんでした" >&2; rm -f "$backend_ldif"; exit 1; }
  rm -f "$backend_ldif"
fi

# パスワードの保存形式（389ds が対応する最も安全なメモリハード関数の yescrypt）
pwpolicy_ldif="$(mktemp)"
cat > "$pwpolicy_ldif" <<'LDIF'
dn: cn=config
changetype: modify
replace: passwordStorageScheme
passwordStorageScheme: CRYPT-YESCRYPT
LDIF
ldap_modify "$pwpolicy_ldif" || echo "警告: パスワードの保存形式を設定できませんでした" >&2
rm -f "$pwpolicy_ldif"

# 投入済みなら何もしない（スキーマの追加は2回目に失敗する）
if ldap_search -s base -b "ou=services,$SUFFIX" dn 2>/dev/null | grep -q '^dn:'; then
  echo "LDAP のデータは投入済みです。"
  exit 0
fi

if [ ! -d "$LDIF_DIR" ]; then
  echo "cluvela の LDIF が見つかりません（$LDIF_DIR）。親ディレクトリに cluvela を配置してから、.devcontainer/setup-ldap.sh を実行してください。" >&2
  exit 1
fi

# ファイル名の順（00 スキーマ拡張 → 01 組織・サービスアカウント → 10・2x 組織 → 90 開発用の会員）に投入する
for file in "$LDIF_DIR"/*.ldif; do
  echo "投入: $(basename "$file")"
  if ! ldap_modify "$file"; then
    echo "投入に失敗しました: $(basename "$file")" >&2
    exit 1
  fi
done
echo "完了しました。開発用の会員（学籍番号 T999901 など。パスワードは password）でログインできます。"
