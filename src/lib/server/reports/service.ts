import type { AuthUser } from '../auth/service';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import type { TaskStatus, TaskType } from '../tasks/service';

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  statuses?: TaskStatus[];
  taskType?: TaskType;
  userId?: string;
};

export type ReportTask = {
  id: string;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  deadline: string;
  completed_at: string | null;
  eval_result: 'PASS' | 'FAIL' | null;
  eval_comment: string | null;
  proposer_name: string;
  lead_name: string | null;
  member_count: number;
  avg_progress: number | null;
  overdue: boolean;
};

export type PersonReport = {
  user_id: string;
  full_name: string;
  parts: number;
  completed: number;
  avg_progress: number | null;
  passed: number;
  failed: number;
  overdue_parts: number;
  led_total: number;
  led_passed: number;
  led_failed: number;
};

export type OverviewTask = {
  id: string;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  deadline: string;
  lead_name: string | null;
  proposer_name: string;
  avg_progress: number | null;
};

export type WorkPart = {
  member_id: string;
  task_id: string;
  title: string;
  status: TaskStatus;
  task_type: TaskType;
  deadline: string;
  content: string;
  quantity: string | number | null;
  unit: string | null;
  done_quantity: string | number | null;
  progress: number;
  result_report: string | null;
  lead_name: string | null;
  overdue: boolean;
};

export type LeadingTask = {
  id: string;
  title: string;
  status: TaskStatus;
  deadline: string;
  member_count: number;
  avg_progress: number | null;
  overdue: boolean;
};

export type ProposedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  deadline: string;
  reject_reason: string | null;
  overdue: boolean;
};

export type WorkOverview = {
  parts: WorkPart[];
  leading: LeadingTask[];
  proposed: ProposedTask[];
};

export type DashboardOverview = {
  today: string;
  statusCounts: Record<TaskStatus, number>;
  total: number;
  overdue: OverviewTask[];
  dueSoon: OverviewTask[];
  averageProgress: number | null;
  workload: Array<{
    user_id: string;
    full_name: string;
    active_parts: number;
    done_parts: number;
    avg_progress: number | null;
    overdue_parts: number;
    leading: number;
  }>;
  pendingApprovals: number;
  pendingEvaluations: number;
  needsAttention: Array<{
    id: string;
    task_id: string;
    title: string;
    task_type: TaskType;
    status: TaskStatus;
    deadline: string;
    progress: number | null;
  }>;
};

export type ReportErrorCode = 'FORBIDDEN' | 'VALIDATION';
export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ReportError';
  }
}

const OPEN_STATUSES: TaskStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REJECTED',
  'IN_PROGRESS'
];
const EXECUTED_STATUSES: TaskStatus[] = [
  'IN_PROGRESS',
  'REPORTED',
  'PASSED',
  'FAILED'
];
const VALID_STATUSES: TaskStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REJECTED',
  'IN_PROGRESS',
  'REPORTED',
  'PASSED',
  'FAILED'
];
const VALID_TYPES: TaskType[] = ['DIRECT', 'TEAM', 'PERSONAL'];

type UserRow = { id: string; role: string; is_active: boolean };
type RawRow = Record<string, unknown>;
type OverviewTaskRow = {
  id: string | number;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  deadline: string | Date;
  lead_name: string | null;
  proposer_name: string;
  avg_progress: number | null;
};
type WorkloadRow = {
  user_id: string | number;
  full_name: string;
  active_parts: number;
  done_parts: number;
  avg_progress: number | null;
  overdue_parts: number;
  leading: number;
};
type NeedsAttentionRow = {
  id: string | number;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  deadline: string | Date;
  progress: number | null;
};
type WorkPartRow = {
  member_id: string | number;
  task_id: string | number;
  content: string;
  quantity: string | number | null;
  unit: string | null;
  done_quantity: string | number | null;
  progress: number;
  result_report: string | null;
  lead_comment: string | null;
  title: string;
  status: TaskStatus;
  task_type: TaskType;
  deadline: string | Date;
  lead_name: string | null;
};
type LeadingTaskRow = {
  id: string | number;
  title: string;
  status: TaskStatus;
  deadline: string | Date;
  member_count: number;
  avg_progress: number | null;
};
type ProposedTaskRow = {
  id: string | number;
  title: string;
  status: TaskStatus;
  deadline: string | Date;
  reject_reason: string | null;
};

const dateValue = (value: string | Date): string =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

const todayVietnam = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (isoDate: string, days: number): string => {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const validateDate = (
  value: string | undefined,
  label: string
): string | undefined => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ReportError('VALIDATION', `${label} không hợp lệ.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ReportError('VALIDATION', `${label} không hợp lệ.`);
  }
  return value;
};

const assertActive = async (
  db: QueryExecutor,
  actor: AuthUser
): Promise<void> => {
  const { rows } = await db.query<UserRow>(
    'SELECT id, role, is_active FROM users WHERE id = $1',
    [actor.id]
  );
  if (!rows[0]?.is_active || rows[0].role !== actor.role) {
    throw new ReportError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
  }
};

const safeCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

const csvQuote = (value: unknown): string => {
  const text = safeCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const createReportService = (
  database: TransactionalDatabase,
  now: () => Date = () => new Date()
) => {
  const today = () => todayVietnam(now());

  const overview = async (actor: AuthUser): Promise<DashboardOverview> => {
    await assertActive(database, actor);
    const currentDay = today();
    const [
      countsResult,
      overdueResult,
      dueSoonResult,
      averageResult,
      workloadResult,
      managerQueueResult
    ] = await Promise.all([
      database.query<{ status: TaskStatus; count: number }>(
        'SELECT status, count(*)::int AS count FROM tasks GROUP BY status'
      ),
      database.query<OverviewTaskRow>(
        `SELECT t.id, t.title, t.task_type, t.status, t.deadline, l.full_name AS lead_name,
          p.full_name AS proposer_name, avg(m.progress)::float AS avg_progress
         FROM tasks t JOIN users p ON p.id = t.proposer_id
         LEFT JOIN users l ON l.id = t.lead_id LEFT JOIN task_members m ON m.task_id = t.id
         WHERE t.status = ANY($1::text[]) AND t.deadline < $2::date
         GROUP BY t.id, p.full_name, l.full_name ORDER BY t.deadline, t.id LIMIT 100`,
        [OPEN_STATUSES, currentDay]
      ),
      database.query<OverviewTaskRow>(
        `SELECT t.id, t.title, t.task_type, t.status, t.deadline, l.full_name AS lead_name,
          p.full_name AS proposer_name, avg(m.progress)::float AS avg_progress
         FROM tasks t JOIN users p ON p.id = t.proposer_id
         LEFT JOIN users l ON l.id = t.lead_id LEFT JOIN task_members m ON m.task_id = t.id
         WHERE t.status = 'IN_PROGRESS' AND t.deadline BETWEEN $1::date AND $2::date
         GROUP BY t.id, p.full_name, l.full_name ORDER BY t.deadline, t.id LIMIT 100`,
        [currentDay, addDays(currentDay, 7)]
      ),
      database.query<{ average: number | null }>(
        "SELECT avg(m.progress)::float AS average FROM task_members m JOIN tasks t ON t.id = m.task_id WHERE t.status = 'IN_PROGRESS'"
      ),
      database.query<WorkloadRow>(
        `SELECT u.id AS user_id, u.full_name,
          count(m.id) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS active_parts,
          count(m.id) FILTER (WHERE t.status = 'IN_PROGRESS' AND m.progress = 100)::int AS done_parts,
          avg(m.progress) FILTER (WHERE t.status = 'IN_PROGRESS')::float AS avg_progress,
          count(m.id) FILTER (WHERE t.status = 'IN_PROGRESS' AND t.deadline < $1::date)::int AS overdue_parts,
          count(DISTINCT t.id) FILTER (WHERE t.status = 'IN_PROGRESS' AND t.task_type = 'TEAM' AND t.lead_id = u.id)::int AS leading
         FROM users u LEFT JOIN task_members m ON m.user_id = u.id LEFT JOIN tasks t ON t.id = m.task_id
         WHERE u.is_active = true AND u.role IN ('MANAGER', 'STAFF')
         GROUP BY u.id, u.full_name ORDER BY lower(u.full_name), u.id`,
        [currentDay]
      ),
      actor.role === 'MANAGER'
        ? database.query<{
            pending_approvals: number;
            pending_evaluations: number;
          }>(
            `SELECT count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_approvals,
              count(*) FILTER (WHERE status = 'REPORTED')::int AS pending_evaluations FROM tasks`
          )
        : Promise.resolve({
            rows: [{ pending_approvals: 0, pending_evaluations: 0 }]
          })
    ]);

    const counts = Object.fromEntries(
      VALID_STATUSES.map((status) => [status, 0])
    ) as Record<TaskStatus, number>;
    for (const row of countsResult.rows) counts[row.status] = row.count;
    const taskDto = (row: OverviewTaskRow): OverviewTask => ({
      ...row,
      id: String(row.id),
      deadline: dateValue(row.deadline as string | Date),
      avg_progress: row.avg_progress === null ? null : Number(row.avg_progress)
    });
    const workload = workloadResult.rows.map((row) => ({
      ...row,
      user_id: String(row.user_id),
      active_parts: Number(row.active_parts),
      done_parts: Number(row.done_parts),
      avg_progress: row.avg_progress === null ? null : Number(row.avg_progress),
      overdue_parts: Number(row.overdue_parts),
      leading: Number(row.leading)
    }));
    const queue = managerQueueResult.rows[0];
    const related = await database.query<NeedsAttentionRow>(
      `SELECT t.id, t.title, t.status, t.task_type, t.deadline, m.progress
       FROM tasks t LEFT JOIN task_members m ON m.task_id = t.id
       WHERE (t.proposer_id = $1 AND t.status IN ('DRAFT', 'REJECTED'))
          OR (t.lead_id = $1 AND t.status IN ('IN_PROGRESS', 'REPORTED'))
          OR (m.user_id = $1 AND t.status = 'IN_PROGRESS')
         OR ($2::boolean AND t.status IN ('PENDING_APPROVAL', 'REPORTED'))
       ORDER BY t.deadline, t.id LIMIT 12`,
      [actor.id, actor.role === 'MANAGER']
    );
    return {
      today: currentDay,
      statusCounts: counts,
      total: Object.values(counts).reduce((total, count) => total + count, 0),
      overdue: overdueResult.rows.map(taskDto),
      dueSoon: dueSoonResult.rows.map(taskDto),
      averageProgress: averageResult.rows[0]?.average ?? null,
      workload,
      pendingApprovals: Number(queue?.pending_approvals ?? 0),
      pendingEvaluations: Number(queue?.pending_evaluations ?? 0),
      needsAttention: related.rows.map((row) => ({
        ...row,
        id: String(row.id),
        task_id: String(row.id),
        deadline: dateValue(row.deadline as string | Date)
      }))
    };
  };

  const myWork = async (actor: AuthUser): Promise<WorkOverview> => {
    await assertActive(database, actor);
    const [parts, leading, proposed] = await Promise.all([
      database.query<WorkPartRow>(
        `SELECT m.id AS member_id, m.content, m.quantity, m.unit, m.done_quantity,
          m.progress, m.result_report, m.lead_comment, t.id AS task_id, t.title,
          t.status, t.task_type, t.deadline, l.full_name AS lead_name
         FROM task_members m JOIN tasks t ON t.id = m.task_id LEFT JOIN users l ON l.id = t.lead_id
         WHERE m.user_id = $1 AND t.status IN ('IN_PROGRESS', 'REPORTED') ORDER BY t.deadline, t.id`,
        [actor.id]
      ),
      database.query<LeadingTaskRow>(
        `SELECT t.id, t.title, t.status, t.deadline, count(m.id)::int AS member_count,
          avg(m.progress)::float AS avg_progress FROM tasks t LEFT JOIN task_members m ON m.task_id = t.id
         WHERE t.lead_id = $1 AND t.task_type = 'TEAM' AND t.status IN ('IN_PROGRESS', 'REPORTED')
         GROUP BY t.id ORDER BY t.deadline, t.id`,
        [actor.id]
      ),
      database.query<ProposedTaskRow>(
        `SELECT id, title, status, deadline, reject_reason FROM tasks
         WHERE proposer_id = $1 AND status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED')
         ORDER BY updated_at DESC, id DESC`,
        [actor.id]
      )
    ]);
    const overdueDate = today();
    return {
      parts: parts.rows.map((row) => ({
        ...row,
        member_id: String(row.member_id),
        task_id: String(row.task_id),
        deadline: dateValue(row.deadline as string | Date),
        overdue:
          OPEN_STATUSES.includes(row.status as TaskStatus) &&
          dateValue(row.deadline as string | Date) < overdueDate
      })),
      leading: leading.rows.map((row) => ({
        ...row,
        id: String(row.id),
        deadline: dateValue(row.deadline as string | Date),
        member_count: Number(row.member_count),
        avg_progress:
          row.avg_progress === null ? null : Number(row.avg_progress),
        overdue: dateValue(row.deadline as string | Date) < overdueDate
      })),
      proposed: proposed.rows.map((row) => ({
        ...row,
        id: String(row.id),
        deadline: dateValue(row.deadline as string | Date),
        overdue: dateValue(row.deadline as string | Date) < overdueDate
      }))
    };
  };

  const taskReport = async (
    actor: AuthUser,
    filters: ReportFilters = {}
  ): Promise<ReportTask[]> => {
    await assertActive(database, actor);
    const dateFrom = validateDate(filters.dateFrom, 'Từ ngày');
    const dateTo = validateDate(filters.dateTo, 'Đến ngày');
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw new ReportError(
        'VALIDATION',
        'Từ ngày phải trước hoặc bằng Đến ngày.'
      );
    for (const status of filters.statuses ?? [])
      if (!VALID_STATUSES.includes(status))
        throw new ReportError('VALIDATION', 'Trạng thái không hợp lệ.');
    if (filters.taskType && !VALID_TYPES.includes(filters.taskType))
      throw new ReportError('VALIDATION', 'Loại công việc không hợp lệ.');

    const where: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (dateFrom) where.push(`t.deadline >= ${bind(dateFrom)}::date`);
    if (dateTo) where.push(`t.deadline <= ${bind(dateTo)}::date`);
    if (filters.statuses?.length)
      where.push(`t.status = ANY(${bind(filters.statuses)}::text[])`);
    if (filters.taskType) where.push(`t.task_type = ${bind(filters.taskType)}`);
    if (filters.userId) {
      const userId = bind(filters.userId);
      where.push(
        `(t.proposer_id = ${userId} OR t.lead_id = ${userId} OR EXISTS (SELECT 1 FROM task_members mine WHERE mine.task_id = t.id AND mine.user_id = ${userId}))`
      );
    }
    const { rows } = await database.query<RawRow>(
      `SELECT t.id, t.title, t.task_type, t.status, t.deadline, t.completed_at,
        t.eval_result, t.eval_comment, p.full_name AS proposer_name, l.full_name AS lead_name,
        count(DISTINCT m.id)::int AS member_count, avg(m.progress)::float AS avg_progress
       FROM tasks t JOIN users p ON p.id = t.proposer_id LEFT JOIN users l ON l.id = t.lead_id
       LEFT JOIN task_members m ON m.task_id = t.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY t.id, p.full_name, l.full_name ORDER BY t.deadline, t.id`,
      params
    );
    const currentDate = today();
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      deadline: dateValue(row.deadline as string | Date),
      completed_at: row.completed_at ? String(row.completed_at) : null,
      member_count: Number(row.member_count),
      avg_progress: row.avg_progress === null ? null : Number(row.avg_progress),
      overdue:
        OPEN_STATUSES.includes(row.status as TaskStatus) &&
        dateValue(row.deadline as string | Date) < currentDate
    })) as ReportTask[];
  };

  const peopleReport = async (
    actor: AuthUser,
    filters: Pick<
      ReportFilters,
      'dateFrom' | 'dateTo' | 'statuses' | 'taskType' | 'userId'
    > = {}
  ): Promise<PersonReport[]> => {
    await assertActive(database, actor);
    const dateFrom = validateDate(filters.dateFrom, 'Từ ngày');
    const dateTo = validateDate(filters.dateTo, 'Đến ngày');
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw new ReportError(
        'VALIDATION',
        'Từ ngày phải trước hoặc bằng Đến ngày.'
      );
    for (const status of filters.statuses ?? []) {
      if (!VALID_STATUSES.includes(status))
        throw new ReportError('VALIDATION', 'Trạng thái không hợp lệ.');
    }
    if (filters.taskType && !VALID_TYPES.includes(filters.taskType)) {
      throw new ReportError('VALIDATION', 'Loại công việc không hợp lệ.');
    }
    const params: unknown[] = [];
    const dateClauses: string[] = [];
    if (dateFrom) {
      params.push(dateFrom);
      dateClauses.push(`t.deadline >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      dateClauses.push(`t.deadline <= $${params.length}::date`);
    }
    const dateSql = dateClauses.length
      ? `AND ${dateClauses.join(' AND ')}`
      : '';
    const taskClauses: string[] = [];
    if (filters.statuses?.length) {
      params.push(filters.statuses);
      taskClauses.push(`t.status = ANY($${params.length}::text[])`);
    }
    if (filters.taskType) {
      params.push(filters.taskType);
      taskClauses.push(`t.task_type = $${params.length}`);
    }
    if (filters.userId) {
      params.push(filters.userId);
      const userIdIndex = params.length;
      taskClauses.push(
        `(t.proposer_id = $${userIdIndex} OR t.lead_id = $${userIdIndex} OR EXISTS (SELECT 1 FROM task_members related WHERE related.task_id = t.id AND related.user_id = $${userIdIndex}))`
      );
    }
    const taskFilterSql = taskClauses.length
      ? `AND ${taskClauses.join(' AND ')}`
      : '';
    const executedIndex = params.length + 1;
    const todayIndex = params.length + 2;
    const { rows } = await database.query<RawRow>(
      `WITH people AS (
        SELECT id, full_name FROM users WHERE is_active = true AND role IN ('MANAGER', 'STAFF')
       ), part_stats AS (
        SELECT m.user_id, count(*)::int AS parts,
          count(*) FILTER (WHERE m.progress = 100)::int AS completed,
          avg(m.progress)::float AS avg_progress,
          count(*) FILTER (WHERE t.status = 'PASSED')::int AS passed,
          count(*) FILTER (WHERE t.status = 'FAILED')::int AS failed,
          count(*) FILTER (WHERE t.status = 'IN_PROGRESS' AND m.progress < 100 AND t.deadline < $${todayIndex}::date)::int AS overdue_parts
        FROM task_members m JOIN tasks t ON t.id = m.task_id
        WHERE t.status = ANY($${executedIndex}::text[]) ${dateSql} ${taskFilterSql}
        GROUP BY m.user_id
       ), lead_stats AS (
        SELECT t.lead_id, count(*)::int AS led_total,
          count(*) FILTER (WHERE t.status = 'PASSED')::int AS led_passed,
          count(*) FILTER (WHERE t.status = 'FAILED')::int AS led_failed
        FROM tasks t WHERE t.lead_id IS NOT NULL AND t.status = ANY($${executedIndex}::text[]) ${dateSql} ${taskFilterSql}
        GROUP BY t.lead_id
       )
       SELECT p.id AS user_id, p.full_name, coalesce(ps.parts, 0)::int AS parts,
        coalesce(ps.completed, 0)::int AS completed, ps.avg_progress,
        coalesce(ps.passed, 0)::int AS passed, coalesce(ps.failed, 0)::int AS failed,
        coalesce(ps.overdue_parts, 0)::int AS overdue_parts,
        coalesce(ls.led_total, 0)::int AS led_total, coalesce(ls.led_passed, 0)::int AS led_passed,
        coalesce(ls.led_failed, 0)::int AS led_failed
       FROM people p LEFT JOIN part_stats ps ON ps.user_id = p.id LEFT JOIN lead_stats ls ON ls.lead_id = p.id
       ORDER BY lower(p.full_name), p.id`,
      [...params, EXECUTED_STATUSES, today()]
    );
    return rows.map((row) => ({
      ...row,
      user_id: String(row.user_id),
      parts: Number(row.parts),
      completed: Number(row.completed),
      avg_progress: row.avg_progress === null ? null : Number(row.avg_progress),
      passed: Number(row.passed),
      failed: Number(row.failed),
      overdue_parts: Number(row.overdue_parts),
      led_total: Number(row.led_total),
      led_passed: Number(row.led_passed),
      led_failed: Number(row.led_failed)
    })) as PersonReport[];
  };

  return { overview, myWork, taskReport, peopleReport, today };
};

export const buildTaskCsv = (rows: ReportTask[]): Uint8Array => {
  const columns: Array<[keyof ReportTask, string]> = [
    ['id', 'Mã'],
    ['title', 'Tên công việc'],
    ['task_type', 'Loại'],
    ['status', 'Trạng thái'],
    ['deadline', 'Hạn hoàn thành'],
    ['completed_at', 'Ngày hoàn thành'],
    ['proposer_name', 'Người đề xuất'],
    ['lead_name', 'Chủ trì'],
    ['member_count', 'Số người'],
    ['avg_progress', 'Tiến độ TB (%)'],
    ['overdue', 'Quá hạn'],
    ['eval_result', 'Kết quả đánh giá'],
    ['eval_comment', 'Nhận xét đánh giá']
  ];
  const labels: Record<string, string> = {
    TEAM: 'Nhóm',
    DIRECT: 'Giao trực tiếp',
    PERSONAL: 'Cá nhân',
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ duyệt',
    REJECTED: 'Bị từ chối',
    IN_PROGRESS: 'Đang thực hiện',
    REPORTED: 'Chờ đánh giá',
    PASSED: 'Đạt',
    FAILED: 'Không đạt',
    PASS: 'Đạt',
    FAIL: 'Không đạt'
  };
  const rowsText = [
    columns.map(([, label]) => csvQuote(label)).join(','),
    ...rows.map((row) =>
      columns
        .map(([key]) => {
          const value = row[key];
          if (key === 'task_type' || key === 'status' || key === 'eval_result')
            return csvQuote(value ? (labels[String(value)] ?? value) : '');
          if (key === 'overdue') return csvQuote(value ? 'Có' : '');
          if (key === 'avg_progress')
            return csvQuote(value === null ? '' : Math.round(Number(value)));
          return csvQuote(value);
        })
        .join(',')
    )
  ];
  const content = new TextEncoder().encode(`${rowsText.join('\r\n')}\r\n`);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const csv = new Uint8Array(bom.length + content.length);
  csv.set(bom);
  csv.set(content, bom.length);
  return csv;
};

export const buildPeopleCsv = (rows: PersonReport[]): Uint8Array => {
  const columns: Array<[keyof PersonReport, string]> = [
    ['full_name', 'Họ tên'],
    ['parts', 'Số phần việc'],
    ['completed', 'Hoàn thành'],
    ['avg_progress', 'Tiến độ trung bình (%)'],
    ['passed', 'Công việc đạt'],
    ['failed', 'Công việc không đạt'],
    ['overdue_parts', 'Phần việc quá hạn'],
    ['led_total', 'Số việc chủ trì'],
    ['led_passed', 'Chủ trì đạt'],
    ['led_failed', 'Chủ trì không đạt']
  ];
  const body =
    [
      columns.map(([, heading]) => csvQuote(heading)).join(','),
      ...rows.map((row) =>
        columns
          .map(([key]) => {
            const value = row[key];
            return csvQuote(
              key === 'avg_progress' && value !== null
                ? Math.round(Number(value))
                : value
            );
          })
          .join(',')
      )
    ].join('\r\n') + '\r\n';
  const content = new TextEncoder().encode(body);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const csv = new Uint8Array(bom.length + content.length);
  csv.set(bom);
  csv.set(content, bom.length);
  return csv;
};
