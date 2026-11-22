import { normalizeDn } from '@/lib/organization';

import type { Authority, Organization, Person } from '@/lib/organization';


/**
 * レビューの経路。
 *
 * - `ordinary`: 通常の記事。課長（担当課）→ 局長・執行委員のいずれか の順に承認する
 * - `organizational`: 組織運営に関する記事。会長・運営監査のいずれか1名が承認する
 */
export type ReviewRoute = 'ordinary' | 'organizational';


/**
 * 依頼時に執筆者が選ぶ内容。
 */
export type ReviewSubmission = {
  /** 担当課の DN（通常の記事で必要） */
  divisionDn: string | null;
  /** 組織運営に関する記事かどうか（執行委員会のメンバーのみ執筆できる） */
  isOrganizational: boolean;
};


/**
 * 依頼の経路を決めた結果。
 */
export type RoutePlan = {
  route: ReviewRoute;
  divisionDn: string | null;
};


/**
 * 判定の結果。失敗した場合は利用者に表示する理由を持つ。
 */
type Result<T> = { ok: true; value: T } | { ok: false; error: string };


/**
 * 人の一覧から、学籍番号が重複しないものだけを残す。
 *
 * @param people - 人の一覧（空要素を含んでもよい）
 * @returns 重複のない人の一覧
 */
function uniquePeople(people: readonly (Person | null)[]): Person[] {
  const seen = new Set<string>();
  const result: Person[] = [];
  for (const person of people) {
    if (person && !seen.has(person.cuId)) {
      seen.add(person.cuId);
      result.push(person);
    }
  }
  return result;
}


/**
 * 学籍番号の人が執行委員会のメンバー（執行委員。会長・副会長などを含む）かどうかを判定する。
 *
 * @param organization - 組織の情報
 * @param cuId - 学籍番号
 * @returns 執行委員会のメンバーの場合は `true`
 */
export function isExecutive(organization: Organization, cuId: string): boolean {
  return organization.executives.some((authority) => authority.holder?.cuId === cuId);
}


/**
 * 通常の記事の第1段階（課長）の承認者を決める。
 *
 * 課長が執筆者の場合は、その代理（副課長）が承認する。代理がいない場合は依頼できない。
 *
 * @param organization - 組織の情報
 * @param authorCuId - 執筆者の学籍番号
 * @param divisionDn - 担当課の DN
 * @returns 承認できる人の一覧
 */
export function getStage1Reviewers(
  organization: Organization,
  authorCuId: string,
  divisionDn: string,
): Result<Person[]> {
  const division = organization.divisions.find((candidate) => candidate.dn === normalizeDn(divisionDn));
  if (!division) {
    return { ok: false, error: '選択した担当課が見つかりません。' };
  }
  const chief = division.chief.holder;
  if (!chief) {
    return { ok: false, error: `${division.name}の課長が決まっていないため、依頼できません。` };
  }
  if (chief.cuId !== authorCuId) {
    return { ok: true, value: [chief] };
  }
  const deputies = division.chief.deputies.filter((person) => person.cuId !== authorCuId);
  if (deputies.length === 0) {
    return {
      ok: false,
      error: '担当課の課長が執筆者のため、代理（副課長）が登録されていないので依頼できません。',
    };
  }
  return { ok: true, value: deputies };
}


/**
 * 通常の記事の第2段階（局長・執行委員）の承認者を決める。
 *
 * 執筆者が局長・執行委員で代理がいる場合は、その代理だけが承認できる。
 * それ以外は、局長と執行委員のうち、執筆者と第1段階で承認した人以外の全員が承認できる。
 *
 * @param organization - 組織の情報
 * @param authorCuId - 執筆者の学籍番号
 * @param excludedCuIds - 承認できない人の学籍番号（第1段階で承認した人など）
 * @returns 承認できる人の一覧
 */
export function getStage2Reviewers(
  organization: Organization,
  authorCuId: string,
  excludedCuIds: readonly string[],
): Person[] {
  const excluded = new Set([authorCuId, ...excludedCuIds]);
  const pool: Authority[] = [...organization.directors, ...organization.executives];
  const ownAuthority = pool.find((authority) => authority.holder?.cuId === authorCuId);
  if (ownAuthority && ownAuthority.deputies.length > 0) {
    return uniquePeople(ownAuthority.deputies).filter((person) => !excluded.has(person.cuId));
  }
  return uniquePeople(pool.map((authority) => authority.holder))
    .filter((person) => !excluded.has(person.cuId));
}


/**
 * 組織運営に関する記事の承認者（会長・運営監査のいずれか1名）を決める。
 *
 * @param organization - 組織の情報
 * @param authorCuId - 執筆者の学籍番号
 * @returns 承認できる人の一覧
 */
export function getOrganizationalReviewers(organization: Organization, authorCuId: string): Person[] {
  return uniquePeople([organization.president.holder, organization.operationalAuditor])
    .filter((person) => person.cuId !== authorCuId);
}


/**
 * 依頼の経路を決める。依頼時に、担当課の承認者がいるか（依頼先があるか）も確かめる。
 *
 * - 組織運営に関する記事は執行委員会のメンバーのみが執筆できる。会長が執筆する場合は通常の経路になる
 * - 通常の記事は担当課が必要
 *
 * @param organization - 組織の情報
 * @param authorCuId - 執筆者の学籍番号
 * @param submission - 依頼時に選んだ内容
 * @returns 経路。依頼できない場合は理由
 */
export function planReviewRoute(
  organization: Organization,
  authorCuId: string,
  submission: ReviewSubmission,
): Result<RoutePlan> {
  if (submission.isOrganizational && !isExecutive(organization, authorCuId)) {
    return { ok: false, error: '組織運営に関する記事は、執行委員会のメンバーのみが執筆できます。' };
  }
  if (submission.isOrganizational && organization.president.holder?.cuId !== authorCuId) {
    if (getOrganizationalReviewers(organization, authorCuId).length === 0) {
      return { ok: false, error: '組織運営に関する記事を承認できる会長・運営監査が決まっていません。' };
    }
    return { ok: true, value: { route: 'organizational', divisionDn: null } };
  }
  if (!submission.divisionDn) {
    return { ok: false, error: '担当課を選択してください。' };
  }
  const stage1 = getStage1Reviewers(organization, authorCuId, submission.divisionDn);
  if (!stage1.ok) {
    return stage1;
  }
  return { ok: true, value: { route: 'ordinary', divisionDn: submission.divisionDn } };
}


/**
 * 依頼の現在の段階で、承認できる人の一覧を返す（承認時の判定と、承認者の一覧の表示に使う）。
 *
 * @param organization - 組織の情報
 * @param request - 依頼の経路・段階・執筆者・担当課
 * @param previousApproverCuIds - この依頼で既に承認した人の学籍番号
 * @returns 承認できる人の一覧
 */
export function getCurrentReviewers(
  organization: Organization,
  request: { route: string; stage: number; authorCuId: string; divisionDn: string | null },
  previousApproverCuIds: readonly string[],
): Person[] {
  if (request.route === 'organizational') {
    return getOrganizationalReviewers(organization, request.authorCuId);
  }
  if (request.stage === 1) {
    if (!request.divisionDn) {
      return [];
    }
    const result = getStage1Reviewers(organization, request.authorCuId, request.divisionDn);
    return result.ok ? result.value : [];
  }
  return getStage2Reviewers(organization, request.authorCuId, previousApproverCuIds);
}


/**
 * 依頼の段階を表す表示名。
 *
 * @param route - 経路
 * @param stage - 段階
 * @returns 表示名（例: `課長の確認待ち`）
 */
export function describeReviewStage(route: string, stage: number): string {
  if (route === 'organizational') {
    return '会長・運営監査の確認待ち';
  }
  return stage === 1 ? '課長の確認待ち' : '局長・執行委員の確認待ち';
}
