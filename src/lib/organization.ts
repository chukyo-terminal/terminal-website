import {
  findStudentIdFromCodes,
  getLdapBaseDn,
  isDisabledMembershipStatus,
  searchDirectory,
  toFirstString,
  toStrings,
} from '@/lib/ldap';


/**
 * 組織の情報（役職の在任者）の取得結果を保存する期間（ms）。
 *
 * 役職の交代は、この期間が過ぎた後の操作から反映される。
 */
const CACHE_TTL = 5 * 60 * 1000;


/**
 * `globalThis` に組織の情報を保存するキー（ページと Server Action は別々にバンドルされるため）。
 */
const CACHE_KEY = Symbol.for('terminal-website.organization');


/**
 * 会員（役職の在任者）。
 */
export type Person = {
  /** 学籍番号（CU_ID） */
  cuId: string;
  /** 氏名 */
  name: string;
};


/**
 * 役職とその代理。役職の在任者がいない場合は `holder` が `null`。
 */
export type Authority = {
  /** 役職の在任者 */
  holder: Person | null;
  /** 代理（`deputyOfRole` でこの役職を指している役職の在任者。例: 副課長・副局長・副会長） */
  deputies: Person[];
};


/**
 * 課（担当課として選べる単位。課長が承認する）。
 */
export type Division = {
  /** 課の DN（正規化済み） */
  dn: string;
  /** 表示名（例: `開発局 システム開発課`） */
  name: string;
  /** 課長（`cn=chief`） */
  chief: Authority;
};


/**
 * 組織の情報。
 */
export type Organization = {
  /** 課 */
  divisions: Division[];
  /** 局長（`cn=director`）と、その代理 */
  directors: Authority[];
  /** 執行委員（`ou=executive-ctte` の役職。会長・副会長などを含む） */
  executives: Authority[];
  /** 会長（`cn=president`）と、その代理（副会長） */
  president: Authority;
  /** 運営監査（`cn=operational-auditor`） */
  operationalAuditor: Person | null;
};


/**
 * LDAP の組織の情報を読み込んだ直後の、役職のデータ。
 */
type RawRole = {
  dn: string;
  cn: string;
  parentDn: string;
  occupantDns: string[];
  deputyOfDn: string | null;
};


/**
 * LDAP の組織の情報を読み込んだ直後の、部署（組織単位）のデータ。
 */
type RawUnit = {
  dn: string;
  name: string;
  parentDn: string;
};


/**
 * DN を比較できる形式にする（大文字小文字と、区切りの周りの空白を無視する）。
 *
 * @param dn - DN
 * @returns 正規化した DN
 */
export function normalizeDn(dn: string): string {
  return dn.split(',').map((part) => part.trim().toLowerCase()).join(',');
}


/**
 * DN の親（最初の RDN を除いた DN）を返す。
 *
 * @param dn - 正規化した DN
 * @returns 親の DN
 */
function parentOf(dn: string): string {
  return dn.slice(dn.indexOf(',') + 1);
}


/**
 * 組織の情報を LDAP から読み込む（キャッシュを使う）。
 *
 * 組織の構造は `ou=organization` 以下に、局（`ou` 直下）・課（局の直下）・役職（`organizationalRole`）として登録されている。
 * 役職の在任者（`roleOccupant`）は `ou=people` の会員で、退会・除名の会員は在任者として扱わない。
 *
 * @returns 組織の情報
 * @throws LDAP に接続できない場合など
 */
export async function loadOrganization(): Promise<Organization> {
  const store = globalThis as unknown as Record<symbol, { value: Organization; expiresAt: number } | undefined>;
  const cached = store[CACHE_KEY];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = await fetchOrganization();
  store[CACHE_KEY] = { value, expiresAt: Date.now() + CACHE_TTL };
  return value;
}


/**
 * 組織の情報を LDAP から読み込んで整理する（キャッシュは使わない）。
 *
 * @returns 組織の情報
 */
async function fetchOrganization(): Promise<Organization> {
  const baseDn = getLdapBaseDn();
  const orgDn = normalizeDn(`ou=organization,${baseDn}`);
  const executiveDn = normalizeDn(`ou=executive-ctte,cn=board,${orgDn}`);
  const auditDn = normalizeDn(`ou=audit-ctte,cn=board,${orgDn}`);

  const [unitEntries, roleEntries, peopleEntries] = await Promise.all([
    searchDirectory('ou=organization', {
      scope: 'sub',
      filter: '(objectClass=organizationalUnit)',
      attributes: ['ou', 'ou;lang-ja'],
    }),
    searchDirectory('ou=organization', {
      scope: 'sub',
      filter: '(objectClass=organizationalRole)',
      attributes: ['cn', 'roleOccupant', 'deputyOfRole'],
    }),
    searchDirectory('ou=people', {
      scope: 'sub',
      filter: '(objectClass=inetOrgPerson)',
      attributes: ['cn;lang-ja', 'cn', 'schacPersonalUniqueCode', 'cutMembershipStatus'],
    }),
  ]);

  // 会員（DN → 学籍番号と氏名）。退会・除名の会員は在任者にしない
  const people = new Map<string, Person>();
  for (const entry of peopleEntries) {
    if (isDisabledMembershipStatus(toFirstString(entry.cutMembershipStatus))) {
      continue;
    }
    const cuId = findStudentIdFromCodes(toStrings(entry.schacPersonalUniqueCode));
    if (cuId) {
      people.set(normalizeDn(entry.dn), {
        cuId,
        name: toFirstString(entry['cn;lang-ja']) || toFirstString(entry.cn) || cuId,
      });
    }
  }

  const units: RawUnit[] = unitEntries.map((entry) => ({
    dn: normalizeDn(entry.dn),
    name: toFirstString(entry['ou;lang-ja']) || toFirstString(entry.ou),
    parentDn: parentOf(normalizeDn(entry.dn)),
  }));
  const roles: RawRole[] = roleEntries.map((entry) => {
    const deputyOf = toFirstString(entry.deputyOfRole);
    return {
      dn: normalizeDn(entry.dn),
      cn: toFirstString(entry.cn).toLowerCase(),
      parentDn: parentOf(normalizeDn(entry.dn)),
      occupantDns: toStrings(entry.roleOccupant).map((value) => normalizeDn(value)),
      deputyOfDn: deputyOf ? normalizeDn(deputyOf) : null,
    };
  });

  const bureauDns = new Set(units.filter((unit) => unit.parentDn === orgDn).map((unit) => unit.dn));
  const holderOf = (role: RawRole): Person | null => {
    for (const occupantDn of role.occupantDns) {
      const person = people.get(occupantDn);
      if (person) {
        return person;
      }
    }
    return null;
  };
  const authorityOf = (role: RawRole | undefined): Authority => {
    if (!role) {
      return { holder: null, deputies: [] };
    }
    const deputies = roles
      .filter((candidate) => candidate.deputyOfDn === role.dn)
      .map((candidate) => holderOf(candidate))
      .filter((person): person is Person => person !== null);
    return { holder: holderOf(role), deputies };
  };

  const divisions: Division[] = units
    .filter((unit) => bureauDns.has(unit.parentDn))
    .map((unit) => {
      const bureau = units.find((candidate) => candidate.dn === unit.parentDn);
      const chief = roles.find((role) => role.parentDn === unit.dn && role.cn === 'chief');
      return {
        dn: unit.dn,
        name: bureau ? `${bureau.name} ${unit.name}` : unit.name,
        chief: authorityOf(chief),
      };
    });

  const directors: Authority[] = [...bureauDns]
    .map((bureauDn) => roles.find((role) => role.parentDn === bureauDn && role.cn === 'director'))
    .filter((role): role is RawRole => role !== undefined)
    .map((role) => authorityOf(role))
    .filter((authority) => authority.holder !== null);

  const executives: Authority[] = roles
    .filter((role) => role.parentDn === executiveDn)
    .map((role) => authorityOf(role))
    .filter((authority) => authority.holder !== null);

  const president = authorityOf(roles.find((role) => role.parentDn === executiveDn && role.cn === 'president'));
  const auditor = roles.find((role) => role.parentDn === auditDn && role.cn === 'operational-auditor');

  return {
    divisions: divisions.toSorted((a, b) => a.name.localeCompare(b.name, 'ja')),
    directors,
    executives,
    president,
    operationalAuditor: auditor ? holderOf(auditor) : null,
  };
}
