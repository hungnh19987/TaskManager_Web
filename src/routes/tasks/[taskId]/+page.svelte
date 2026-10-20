<script lang="ts">
  let { data, form } = $props();
  let assignmentMode = $state('single');
  let selectedUsers = $state<string[]>([]);
  let quantities = $state<Record<string, string>>({});
  let sharedContent = $state('');
  let sharedUnit = $state('');

  const labels: Record<string, string> = {
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ duyệt',
    REJECTED: 'Bị từ chối',
    IN_PROGRESS: 'Đang thực hiện',
    REPORTED: 'Chờ đánh giá',
    PASSED: 'Đạt',
    FAILED: 'Không đạt',
    TEAM: 'Nhóm',
    DIRECT: 'Giao trực tiếp',
    PERSONAL: 'Cá nhân'
  };
  const peopleById = $derived(
    new Map(
      data.people.map(
        (person: { id: string; full_name: string; role: string }) => [
          String(person.id),
          person
        ]
      )
    )
  );
  const assignedIds = $derived(
    new Set(
      data.task.members.map((member: { user_id: string | number }) =>
        String(member.user_id)
      )
    )
  );
  const availablePeople = $derived(
    data.people.filter(
      (person: { id: string | number }) => !assignedIds.has(String(person.id))
    )
  );

  const canEditTask = $derived(
    ['DRAFT', 'REJECTED'].includes(data.task.status)
      ? data.currentUser.role === 'MANAGER' ||
          (data.currentUser.role === 'STAFF' &&
            data.currentUser.id === String(data.task.proposer_id))
      : data.task.status === 'IN_PROGRESS' &&
          data.currentUser.role === 'MANAGER'
  );
  const canEditAllocation = $derived(
    data.task.task_type === 'DIRECT'
      ? data.currentUser.role === 'MANAGER' &&
          data.task.status === 'IN_PROGRESS'
      : data.task.task_type === 'PERSONAL'
        ? ['DRAFT', 'REJECTED'].includes(data.task.status)
          ? data.currentUser.role === 'MANAGER' ||
            data.currentUser.id === String(data.task.proposer_id)
          : data.currentUser.role === 'MANAGER' &&
            data.task.status === 'IN_PROGRESS'
        : ['DRAFT', 'REJECTED'].includes(data.task.status)
          ? data.currentUser.role === 'MANAGER' ||
            data.currentUser.id === String(data.task.proposer_id) ||
            data.currentUser.id === String(data.task.lead_id)
          : data.task.status === 'IN_PROGRESS' &&
            (data.currentUser.role === 'MANAGER' ||
              data.currentUser.id === String(data.task.lead_id))
  );
  const isManager = $derived(data.currentUser.role === 'MANAGER');
  const canSubmit = $derived(
    ['DRAFT', 'REJECTED'].includes(data.task.status) &&
      data.task.task_type === 'TEAM' &&
      (isManager ||
        (data.currentUser.role === 'STAFF' &&
          data.currentUser.id === String(data.task.proposer_id)))
  );
  const canDecide = $derived(
    isManager && data.task.status === 'PENDING_APPROVAL'
  );
  const canReportTeam = $derived(
    data.task.task_type === 'TEAM' &&
      data.task.status === 'IN_PROGRESS' &&
      data.currentUser.id === String(data.task.lead_id)
  );
  const canEvaluate = $derived(isManager && data.task.status === 'REPORTED');
  const canReopen = $derived(isManager && data.task.status === 'FAILED');

  const submitBulk = (event: SubmitEvent) => {
    const formElement = event.currentTarget as HTMLFormElement;
    const rows = selectedUsers.map((userId) => ({
      userId,
      quantity: quantities[userId] || null
    }));
    const input = formElement.elements.namedItem('rows') as HTMLInputElement;
    input.value = JSON.stringify(rows);
  };
</script>

<svelte:head>
  <title>#{data.task.id} · {data.task.title} | Task Manager</title>
</svelte:head>

<main>
  <a class="back" href="/tasks">← Danh sách công việc</a>
  {#if form?.message}<p class="notice error" role="alert">
      {form.message}
    </p>{/if}
  {#if form?.success}<p class="notice success" role="status">
      {form.success}
    </p>{/if}

  {#if canSubmit || canDecide || canReportTeam || canEvaluate || canReopen}
    <section class="workflow-bar" aria-label="Thao tác quy trình">
      {#if canSubmit}
        <form method="POST" action="?/submit">
          <button class="primary" type="submit">Gửi duyệt</button>
        </form>
      {/if}
      {#if canDecide}
        <form method="POST" action="?/approve">
          <button class="primary" type="submit">Phê duyệt</button>
        </form>
        <details class="workflow-reject">
          <summary>Từ chối</summary>
          <form method="POST" action="?/reject">
            <label
              >Lý do từ chối<textarea
                name="reason"
                required
                maxlength="2000"
                rows="2"
              ></textarea></label
            ><button class="danger-button" type="submit"
              >Xác nhận từ chối</button
            >
          </form>
        </details>
      {/if}
      {#if canReportTeam}
        <details class="workflow-report">
          <summary>Báo cáo hoàn thành</summary>
          <form method="POST" action="?/reportCompletion">
            <label
              >Báo cáo tổng hợp<textarea
                name="summary"
                required
                maxlength="10000"
                rows="3"
              ></textarea></label
            ><button class="primary" type="submit">Gửi báo cáo</button>
          </form>
        </details>
      {/if}
      {#if canEvaluate}
        <details class="workflow-evaluate">
          <summary>Đánh giá kết quả</summary>
          <form method="POST" action="?/evaluate">
            <label
              >Kết quả<select name="result"
                ><option value="PASS">Đạt</option><option value="FAIL"
                  >Không đạt</option
                ></select
              ></label
            ><label
              >Nhận xét<textarea
                name="comment"
                maxlength="10000"
                rows="2"
                placeholder="Bắt buộc khi Không đạt"
              ></textarea></label
            ><button class="primary" type="submit">Lưu đánh giá</button>
          </form>
        </details>
      {/if}
      {#if canReopen}
        <details class="workflow-reopen">
          <summary>Mở lại</summary>
          <form method="POST" action="?/reopen">
            <label
              >Lý do mở lại<textarea
                name="reason"
                required
                maxlength="2000"
                rows="2"
              ></textarea></label
            ><button class="primary" type="submit">Mở lại công việc</button>
          </form>
        </details>
      {/if}
    </section>
  {/if}

  <section class="hero">
    <div class="hero-top">
      <span class="task-id">TASK / {data.task.id}</span><span class="tag type"
        >{labels[data.task.task_type]}</span
      ><span class="tag status">{labels[data.task.status]}</span
      >{#if data.task.overdue}<span class="late">QUÁ HẠN</span>{/if}
    </div>
    {#if data.task.reject_reason}<p class="outcome rejected">
        <strong>Lý do từ chối</strong>{data.task.reject_reason}
      </p>{/if}
    {#if data.task.report_summary}<p class="outcome reported">
        <strong>Báo cáo tổng hợp</strong>{data.task.report_summary}
      </p>{/if}
    {#if data.task.eval_result}<p
        class="outcome"
        class:failed={data.task.eval_result === 'FAIL'}
      >
        <strong
          >Đánh giá: {data.task.eval_result === 'PASS'
            ? 'Đạt'
            : 'Không đạt'}</strong
        >{#if data.task.eval_comment}<span>{data.task.eval_comment}</span>{/if}
      </p>{/if}
    <h1>{data.task.title}</h1>
    {#if data.task.description}<p class="description">
        {data.task.description}
      </p>{/if}
    <div class="metadata">
      <div>
        <span>Người đề xuất</span><strong>{data.task.proposer_name}</strong>
      </div>
      <div>
        <span
          >{data.task.task_type === 'DIRECT' ||
          data.task.task_type === 'PERSONAL'
            ? 'Người thực hiện'
            : 'Người chủ trì'}</span
        ><strong>{data.task.lead_name ?? 'Chưa phân công'}</strong>
      </div>
      <div>
        <span>Hạn hoàn thành</span><strong>{data.task.deadline}</strong>
      </div>
      <div>
        <span>Phần việc</span><strong>{data.task.members.length} người</strong>
      </div>
    </div>
  </section>

  {#if canEditTask}
    <section class="section" aria-labelledby="edit-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">THÔNG TIN</p>
          <h2 id="edit-heading">Sửa công việc</h2>
        </div>
      </div>
      <form method="POST" action="?/update" class="edit-grid">
        <label
          >Tên<input
            name="title"
            required
            maxlength="200"
            value={data.task.title}
          /></label
        >
        <label
          >Mô tả<textarea name="description" maxlength="10000" rows="2"
            >{data.task.description ?? ''}</textarea
          ></label
        >
        <label
          >Hạn<input
            name="deadline"
            type="date"
            required
            value={data.task.deadline}
          /></label
        >
        {#if data.task.task_type === 'TEAM'}
          <label
            >Người chủ trì<select
              name="leadId"
              required
              value={data.task.lead_id}
              >{#each data.people as person}<option value={person.id}
                  >{person.full_name}</option
                >{/each}</select
            ></label
          >
        {:else}<input
            type="hidden"
            name="leadId"
            value={data.task.lead_id ?? ''}
          />{/if}
        <button class="primary" type="submit">Lưu thay đổi</button>
      </form>
    </section>
  {/if}

  <section class="section" aria-labelledby="members-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">PHÂN CÔNG</p>
        <h2 id="members-heading">Phần việc</h2>
      </div>
      {#if data.task.task_type === 'TEAM'}<span class="muted"
          >Mỗi người có tối đa một phần việc</span
        >{/if}
    </div>
    {#if data.task.members.length === 0}
      <p class="empty">Chưa có phần việc nào được phân công.</p>
    {:else}
      <div class="member-list">
        {#each data.task.members as member (member.id)}
          <article class="member-row">
            <div class="member-person">
              <span class="avatar"
                >{member.full_name.slice(0, 1).toUpperCase()}</span
              >
              <div>
                <strong>{member.full_name}</strong><small
                  >{peopleById.get(String(member.user_id))?.role ??
                    'Người thực hiện'}</small
                >
              </div>
            </div>
            <div class="member-content">
              <strong>{member.content}</strong><span
                >{member.quantity
                  ? `${member.quantity}${member.unit ? ` ${member.unit}` : ''}`
                  : 'Không đặt khối lượng'}</span
              >
            </div>
            <span class="progress">{member.progress}%</span>
            {#if data.task.status === 'IN_PROGRESS' && ((data.task.task_type === 'TEAM' && String(data.currentUser.id) === String(data.task.lead_id)) || (data.task.task_type !== 'TEAM' && String(data.currentUser.id) === String(member.user_id)))}
              <details class="progress-actions">
                <summary>Cập nhật tiến độ</summary>
                <form method="POST" action="?/updateProgress">
                  <input
                    type="hidden"
                    name="memberId"
                    value={member.id}
                  /><label
                    >{member.quantity
                      ? `Đã hoàn thành (trên ${member.quantity}${member.unit ? ` ${member.unit}` : ''})`
                      : 'Tiến độ (%)'}<input
                      name="value"
                      type="number"
                      min="0"
                      step={member.quantity ? '0.001' : '1'}
                      max={member.quantity ? undefined : '100'}
                      value={member.quantity
                        ? (member.done_quantity ?? 0)
                        : member.progress}
                      required
                    /></label
                  ><label
                    >Báo cáo kết quả<textarea
                      name="resultReport"
                      maxlength="10000"
                      rows="2"
                      required={member.progress === 100}
                      >{member.result_report ?? ''}</textarea
                    ></label
                  ><button class="primary" type="submit">Lưu tiến độ</button>
                </form>
              </details>
            {/if}
            {#if ['IN_PROGRESS', 'REPORTED'].includes(data.task.status) && (isManager || (data.task.task_type === 'TEAM' && String(data.currentUser.id) === String(data.task.lead_id)))}
              <details class="comment-actions">
                <summary>Nhận xét</summary>
                <form method="POST" action="?/commentMember">
                  <input
                    type="hidden"
                    name="memberId"
                    value={member.id}
                  /><label
                    >Nhận xét<textarea name="comment" maxlength="2000" rows="2"
                      >{member.lead_comment ?? ''}</textarea
                    ></label
                  ><button class="quiet" type="submit">Lưu nhận xét</button>
                </form>
              </details>
            {/if}
            {#if canEditAllocation}
              <details class="member-actions">
                <summary
                  aria-label={`Thao tác phần việc của ${member.full_name}`}
                  >•••</summary
                >
                <form method="POST" action="?/updateMember" class="member-edit">
                  <input type="hidden" name="memberId" value={member.id} />
                  <label
                    >Nội dung<input
                      name="content"
                      value={member.content}
                      required
                      maxlength="2000"
                    /></label
                  >
                  <label
                    >Khối lượng<input
                      name="quantity"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={member.quantity ?? ''}
                    /></label
                  >
                  <label
                    >Đơn vị<input
                      name="unit"
                      maxlength="80"
                      value={member.unit ?? ''}
                    /></label
                  >
                  <button class="quiet" type="submit">Lưu</button>
                </form>
                {#if data.task.task_type === 'TEAM'}
                  <form method="POST" action="?/removeMember">
                    <input
                      type="hidden"
                      name="memberId"
                      value={member.id}
                    /><button class="remove" type="submit">Xóa phần việc</button
                    >
                  </form>
                {/if}
              </details>
            {/if}
          </article>
        {/each}
      </div>
    {/if}

    {#if canEditAllocation && data.task.task_type === 'TEAM' && availablePeople.length > 0}
      <div class="assignment-tools">
        <div class="section-heading">
          <div>
            <p class="eyebrow">THÊM PHẦN VIỆC</p>
            <h3>Phân công thành viên</h3>
          </div>
        </div>
        <div class="mode-tabs" role="tablist" aria-label="Cách phân công">
          <button
            type="button"
            class:active={assignmentMode === 'single'}
            aria-pressed={assignmentMode === 'single'}
            onclick={() => (assignmentMode = 'single')}>Từng người</button
          >
          <button
            type="button"
            class:active={assignmentMode === 'bulk'}
            aria-pressed={assignmentMode === 'bulk'}
            onclick={() => (assignmentMode = 'bulk')}>Nhập bảng</button
          >
        </div>
        {#if assignmentMode === 'single'}
          <form method="POST" action="?/addMember" class="single-grid">
            <label
              >Thành viên<select name="userId" required
                ><option value="">Chọn người</option
                >{#each availablePeople as person}<option value={person.id}
                    >{person.full_name} · {person.role}</option
                  >{/each}</select
              ></label
            >
            <label
              >Nội dung<input name="content" required maxlength="2000" /></label
            >
            <label
              >Khối lượng<input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
              /></label
            >
            <label>Đơn vị<input name="unit" maxlength="80" /></label>
            <button class="primary" type="submit">Thêm</button>
          </form>
        {:else}
          <form
            method="POST"
            action="?/addMembersBulk"
            class="bulk-form"
            onsubmit={submitBulk}
          >
            <input type="hidden" name="rows" value="[]" />
            <div class="shared-fields">
              <label
                >Nội dung chung<input
                  bind:value={sharedContent}
                  name="content"
                  required
                  maxlength="2000"
                /></label
              ><label
                >Đơn vị chung<input
                  bind:value={sharedUnit}
                  name="unit"
                  maxlength="80"
                /></label
              >
            </div>
            <div class="bulk-table">
              <div class="bulk-head">
                <span>Chọn</span><span>Thành viên</span><span
                  >Khối lượng riêng</span
                >
              </div>
              {#each availablePeople as person (person.id)}
                <label class="bulk-row"
                  ><input
                    type="checkbox"
                    checked={selectedUsers.includes(String(person.id))}
                    onchange={(event) => {
                      const id = String(person.id);
                      selectedUsers = event.currentTarget.checked
                        ? [...selectedUsers, id]
                        : selectedUsers.filter((item) => item !== id);
                    }}
                  /><span>{person.full_name}<small>{person.role}</small></span
                  ><input
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="Không đặt"
                    bind:value={quantities[String(person.id)]}
                  /></label
                >
              {/each}
            </div>
            <button
              class="primary"
              type="submit"
              disabled={selectedUsers.length === 0}
              >Thêm {selectedUsers.length} phần việc <span>→</span></button
            >
          </form>
        {/if}
      </div>
    {:else if canEditAllocation && data.task.task_type !== 'TEAM'}
      <p class="single-note">
        Công việc {labels[data.task.task_type].toLowerCase()} có đúng một người thực
        hiện; không thể thêm hoặc xóa phần việc.
      </p>
    {/if}
  </section>

  <section class="section log-section" aria-labelledby="log-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">LỊCH SỬ</p>
        <h2 id="log-heading">Nhật ký công việc</h2>
      </div>
      <span class="muted">{data.logs.length} sự kiện</span>
    </div>
    {#if data.logs.length === 0}<p class="empty">Chưa có nhật ký.</p>{:else}
      <ol class="logs">
        {#each [...data.logs].reverse() as log (log.id)}<li>
            <span class="log-dot"></span>
            <div>
              <strong>{log.action}</strong><small
                >{log.actor_name} · {new Date(log.created_at).toLocaleString(
                  'vi-VN'
                )}</small
              >{#if log.detail}<pre>{JSON.stringify(
                    log.detail,
                    null,
                    2
                  )}</pre>{/if}
            </div>
          </li>{/each}
      </ol>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 1160px;
    margin: 0 auto;
    padding: 30px 28px 72px;
  }
  .back {
    display: inline-block;
    margin-bottom: 24px;
    color: #53635a;
    font-size: 12px;
    text-decoration: none;
  }
  .hero {
    padding: 24px 0 22px;
    border-bottom: 1px solid #cfd5cc;
  }
  .hero-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .task-id,
  .eyebrow {
    color: #71863b;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  .tag {
    padding: 5px 8px;
    background: #edf0e8;
    color: #56634f;
    font-size: 9px;
  }
  .status {
    background: #e9f0e8;
    color: #4e7045;
  }
  .late {
    color: #a04d3f;
    font-size: 9px;
    font-weight: 700;
  }
  .outcome {
    display: grid;
    gap: 5px;
    margin: 12px 0 0;
    border-left: 3px solid #71863b;
    background: #edf2e5;
    padding: 9px 12px;
    color: #4c6041;
    font-size: 11px;
    line-height: 1.5;
  }
  .outcome strong {
    font-size: 10px;
  }
  .outcome.rejected,
  .outcome.failed {
    border-color: #a04d3f;
    background: #f8efeb;
    color: #75483f;
  }
  .outcome.reported {
    white-space: pre-wrap;
  }
  h1 {
    max-width: 850px;
    margin: 18px 0 9px;
    font-family: Georgia, serif;
    font-size: 42px;
    font-weight: 400;
    line-height: 1.1;
  }
  .description {
    max-width: 760px;
    margin: 0;
    color: #6a756d;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .metadata {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
    margin-top: 26px;
  }
  .metadata div {
    display: grid;
    gap: 6px;
  }
  .metadata span,
  .muted {
    color: #79837b;
    font-size: 10px;
  }
  .metadata strong {
    font-size: 12px;
    font-weight: 600;
  }
  .section {
    margin-top: 30px;
    border-top: 1px solid #d3d8d0;
    padding-top: 18px;
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }
  .eyebrow {
    margin: 0 0 7px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .edit-grid,
  .single-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 12px;
    margin-top: 18px;
  }
  label {
    display: grid;
    gap: 6px;
    color: #4e5a51;
    font-size: 10px;
    font-weight: 600;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    border: 1px solid #cfd5cc;
    border-radius: 0;
    background: #fff;
    padding: 8px 10px;
    color: #202923;
    font: inherit;
    font-size: 12px;
  }
  textarea {
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid #71863b;
    outline-offset: 1px;
  }
  .primary {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    border: 0;
    background: #24342b;
    padding: 0 13px;
    color: #fff;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .primary:hover:not(:disabled) {
    background: #41583d;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .member-list {
    margin-top: 16px;
    border-top: 1px solid #e0e4dd;
  }
  .member-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.5fr) 55px 45px;
    align-items: center;
    gap: 14px;
    min-height: 76px;
    border-bottom: 1px solid #e0e4dd;
  }
  .member-person {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    display: grid;
    width: 31px;
    height: 31px;
    place-items: center;
    background: #e8eddf;
    color: #536c43;
    font-family: Georgia, serif;
  }
  .member-person div,
  .member-content {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .member-person strong,
  .member-content strong {
    font-size: 12px;
  }
  .member-person small,
  .member-content span {
    color: #7a847c;
    font-size: 10px;
  }
  .member-content strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress {
    color: #526c3f;
    font-size: 12px;
    font-weight: 700;
  }
  .member-actions {
    position: relative;
  }
  .member-actions summary {
    width: 34px;
    height: 32px;
    padding: 7px 5px;
    color: #657068;
    font-size: 13px;
    list-style: none;
    text-align: center;
    cursor: pointer;
  }
  .member-actions[open] {
    z-index: 2;
  }
  .member-edit {
    position: absolute;
    top: 34px;
    right: 0;
    display: grid;
    width: min(320px, 82vw);
    gap: 10px;
    border: 1px solid #d4dad1;
    background: #fff;
    padding: 14px;
    box-shadow: 0 8px 24px rgba(32, 41, 35, 0.1);
  }
  .quiet {
    min-height: 34px;
    border: 1px solid #cfd5cc;
    background: #fff;
    padding: 0 10px;
    color: #405046;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .remove {
    margin-top: 6px;
    border: 0;
    background: transparent;
    padding: 5px 0;
    color: #a04d3f;
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }
  .assignment-tools {
    margin-top: 26px;
    border-top: 1px solid #dfe3dc;
    padding-top: 20px;
  }
  .mode-tabs {
    display: flex;
    gap: 4px;
    margin: 14px 0;
    border-bottom: 1px solid #d9ddd5;
  }
  .mode-tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 9px 12px;
    color: #68736a;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .mode-tabs button.active {
    border-bottom-color: #71863b;
    color: #29372e;
    font-weight: 600;
  }
  .bulk-form {
    display: grid;
    gap: 14px;
  }
  .shared-fields {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }
  .bulk-table {
    border-top: 1px solid #d9ddd5;
  }
  .bulk-head,
  .bulk-row {
    display: grid;
    grid-template-columns: 42px minmax(180px, 1fr) minmax(140px, 0.6fr);
    align-items: center;
    gap: 10px;
    padding: 9px 6px;
    border-bottom: 1px solid #e5e8e2;
    font-size: 11px;
  }
  .bulk-head {
    color: #727d74;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
  }
  .bulk-row {
    cursor: pointer;
  }
  .bulk-row > input[type='checkbox'] {
    width: 16px;
    min-height: 16px;
    height: 16px;
    accent-color: #71863b;
  }
  .bulk-row span {
    display: grid;
    gap: 3px;
  }
  .bulk-row small {
    color: #7b847d;
    font-size: 9px;
  }
  .single-note,
  .empty {
    margin: 15px 0 0;
    color: #788179;
    font-size: 11px;
  }
  .logs {
    display: grid;
    gap: 0;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }
  .logs li {
    display: grid;
    grid-template-columns: 16px 1fr;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid #e5e8e2;
  }
  .log-dot {
    width: 7px;
    height: 7px;
    margin-top: 4px;
    border-radius: 50%;
    background: #a2b47d;
  }
  .logs li div {
    display: grid;
    gap: 5px;
  }
  .logs strong {
    font-size: 11px;
  }
  .logs small {
    color: #79837b;
    font-size: 9px;
  }
  .logs pre {
    overflow: auto;
    max-width: 100%;
    margin: 4px 0 0;
    background: #f0f2ec;
    padding: 8px;
    color: #58635a;
    font-size: 9px;
  }
  .notice {
    margin: 16px 0 0;
    padding: 10px 12px;
    font-size: 11px;
  }
  .error {
    background: #f9eae5;
    color: #923f34;
  }
  .success {
    background: #eaf2e3;
    color: #45613b;
  }
  @media (max-width: 760px) {
    main {
      padding: 24px 19px 56px;
    }
    h1 {
      font-size: 34px;
    }
    .metadata {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .edit-grid,
    .single-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .member-row {
      grid-template-columns: minmax(140px, 1fr) minmax(100px, 1fr) 42px 35px;
      gap: 8px;
    }
  }
  @media (max-width: 500px) {
    .metadata {
      gap: 15px 8px;
    }
    .member-row {
      grid-template-columns: 1fr 44px 34px;
      padding: 11px 0;
    }
    .member-content {
      grid-column: 1;
      grid-row: 2;
      padding-left: 41px;
    }
    .progress {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .member-actions {
      grid-column: 3;
      grid-row: 1 / span 2;
    }
    .shared-fields {
      grid-template-columns: 1fr;
    }
    .bulk-head,
    .bulk-row {
      grid-template-columns: 30px minmax(120px, 1fr) minmax(100px, 0.8fr);
    }
  }
</style>
