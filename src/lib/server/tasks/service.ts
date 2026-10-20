import type { AuthUser, Role } from '../auth/service';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';

export type TaskType = 'DIRECT' | 'TEAM' | 'PERSONAL';
export type TaskStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'REPORTED'
  | 'PASSED'
  | 'FAILED';

export type TaskMemberInput = {
  userId?: string;
  content: string;
  quantity?: number | string | null;
  unit?: string | null;
};

export type CreateTaskInput = {
  taskType: TaskType;
  title: string;
  description?: string | null;
  deadline: string;
  leadId?: string | null;
  members?: TaskMemberInput[];
};

export type TaskFilters = {
  search?: string;
  statuses?: TaskStatus[];
  taskType?: TaskType;
  involvedOnly?: boolean;
  overdueOnly?: boolean;
};

export type TaskLog = {
  id: string;
  task_id: string;
  member_id: string | null;
  actor_id: string;
  actor_name: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type ProgressInput = {
  value: number | string;
  resultReport?: string | null;
};
export type EvaluationResult = 'PASS' | 'FAIL';

export type TaskErrorCode =
  'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATE' | 'CONFLICT';

export class TaskError extends Error {
  constructor(
    readonly code: TaskErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  proposer_id: string;
  lead_id: string | null;
  approver_id: string | null;
  deadline: string;
  submitted_at: Date | null;
  approved_at: Date | null;
  reject_reason: string | null;
  report_summary?: string | null;
  completed_at?: Date | null;
  eval_result?: EvaluationResult | null;
  eval_comment?: string | null;
  evaluated_by?: string | null;
  evaluated_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  proposer_name?: string;
  lead_name?: string | null;
  member_count?: number;
  avg_progress?: number | null;
};

type MemberRow = {
  id: string;
  task_id: string;
  user_id: string;
  full_name: string;
  username: string;
  content: string;
  quantity: string | number | null;
  unit: string | null;
  done_quantity: string | number | null;
  progress: number;
  result_report: string | null;
  lead_comment: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbUser = { id: string; full_name: string; role: Role; is_active: boolean };
type TaskDb = TaskRow & Record<string, unknown>;
type MemberDb = MemberRow & Record<string, unknown>;

const OPEN_STATUSES: TaskStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REJECTED',
  'IN_PROGRESS'
];
const ASSIGNABLE_ROLES: Role[] = ['MANAGER', 'STAFF'];
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10000;
const CONTENT_MAX = 2000;
const UNIT_MAX = 80;
const TEXT_MAX = 10000;

const decimalNumber = (value: string | number | null): number =>
  value === null ? 0 : Number(value);

const computeProgress = (done: number, quantity: number): number => {
  if (done >= quantity) return 100;
  return Math.min(99, Math.max(0, Math.round((done / quantity) * 100)));
};

const normalizeProgressValue = (value: unknown): number => {
  const progress = Number(value);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new TaskError(
      'VALIDATION',
      'Tiến độ phải là số nguyên từ 0 đến 100.'
    );
  }
  return progress;
};

const normalizeDoneQuantity = (value: unknown): number => {
  const quantity = Number(value);
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 99999999999.999
  ) {
    throw new TaskError(
      'VALIDATION',
      'Khối lượng hoàn thành phải là số không âm.'
    );
  }
  return quantity;
};

const cleanText = (
  value: unknown,
  label: string,
  maxLength: number,
  required: boolean
): string | null => {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new TaskError('VALIDATION', `${label} không hợp lệ.`);
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text)
    throw new TaskError('VALIDATION', `${label} không được để trống.`);
  if (text.length > maxLength)
    throw new TaskError('VALIDATION', `${label} tối đa ${maxLength} ký tự.`);
  return text || null;
};

const normalizeDeadline = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TaskError('VALIDATION', 'Hạn hoàn thành không hợp lệ.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new TaskError('VALIDATION', 'Hạn hoàn thành không hợp lệ.');
  }
  return value;
};

const dateValue = (value: string | Date): string =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

const todayInVietnam = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${value.year}-${value.month}-${value.day}`;
};

const normalizeQuantity = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const quantity = Number(value);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 99999999999.999
  ) {
    throw new TaskError(
      'VALIDATION',
      'Khối lượng phải lớn hơn 0 và nằm trong giới hạn.'
    );
  }
  return quantity.toFixed(3).replace(/\.?0+$/, '');
};

const normalizeMember = (member: TaskMemberInput) => ({
  content: cleanText(
    member.content,
    'Nội dung phần việc',
    CONTENT_MAX,
    true
  ) as string,
  quantity: normalizeQuantity(member.quantity),
  unit: cleanText(member.unit, 'Đơn vị', UNIT_MAX, false)
});

const ensureActor = async (
  executor: QueryExecutor,
  actor: AuthUser
): Promise<DbUser> => {
  const { rows } = await executor.query<DbUser>(
    'SELECT id, full_name, role, is_active FROM users WHERE id = $1 FOR UPDATE',
    [actor.id]
  );
  const user = rows[0];
  if (!user?.is_active || user.role !== actor.role) {
    throw new TaskError(
      'FORBIDDEN',
      'Tài khoản không còn quyền thực hiện thao tác này.'
    );
  }
  return { ...user, id: String(user.id) };
};

const requireAssignable = async (
  executor: QueryExecutor,
  userId: string,
  label: string
): Promise<DbUser> => {
  const { rows } = await executor.query<DbUser>(
    'SELECT id, full_name, role, is_active FROM users WHERE id = $1',
    [userId]
  );
  const user = rows[0];
  if (!user?.is_active || !ASSIGNABLE_ROLES.includes(user.role)) {
    throw new TaskError(
      'VALIDATION',
      `${label} không hợp lệ hoặc không được giao việc.`
    );
  }
  return { ...user, id: String(user.id) };
};

const taskRow = async (
  executor: QueryExecutor,
  taskId: string,
  lock = false
): Promise<TaskRow> => {
  const { rows } = await executor.query<TaskDb>(
    `SELECT * FROM tasks WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [taskId]
  );
  if (!rows[0]) throw new TaskError('NOT_FOUND', 'Không tìm thấy công việc.');
  return {
    ...rows[0],
    id: String(rows[0].id),
    proposer_id: String(rows[0].proposer_id),
    lead_id: rows[0].lead_id === null ? null : String(rows[0].lead_id),
    approver_id:
      rows[0].approver_id === null ? null : String(rows[0].approver_id)
  };
};

const isManager = (user: AuthUser | DbUser): boolean => user.role === 'MANAGER';
const isProposer = (actor: AuthUser, task: TaskRow): boolean =>
  actor.id === task.proposer_id;
const isLead = (actor: AuthUser, task: TaskRow): boolean =>
  actor.id === task.lead_id;

const canCreate = (actor: AuthUser, type: TaskType): boolean =>
  (type === 'TEAM' && ['MANAGER', 'STAFF'].includes(actor.role)) ||
  (type === 'DIRECT' && actor.role === 'MANAGER') ||
  (type === 'PERSONAL' && actor.role === 'STAFF');

const canEditTask = (actor: AuthUser, task: TaskRow): boolean =>
  ((task.status === 'DRAFT' || task.status === 'REJECTED') &&
    (isManager(actor) ||
      (actor.role === 'STAFF' && isProposer(actor, task)))) ||
  (task.status === 'IN_PROGRESS' && isManager(actor));

const canEditAllocation = (actor: AuthUser, task: TaskRow): boolean => {
  if (actor.role === 'ADMIN') return false;
  if (task.task_type === 'DIRECT')
    return actor.role === 'MANAGER' && task.status === 'IN_PROGRESS';
  if (task.task_type === 'PERSONAL') {
    if (task.status === 'DRAFT' || task.status === 'REJECTED') {
      return (
        actor.role === 'MANAGER' ||
        (actor.role === 'STAFF' && isProposer(actor, task))
      );
    }
    return actor.role === 'MANAGER' && task.status === 'IN_PROGRESS';
  }
  if (task.status === 'DRAFT' || task.status === 'REJECTED') {
    return (
      actor.role === 'MANAGER' || isProposer(actor, task) || isLead(actor, task)
    );
  }
  return (
    task.status === 'IN_PROGRESS' &&
    (actor.role === 'MANAGER' || isLead(actor, task))
  );
};

const addLog = async (
  executor: QueryExecutor,
  taskId: string,
  actorId: string,
  action: string,
  detail: Record<string, unknown>,
  memberId?: string
): Promise<void> => {
  await executor.query(
    'INSERT INTO task_logs (task_id, member_id, actor_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [taskId, memberId ?? null, actorId, action, JSON.stringify(detail)]
  );
};

const listMembers = async (
  executor: QueryExecutor,
  taskId: string
): Promise<MemberRow[]> => {
  const { rows } = await executor.query<MemberDb>(
    `SELECT m.*, u.full_name, u.username
     FROM task_members m JOIN users u ON u.id = m.user_id
     WHERE m.task_id = $1 ORDER BY m.id`,
    [taskId]
  );
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
    task_id: String(row.task_id),
    user_id: String(row.user_id)
  }));
};

const insertMember = async (
  executor: QueryExecutor,
  actor: AuthUser,
  taskId: string,
  input: TaskMemberInput,
  forcedUserId?: string
): Promise<string> => {
  const userId = forcedUserId ?? input.userId;
  if (!userId)
    throw new TaskError('VALIDATION', 'Cần chọn người nhận phần việc.');
  const user = await requireAssignable(executor, userId, 'Thành viên');
  const member = normalizeMember(input);
  const { rows } = await executor.query<Record<string, unknown>>(
    `INSERT INTO task_members (task_id, user_id, content, quantity, unit)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [taskId, user.id, member.content, member.quantity, member.unit]
  );
  const memberId = String(rows[0]?.id);
  await addLog(
    executor,
    taskId,
    actor.id,
    'MEMBER_ADDED',
    {
      userId: user.id,
      userName: user.full_name,
      content: member.content,
      quantity: member.quantity,
      unit: member.unit
    },
    memberId
  );
  return memberId;
};

const allocationTask = async (
  executor: QueryExecutor,
  actor: AuthUser,
  taskId: string,
  structural = false
): Promise<TaskRow> => {
  await ensureActor(executor, actor);
  const task = await taskRow(executor, taskId, true);
  if (!['DRAFT', 'REJECTED', 'IN_PROGRESS'].includes(task.status)) {
    throw new TaskError(
      'INVALID_STATE',
      'Không thể thay đổi phân công ở trạng thái này.'
    );
  }
  if (!canEditAllocation(actor, task)) {
    throw new TaskError(
      'FORBIDDEN',
      'Bạn không có quyền thay đổi phân công của công việc này.'
    );
  }
  if (structural && task.task_type !== 'TEAM') {
    throw new TaskError(
      'INVALID_STATE',
      'Công việc DIRECT/PERSONAL chỉ có một người thực hiện.'
    );
  }
  return task;
};

export const createTaskService = (
  database: TransactionalDatabase,
  now: () => Date = () => new Date()
) => {
  const createTask = async (
    actor: AuthUser,
    input: CreateTaskInput
  ): Promise<string> => {
    if (!canCreate(actor, input.taskType)) {
      throw new TaskError(
        'FORBIDDEN',
        'Bạn không có quyền tạo loại công việc này.'
      );
    }
    const title = cleanText(
      input.title,
      'Tên công việc',
      TITLE_MAX,
      true
    ) as string;
    const description = cleanText(
      input.description,
      'Mô tả',
      DESCRIPTION_MAX,
      false
    );
    const deadline = normalizeDeadline(input.deadline);
    if (deadline < todayInVietnam(now())) {
      throw new TaskError('VALIDATION', 'Hạn hoàn thành không được ở quá khứ.');
    }
    const members = input.members ?? [];
    let leadId = input.leadId ?? null;
    if (input.taskType === 'TEAM' && !leadId) {
      throw new TaskError('VALIDATION', 'Công việc TEAM cần người chủ trì.');
    }
    if (input.taskType === 'DIRECT') {
      if (!leadId || members.length !== 1) {
        throw new TaskError(
          'VALIDATION',
          'DIRECT cần đúng một người nhận và một phần việc.'
        );
      }
      if (members[0].userId && members[0].userId !== leadId) {
        throw new TaskError(
          'VALIDATION',
          'Người nhận DIRECT phải là người chủ trì.'
        );
      }
      members[0] = { ...members[0], userId: leadId };
    }
    if (input.taskType === 'PERSONAL') {
      if (leadId !== actor.id || members.length !== 1) {
        throw new TaskError(
          'VALIDATION',
          'PERSONAL phải do người tạo tự làm với đúng một phần việc.'
        );
      }
      if (members[0].userId && members[0].userId !== actor.id) {
        throw new TaskError(
          'VALIDATION',
          'PERSONAL chỉ được giao cho người tạo.'
        );
      }
      members[0] = { ...members[0], userId: actor.id };
    }
    if (
      members.some((member) => !member.userId) ||
      new Set(members.map((member) => member.userId)).size !== members.length
    ) {
      throw new TaskError(
        'VALIDATION',
        'Mỗi người chỉ có tối đa một phần việc.'
      );
    }

    return database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      if (leadId) await requireAssignable(transaction, leadId, 'Người chủ trì');
      const status: TaskStatus =
        input.taskType === 'DIRECT'
          ? 'IN_PROGRESS'
          : input.taskType === 'PERSONAL'
            ? 'PENDING_APPROVAL'
            : 'DRAFT';
      const timestamp = now();
      const { rows } = await transaction.query<Record<string, unknown>>(
        `INSERT INTO tasks (title, description, task_type, status, proposer_id, lead_id,
          approver_id, deadline, submitted_at, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          title,
          description,
          input.taskType,
          status,
          actor.id,
          leadId,
          input.taskType === 'DIRECT' ? actor.id : null,
          deadline,
          input.taskType === 'PERSONAL' ? timestamp : null,
          input.taskType === 'DIRECT' ? timestamp : null
        ]
      );
      const taskId = String(rows[0].id);
      await addLog(transaction, taskId, actor.id, 'TASK_CREATED', {
        taskType: input.taskType,
        title,
        status,
        deadline,
        leadId
      });
      for (const member of members) {
        await insertMember(transaction, actor, taskId, member, member.userId);
      }
      if (input.taskType === 'DIRECT') {
        await addLog(transaction, taskId, actor.id, 'TASK_AUTO_APPROVED', {
          status
        });
      }
      if (input.taskType === 'PERSONAL') {
        await addLog(transaction, taskId, actor.id, 'TASK_AUTO_SUBMITTED', {
          status
        });
      }
      return taskId;
    });
  };

  const listTasks = async (actor: AuthUser, filters: TaskFilters = {}) => {
    const { rows: users } = await database.query<DbUser>(
      'SELECT id, full_name, role, is_active FROM users WHERE id = $1',
      [actor.id]
    );
    if (!users[0]?.is_active || users[0].role !== actor.role) {
      throw new TaskError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
    }
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    const bind = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    if (filters.statuses?.length) {
      clauses.push(`t.status = ANY(${bind(filters.statuses)}::text[])`);
    }
    if (filters.taskType)
      clauses.push(`t.task_type = ${bind(filters.taskType)}`);
    if (filters.involvedOnly) {
      const id = bind(actor.id);
      clauses.push(
        `(t.proposer_id = ${id} OR t.lead_id = ${id} OR EXISTS (SELECT 1 FROM task_members mine WHERE mine.task_id = t.id AND mine.user_id = ${id}))`
      );
    }
    if (filters.overdueOnly) {
      clauses.push(`t.status = ANY(${bind(OPEN_STATUSES)}::text[])`);
      clauses.push(`t.deadline < ${bind(todayInVietnam(now()))}::date`);
    }
    if (filters.search?.trim()) {
      clauses.push(
        `position(lower(${bind(filters.search.trim())}) in lower(t.title || ' ' || coalesce(t.description, ''))) > 0`
      );
    }
    const { rows } = await database.query<TaskDb>(
      `SELECT t.id, t.title, t.description, t.task_type, t.status, t.deadline,
        t.proposer_id, t.lead_id, t.updated_at, p.full_name AS proposer_name,
        l.full_name AS lead_name,
        count(DISTINCT m.id)::int AS member_count,
        avg(m.progress)::float AS avg_progress
       FROM tasks t JOIN users p ON p.id = t.proposer_id
       LEFT JOIN users l ON l.id = t.lead_id
       LEFT JOIN task_members m ON m.task_id = t.id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       GROUP BY t.id, p.full_name, l.full_name
       ORDER BY t.updated_at DESC, t.id DESC`,
      parameters
    );
    const today = todayInVietnam(now());
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      deadline: dateValue(row.deadline),
      proposer_id: String(row.proposer_id),
      lead_id: row.lead_id === null ? null : String(row.lead_id),
      avg_progress: row.avg_progress ?? null,
      overdue:
        OPEN_STATUSES.includes(row.status) && dateValue(row.deadline) < today
    }));
  };

  const getTask = async (actor: AuthUser, taskId: string) => {
    const { rows: users } = await database.query<DbUser>(
      'SELECT id, full_name, role, is_active FROM users WHERE id = $1',
      [actor.id]
    );
    if (!users[0]?.is_active || users[0].role !== actor.role) {
      throw new TaskError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
    }
    const { rows } = await database.query<TaskDb>(
      `SELECT t.*, p.full_name AS proposer_name, l.full_name AS lead_name,
        a.full_name AS approver_name
       FROM tasks t JOIN users p ON p.id = t.proposer_id
       LEFT JOIN users l ON l.id = t.lead_id
       LEFT JOIN users a ON a.id = t.approver_id WHERE t.id = $1`,
      [taskId]
    );
    if (!rows[0]) throw new TaskError('NOT_FOUND', 'Không tìm thấy công việc.');
    const members = await listMembers(database, taskId);
    const task = rows[0];
    return {
      ...task,
      id: String(task.id),
      deadline: dateValue(task.deadline),
      proposer_id: String(task.proposer_id),
      lead_id: task.lead_id === null ? null : String(task.lead_id),
      approver_id: task.approver_id === null ? null : String(task.approver_id),
      evaluated_by:
        task.evaluated_by === null ? null : String(task.evaluated_by),
      members,
      overdue:
        OPEN_STATUSES.includes(task.status) &&
        dateValue(task.deadline) < todayInVietnam(now())
    };
  };

  const listAssignableUsers = async (actor: AuthUser) => {
    const { rows: identity } = await database.query<DbUser>(
      'SELECT id, full_name, role, is_active FROM users WHERE id = $1',
      [actor.id]
    );
    if (!identity[0]?.is_active || identity[0].role !== actor.role) {
      throw new TaskError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
    }
    const { rows } = await database.query<DbUser>(
      "SELECT id, full_name, role, is_active FROM users WHERE is_active = true AND role IN ('MANAGER', 'STAFF') ORDER BY lower(full_name), id"
    );
    return rows.map((row) => ({ ...row, id: String(row.id) }));
  };

  const updateTask = async (
    actor: AuthUser,
    taskId: string,
    input: {
      title: string;
      description?: string | null;
      deadline: string;
      leadId?: string | null;
    }
  ): Promise<boolean> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      const task = await taskRow(transaction, taskId, true);
      if (!canEditTask(actor, task)) {
        throw new TaskError(
          'FORBIDDEN',
          'Bạn không có quyền sửa công việc này.'
        );
      }
      const title = cleanText(
        input.title,
        'Tên công việc',
        TITLE_MAX,
        true
      ) as string;
      const description = cleanText(
        input.description,
        'Mô tả',
        DESCRIPTION_MAX,
        false
      );
      const deadline = normalizeDeadline(input.deadline);
      if (deadline < todayInVietnam(now())) {
        throw new TaskError(
          'VALIDATION',
          'Hạn hoàn thành không được ở quá khứ.'
        );
      }
      let leadId = task.lead_id;
      if (task.task_type === 'TEAM') {
        if (!input.leadId)
          throw new TaskError(
            'VALIDATION',
            'Công việc TEAM cần người chủ trì.'
          );
        leadId = input.leadId;
        if (leadId !== task.lead_id)
          await requireAssignable(transaction, leadId, 'Người chủ trì');
      } else if (input.leadId && input.leadId !== task.lead_id) {
        throw new TaskError(
          'VALIDATION',
          'Không thể đổi người thực hiện công việc một người.'
        );
      }
      const detail = {
        title:
          title === task.title ? undefined : { old: task.title, new: title },
        description:
          description === task.description
            ? undefined
            : { old: task.description, new: description },
        deadline:
          deadline === task.deadline
            ? undefined
            : { old: task.deadline, new: deadline },
        leadId:
          leadId === task.lead_id
            ? undefined
            : { old: task.lead_id, new: leadId }
      };
      if (Object.values(detail).every((change) => change === undefined))
        return false;
      await transaction.query(
        'UPDATE tasks SET title = $2, description = $3, deadline = $4, lead_id = $5, updated_at = $6 WHERE id = $1',
        [taskId, title, description, deadline, leadId, now()]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_UPDATED', detail);
      return true;
    });

  const addMember = async (
    actor: AuthUser,
    taskId: string,
    input: TaskMemberInput
  ): Promise<string> =>
    database.transaction(async (transaction) => {
      const task = await allocationTask(transaction, actor, taskId, true);
      const memberId = await insertMember(transaction, actor, taskId, input);
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, now()]
      );
      return memberId;
    });

  const addMembersBulk = async (
    actor: AuthUser,
    taskId: string,
    common: { content: string; unit?: string | null },
    rows: Array<{ userId: string; quantity?: number | string | null }>
  ): Promise<string[]> => {
    if (!rows.length)
      throw new TaskError('VALIDATION', 'Cần chọn ít nhất một thành viên.');
    if (new Set(rows.map((row) => row.userId)).size !== rows.length) {
      throw new TaskError(
        'VALIDATION',
        'Mỗi người chỉ có một phần việc trong công việc này.'
      );
    }
    const normalized = normalizeMember({
      content: common.content,
      unit: common.unit
    });
    return database.transaction(async (transaction) => {
      const task = await allocationTask(transaction, actor, taskId, true);
      const memberIds: string[] = [];
      for (const row of rows) {
        memberIds.push(
          await insertMember(transaction, actor, taskId, {
            userId: row.userId,
            content: normalized.content,
            unit: normalized.unit,
            quantity: row.quantity
          })
        );
      }
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, now()]
      );
      return memberIds;
    });
  };

  const updateMember = async (
    actor: AuthUser,
    memberId: string,
    input: {
      content: string;
      quantity?: number | string | null;
      unit?: string | null;
    }
  ): Promise<boolean> =>
    database.transaction(async (transaction) => {
      const { rows } = await transaction.query<MemberDb>(
        `SELECT m.*, u.full_name, u.username FROM task_members m
         JOIN users u ON u.id = m.user_id WHERE m.id = $1 FOR UPDATE`,
        [memberId]
      );
      const member = rows[0];
      if (!member)
        throw new TaskError('NOT_FOUND', 'Không tìm thấy phần việc.');
      const task = await allocationTask(transaction, actor, member.task_id);
      const normalized = normalizeMember(input);
      if (
        normalized.content === member.content &&
        normalized.unit === member.unit &&
        normalized.quantity ===
          (member.quantity === null ? null : Number(member.quantity).toString())
      )
        return false;
      await transaction.query(
        'UPDATE task_members SET content = $2, quantity = $3, unit = $4, updated_at = $5 WHERE id = $1',
        [
          memberId,
          normalized.content,
          normalized.quantity,
          normalized.unit,
          now()
        ]
      );
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, now()]
      );
      await addLog(
        transaction,
        task.id,
        actor.id,
        'MEMBER_UPDATED',
        {
          userName: member.full_name,
          content: { old: member.content, new: normalized.content },
          quantity: { old: member.quantity, new: normalized.quantity },
          unit: { old: member.unit, new: normalized.unit }
        },
        memberId
      );
      return true;
    });

  const removeMember = async (
    actor: AuthUser,
    memberId: string
  ): Promise<void> =>
    database.transaction(async (transaction) => {
      const { rows } = await transaction.query<MemberDb>(
        `SELECT m.*, u.full_name, u.username FROM task_members m
         JOIN users u ON u.id = m.user_id WHERE m.id = $1 FOR UPDATE`,
        [memberId]
      );
      const member = rows[0];
      if (!member)
        throw new TaskError('NOT_FOUND', 'Không tìm thấy phần việc.');
      const task = await allocationTask(
        transaction,
        actor,
        member.task_id,
        true
      );
      if (member.progress > 0 || member.result_report?.trim()) {
        throw new TaskError(
          'INVALID_STATE',
          'Không thể xóa phần việc đã có tiến độ hoặc báo cáo.'
        );
      }
      await transaction.query('DELETE FROM task_members WHERE id = $1', [
        memberId
      ]);
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, now()]
      );
      await addLog(
        transaction,
        task.id,
        actor.id,
        'MEMBER_REMOVED',
        {
          userId: member.user_id,
          userName: member.full_name,
          content: member.content,
          quantity: member.quantity,
          unit: member.unit
        },
        memberId
      );
    });

  const requireManager = (actor: AuthUser): void => {
    if (actor.role !== 'MANAGER') {
      throw new TaskError(
        'FORBIDDEN',
        'Chỉ MANAGER mới được thực hiện thao tác này.'
      );
    }
  };

  const lockedMember = async (
    transaction: QueryExecutor,
    memberId: string
  ): Promise<MemberRow> => {
    const { rows } = await transaction.query<MemberDb>(
      `SELECT m.*, u.full_name, u.username FROM task_members m
       JOIN users u ON u.id = m.user_id WHERE m.id = $1 FOR UPDATE`,
      [memberId]
    );
    if (!rows[0]) throw new TaskError('NOT_FOUND', 'Không tìm thấy phần việc.');
    return {
      ...rows[0],
      id: String(rows[0].id),
      task_id: String(rows[0].task_id),
      user_id: String(rows[0].user_id)
    };
  };

  const submitTask = async (actor: AuthUser, taskId: string): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      const task = await taskRow(transaction, taskId, true);
      if (!['DRAFT', 'REJECTED'].includes(task.status)) {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ gửi duyệt công việc Nháp hoặc Bị từ chối.'
        );
      }
      if (task.task_type !== 'TEAM') {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ công việc TEAM được gửi duyệt thủ công.'
        );
      }
      if (!(
        isManager(actor) ||
        (actor.role === 'STAFF' && isProposer(actor, task))
      )) {
        throw new TaskError(
          'FORBIDDEN',
          'Chỉ người đề xuất hoặc MANAGER được gửi duyệt.'
        );
      }
      if (!task.lead_id)
        throw new TaskError(
          'VALIDATION',
          'Cần có người chủ trì trước khi gửi duyệt.'
        );
      await requireAssignable(transaction, task.lead_id, 'Người chủ trì');
      const members = await listMembers(transaction, taskId);
      if (!members.length)
        throw new TaskError(
          'VALIDATION',
          'Cần ít nhất một phần việc trước khi gửi duyệt.'
        );
      for (const member of members)
        await requireAssignable(transaction, member.user_id, 'Thành viên');
      if (task.deadline < todayInVietnam(now())) {
        throw new TaskError(
          'VALIDATION',
          'Hạn hoàn thành đã qua, hãy cập nhật hạn trước khi gửi.'
        );
      }
      const submittedAt = now();
      await transaction.query(
        "UPDATE tasks SET status = 'PENDING_APPROVAL', submitted_at = $2, reject_reason = NULL, updated_at = $2 WHERE id = $1",
        [taskId, submittedAt]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_SUBMITTED', {
        from: task.status,
        resubmitted: task.status === 'REJECTED'
      });
    });

  const approveTask = async (actor: AuthUser, taskId: string): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      requireManager(actor);
      const task = await taskRow(transaction, taskId, true);
      if (task.status !== 'PENDING_APPROVAL') {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ duyệt công việc đang Chờ duyệt.'
        );
      }
      const approvedAt = now();
      await transaction.query(
        "UPDATE tasks SET status = 'IN_PROGRESS', approver_id = $2, approved_at = $3, updated_at = $3 WHERE id = $1",
        [taskId, actor.id, approvedAt]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_APPROVED', {
        from: task.status
      });
    });

  const rejectTask = async (
    actor: AuthUser,
    taskId: string,
    reason: string
  ): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      requireManager(actor);
      const task = await taskRow(transaction, taskId, true);
      if (task.status !== 'PENDING_APPROVAL') {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ từ chối công việc đang Chờ duyệt.'
        );
      }
      const rejectReason = cleanText(
        reason,
        'Lý do từ chối',
        CONTENT_MAX,
        true
      ) as string;
      const decidedAt = now();
      await transaction.query(
        "UPDATE tasks SET status = 'REJECTED', approver_id = $2, reject_reason = $3, updated_at = $4 WHERE id = $1",
        [taskId, actor.id, rejectReason, decidedAt]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_REJECTED', {
        reason: rejectReason
      });
    });

  const updateProgress = async (
    actor: AuthUser,
    memberId: string,
    input: ProgressInput
  ): Promise<void> => {
    const { rows: reference } = await database.query<{ task_id: string }>(
      'SELECT task_id FROM task_members WHERE id = $1',
      [memberId]
    );
    if (!reference[0])
      throw new TaskError('NOT_FOUND', 'Không tìm thấy phần việc.');
    await database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      const task = await taskRow(
        transaction,
        String(reference[0].task_id),
        true
      );
      const member = await lockedMember(transaction, memberId);
      if (task.status !== 'IN_PROGRESS') {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ cập nhật tiến độ khi công việc đang thực hiện.'
        );
      }
      const allowed =
        task.task_type === 'TEAM'
          ? isLead(actor, task)
          : member.user_id === actor.id;
      if (!allowed)
        throw new TaskError(
          'FORBIDDEN',
          'Bạn không có quyền cập nhật phần việc này.'
        );

      const report = cleanText(
        input.resultReport,
        'Báo cáo kết quả',
        TEXT_MAX,
        false
      );
      const quantity =
        member.quantity === null ? null : decimalNumber(member.quantity);
      const doneQuantity =
        quantity === null ? null : normalizeDoneQuantity(input.value);
      const progress =
        quantity === null
          ? normalizeProgressValue(input.value)
          : computeProgress(doneQuantity as number, quantity);
      if (progress === 100 && !report) {
        throw new TaskError(
          'VALIDATION',
          'Khi đạt 100%, cần nhập báo cáo kết quả.'
        );
      }
      const updatedAt = now();
      await transaction.query(
        'UPDATE task_members SET done_quantity = $2, progress = $3, result_report = $4, updated_at = $5 WHERE id = $1',
        [memberId, doneQuantity, progress, report, updatedAt]
      );
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, updatedAt]
      );
      await addLog(
        transaction,
        task.id,
        actor.id,
        'MEMBER_PROGRESS_UPDATED',
        {
          userId: member.user_id,
          userName: member.full_name,
          quantity: member.quantity,
          doneQuantity:
            doneQuantity === null
              ? null
              : { old: member.done_quantity, new: doneQuantity },
          progress: { old: member.progress, new: progress },
          resultReport: { old: member.result_report, new: report }
        },
        memberId
      );

      if (task.task_type !== 'TEAM' && progress === 100) {
        const completedAt = now();
        await transaction.query(
          "UPDATE tasks SET status = 'REPORTED', completed_at = $2, updated_at = $2 WHERE id = $1",
          [task.id, completedAt]
        );
        await addLog(transaction, task.id, actor.id, 'TASK_AUTO_REPORTED', {
          completedAt: completedAt.toISOString()
        });
      }
    });
  };

  const commentMember = async (
    actor: AuthUser,
    memberId: string,
    comment: string | null
  ): Promise<boolean> => {
    const { rows: reference } = await database.query<{ task_id: string }>(
      'SELECT task_id FROM task_members WHERE id = $1',
      [memberId]
    );
    if (!reference[0])
      throw new TaskError('NOT_FOUND', 'Không tìm thấy phần việc.');
    return database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      const task = await taskRow(
        transaction,
        String(reference[0].task_id),
        true
      );
      const member = await lockedMember(transaction, memberId);
      if (!['IN_PROGRESS', 'REPORTED'].includes(task.status)) {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ nhận xét khi đang thực hiện hoặc chờ đánh giá.'
        );
      }
      const allowed =
        actor.role === 'MANAGER' ||
        (task.task_type === 'TEAM' && isLead(actor, task));
      if (!allowed)
        throw new TaskError(
          'FORBIDDEN',
          'Bạn không có quyền nhận xét phần việc này.'
        );
      const newComment = cleanText(comment, 'Nhận xét', CONTENT_MAX, false);
      if (newComment === member.lead_comment) return false;
      const updatedAt = now();
      await transaction.query(
        'UPDATE task_members SET lead_comment = $2, updated_at = $3 WHERE id = $1',
        [memberId, newComment, updatedAt]
      );
      await transaction.query(
        'UPDATE tasks SET updated_at = $2 WHERE id = $1',
        [task.id, updatedAt]
      );
      await addLog(
        transaction,
        task.id,
        actor.id,
        'MEMBER_COMMENTED',
        {
          userId: member.user_id,
          userName: member.full_name,
          comment: { old: member.lead_comment, new: newComment }
        },
        memberId
      );
      return true;
    });
  };

  const allMembersCompleted = async (
    transaction: QueryExecutor,
    taskId: string
  ): Promise<boolean> => {
    const members = await listMembers(transaction, taskId);
    return (
      members.length > 0 &&
      members.every(
        (member) =>
          member.progress === 100 && Boolean(member.result_report?.trim())
      )
    );
  };

  const reportCompletion = async (
    actor: AuthUser,
    taskId: string,
    summary: string
  ): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      const task = await taskRow(transaction, taskId, true);
      if (task.task_type !== 'TEAM' || task.status !== 'IN_PROGRESS') {
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ báo cáo hoàn thành công việc TEAM đang thực hiện.'
        );
      }
      if (!isLead(actor, task))
        throw new TaskError(
          'FORBIDDEN',
          'Chỉ người chủ trì được báo cáo hoàn thành.'
        );
      const reportSummary = cleanText(
        summary,
        'Báo cáo tổng hợp',
        TEXT_MAX,
        true
      ) as string;
      if (!(await allMembersCompleted(transaction, taskId))) {
        throw new TaskError(
          'VALIDATION',
          'Tất cả thành viên phải hoàn thành 100% và có báo cáo kết quả.'
        );
      }
      const completedAt = now();
      await transaction.query(
        "UPDATE tasks SET status = 'REPORTED', report_summary = $2, completed_at = $3, updated_at = $3 WHERE id = $1",
        [taskId, reportSummary, completedAt]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_REPORTED', {
        summary: reportSummary
      });
    });

  const evaluateTask = async (
    actor: AuthUser,
    taskId: string,
    result: EvaluationResult,
    comment?: string | null
  ): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      requireManager(actor);
      const task = await taskRow(transaction, taskId, true);
      if (task.status !== 'REPORTED')
        throw new TaskError(
          'INVALID_STATE',
          'Chỉ đánh giá công việc đã báo cáo.'
        );
      if (result !== 'PASS' && result !== 'FAIL')
        throw new TaskError('VALIDATION', 'Kết quả đánh giá không hợp lệ.');
      const evalComment = cleanText(
        comment,
        'Nhận xét đánh giá',
        TEXT_MAX,
        result === 'FAIL'
      );
      const evaluatedAt = now();
      const status = result === 'PASS' ? 'PASSED' : 'FAILED';
      await transaction.query(
        'UPDATE tasks SET status = $2, eval_result = $3, eval_comment = $4, evaluated_by = $5, evaluated_at = $6, updated_at = $6 WHERE id = $1',
        [taskId, status, result, evalComment, actor.id, evaluatedAt]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_EVALUATED', {
        result,
        comment: evalComment
      });
    });

  const reopenTask = async (
    actor: AuthUser,
    taskId: string,
    reason: string
  ): Promise<void> =>
    database.transaction(async (transaction) => {
      await ensureActor(transaction, actor);
      requireManager(actor);
      const task = await taskRow(transaction, taskId, true);
      if (task.status !== 'FAILED')
        throw new TaskError('INVALID_STATE', 'Chỉ mở lại công việc Không đạt.');
      const reopenReason = cleanText(
        reason,
        'Lý do mở lại',
        CONTENT_MAX,
        true
      ) as string;
      await transaction.query(
        "UPDATE tasks SET status = 'IN_PROGRESS', report_summary = NULL, completed_at = NULL, eval_result = NULL, eval_comment = NULL, evaluated_by = NULL, evaluated_at = NULL, updated_at = $2 WHERE id = $1",
        [taskId, now()]
      );
      await addLog(transaction, taskId, actor.id, 'TASK_REOPENED', {
        reason: reopenReason,
        previousResult: task.eval_result,
        previousComment: task.eval_comment
      });
    });

  const getTaskLogs = async (
    actor: AuthUser,
    taskId: string
  ): Promise<TaskLog[]> => {
    const task = await taskRow(database, taskId);
    const { rows: identity } = await database.query<DbUser>(
      'SELECT id, full_name, role, is_active FROM users WHERE id = $1',
      [actor.id]
    );
    if (!identity[0]?.is_active || identity[0].role !== actor.role) {
      throw new TaskError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
    }
    const { rows } = await database.query<Record<string, unknown>>(
      `SELECT l.id, l.task_id, l.member_id, l.actor_id, u.full_name AS actor_name,
        l.action, l.detail, l.created_at FROM task_logs l
       JOIN users u ON u.id = l.actor_id WHERE l.task_id = $1 ORDER BY l.id`,
      [task.id]
    );
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      task_id: String(row.task_id),
      actor_id: String(row.actor_id),
      member_id: row.member_id === null ? null : String(row.member_id),
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      actor_name: String(row.actor_name),
      action: String(row.action),
      detail: (row.detail ?? {}) as Record<string, unknown>
    })) as TaskLog[];
  };

  return {
    createTask,
    listTasks,
    getTask,
    listAssignableUsers,
    updateTask,
    addMember,
    addMembersBulk,
    updateMember,
    removeMember,
    submitTask,
    approveTask,
    rejectTask,
    updateProgress,
    commentMember,
    reportCompletion,
    evaluateTask,
    reopenTask,
    getTaskLogs
  };
};
