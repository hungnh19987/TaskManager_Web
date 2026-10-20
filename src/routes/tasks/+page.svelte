<script lang="ts">
  let { data, form } = $props();
  let selectedType = $state('TEAM');

  const taskTypes = [
    { value: 'TEAM', label: 'Nhóm' },
    { value: 'DIRECT', label: 'Giao trực tiếp' },
    { value: 'PERSONAL', label: 'Cá nhân' }
  ];
  const statuses = [
    ['DRAFT', 'Nháp'],
    ['PENDING_APPROVAL', 'Chờ duyệt'],
    ['REJECTED', 'Bị từ chối'],
    ['IN_PROGRESS', 'Đang thực hiện'],
    ['REPORTED', 'Chờ đánh giá'],
    ['PASSED', 'Đạt'],
    ['FAILED', 'Không đạt']
  ];
  const labels: Record<string, string> = {
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ duyệt',
    REJECTED: 'Bị từ chối',
    IN_PROGRESS: 'Đang thực hiện',
    REPORTED: 'Chờ đánh giá',
    PASSED: 'Đạt',
    FAILED: 'Không đạt',
    TEAM: 'Nhóm',
    DIRECT: 'Trực tiếp',
    PERSONAL: 'Cá nhân'
  };

  const canCreate = (type: string) =>
    (type === 'TEAM' && ['MANAGER', 'STAFF'].includes(data.currentUser.role)) ||
    (type === 'DIRECT' && data.currentUser.role === 'MANAGER') ||
    (type === 'PERSONAL' && data.currentUser.role === 'STAFF');
</script>

<svelte:head>
  <title>Công việc | Task Manager</title>
  <meta name="description" content="Danh sách và phân công công việc nội bộ." />
</svelte:head>

<main>
  <div class="page-heading">
    <div>
      <p class="eyebrow">WORKSPACE · TASKS</p>
      <h1>Công việc</h1>
    </div>
    <span class="result-count">{data.tasks.length} kết quả</span>
  </div>

  <section class="create-section" aria-labelledby="create-heading">
    <div class="section-title">
      <div>
        <p class="eyebrow">TẠO MỚI</p>
        <h2 id="create-heading">Công việc</h2>
      </div>
    </div>
    <div class="type-tabs" role="tablist" aria-label="Loại công việc">
      {#each taskTypes.filter((type) => canCreate(type.value)) as type}
        <button
          type="button"
          role="tab"
          aria-selected={selectedType === type.value}
          class:chosen={selectedType === type.value}
          onclick={() => (selectedType = type.value)}>{type.label}</button
        >
      {/each}
    </div>
    {#if form?.createError}<p class="notice error" role="alert">
        {form.createError}
      </p>{/if}
    <form method="POST" action="?/create" class="create-form">
      <input type="hidden" name="taskType" value={selectedType} />
      <label>Tên công việc<input name="title" required maxlength="200" /></label
      >
      <label
        >Mô tả<textarea name="description" rows="2" maxlength="10000"
        ></textarea></label
      >
      <label
        >Hạn hoàn thành<input
          name="deadline"
          type="date"
          required
          value={new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}
        /></label
      >
      {#if selectedType === 'TEAM'}
        <label
          >Người chủ trì<select name="leadId" required
            ><option value="">Chọn người</option
            >{#each data.people as person}<option value={person.id}
                >{person.full_name} · {person.role}</option
              >{/each}</select
          ></label
        >
      {:else if selectedType === 'DIRECT'}
        <label
          >Người nhận<select name="leadId" required
            ><option value="">Chọn người</option
            >{#each data.people as person}<option value={person.id}
                >{person.full_name} · {person.role}</option
              >{/each}</select
          ></label
        >
      {:else}
        <input type="hidden" name="leadId" value={data.currentUser.id} />
        <label
          >Phần việc của tôi<input
            name="memberContent"
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
          /></label
        >
        <label>Đơn vị<input name="unit" maxlength="80" /></label>
      {/if}
      {#if selectedType === 'DIRECT'}
        <label
          >Nội dung phần việc<input
            name="memberContent"
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
          /></label
        >
        <label>Đơn vị<input name="unit" maxlength="80" /></label>
      {/if}
      <button class="primary" type="submit">Tạo công việc <span>→</span></button
      >
    </form>
  </section>

  <section class="list-section" aria-labelledby="list-heading">
    <div class="section-title">
      <div>
        <p class="eyebrow">THEO DÕI</p>
        <h2 id="list-heading">Danh sách</h2>
      </div>
    </div>
    <form method="GET" class="filters">
      <label class="search"
        >Tìm công việc<input
          name="q"
          value={data.filters.search}
          placeholder="Tên hoặc mô tả"
        /></label
      >
      <label
        >Loại<select name="type" value={data.filters.taskType}
          ><option value="">Tất cả</option>{#each taskTypes as type}<option
              value={type.value}>{type.label}</option
            >{/each}</select
        ></label
      >
      <label
        >Trạng thái<select name="status"
          ><option value="">Tất cả</option
          >{#each statuses as [value, label]}<option {value}>{label}</option
            >{/each}</select
        ></label
      >
      <label class="check-filter"
        ><input
          type="checkbox"
          name="mine"
          value="1"
          checked={data.filters.involvedOnly}
        /> Việc liên quan đến tôi</label
      >
      <label class="check-filter"
        ><input
          type="checkbox"
          name="overdue"
          value="1"
          checked={data.filters.overdueOnly}
        /> Quá hạn</label
      >
      <button type="submit" class="quiet-button">Lọc</button>
    </form>

    {#if data.tasks.length === 0}
      <div class="empty">
        <span>—</span><strong>Không có công việc phù hợp</strong>
        <p>Thay đổi bộ lọc hoặc tạo công việc mới.</p>
      </div>
    {:else}
      <div class="task-list">
        {#each data.tasks as task (task.id)}
          <a class="task-row" href={`/tasks/${task.id}`}>
            <span class="task-id">#{task.id}</span>
            <span class="task-main"
              ><strong>{task.title}</strong><small
                >{task.proposer_name} · {task.lead_name ??
                  'Chưa có chủ trì'}</small
              ></span
            >
            <span class="tag type">{labels[task.task_type]}</span>
            <span class="tag status-{task.status.toLowerCase()}"
              >{labels[task.status]}</span
            >
            <span class="task-progress"
              >{task.avg_progress === null
                ? '—'
                : `${Math.round(task.avg_progress)}%`}</span
            >
            <span class:late={task.overdue} class="task-deadline"
              >{task.deadline}{task.overdue ? ' · Quá hạn' : ''}</span
            >
            <span class="row-arrow" aria-hidden="true">↗</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 1320px;
    margin: 0 auto;
    padding: 36px 30px 72px;
  }
  .page-heading,
  .section-title {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
  }
  .eyebrow {
    margin: 0 0 8px;
    color: #71863b;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }
  h1 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 40px;
    font-weight: 400;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .result-count {
    color: #6d786f;
    font-size: 12px;
  }
  .create-section,
  .list-section {
    margin-top: 32px;
    border-top: 1px solid #cfd5cc;
    padding-top: 18px;
  }
  .type-tabs {
    display: flex;
    gap: 4px;
    margin: 18px 0;
    border-bottom: 1px solid #d9ddd5;
  }
  .type-tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 10px 14px;
    color: #69736c;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .type-tabs button.chosen {
    border-bottom-color: #71863b;
    color: #29372e;
    font-weight: 600;
  }
  .create-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 12px;
  }
  .create-form label,
  .filters label:not(.check-filter) {
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
  .create-form label:nth-child(3),
  .create-form label:nth-child(4) {
    grid-column: span 1;
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
    font-size: 12px;
    cursor: pointer;
  }
  .primary span {
    color: #d2f36b;
    font-size: 18px;
  }
  .primary:hover {
    background: #41583d;
  }
  .filters {
    display: grid;
    grid-template-columns:
      minmax(180px, 2fr) repeat(2, minmax(130px, 1fr))
      auto auto auto;
    align-items: end;
    gap: 10px;
    margin: 20px 0;
  }
  .check-filter {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    color: #4e5a51;
    font-size: 11px;
    white-space: nowrap;
  }
  .check-filter input {
    width: 15px;
    min-height: 15px;
    height: 15px;
    accent-color: #71863b;
  }
  .quiet-button {
    min-height: 38px;
    border: 1px solid #cfd5cc;
    background: #fff;
    padding: 0 16px;
    color: #35453a;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .task-list {
    border-top: 1px solid #d9ddd5;
  }
  .task-row {
    display: grid;
    grid-template-columns: 54px minmax(180px, 1fr) 95px 132px 56px 150px 22px;
    align-items: center;
    gap: 12px;
    min-height: 70px;
    border-bottom: 1px solid #e0e4dd;
    color: inherit;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .task-row:hover {
    background: rgba(255, 255, 255, 0.75);
  }
  .task-id,
  .task-progress {
    color: #6d786f;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .task-main {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .task-main strong {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .task-main small {
    overflow: hidden;
    color: #788179;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    width: fit-content;
    padding: 5px 7px;
    font-size: 9px;
    white-space: nowrap;
  }
  .type {
    background: #edf0e8;
    color: #56634f;
  }
  .status-draft,
  .status-rejected {
    background: #f1eee4;
    color: #756b4f;
  }
  .status-pending_approval,
  .status-reported {
    background: #e9f0f1;
    color: #496a70;
  }
  .status-in_progress {
    background: #edf3df;
    color: #58733e;
  }
  .status-passed {
    background: #e6f2e8;
    color: #3e764c;
  }
  .status-failed {
    background: #f8e9e5;
    color: #9b4b3e;
  }
  .task-deadline {
    color: #68736a;
    font-size: 10px;
    white-space: nowrap;
  }
  .task-deadline.late {
    color: #a04d3f;
    font-weight: 600;
  }
  .row-arrow {
    color: #8b948c;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 55px 15px;
    color: #68736a;
    text-align: center;
  }
  .empty span {
    font-size: 25px;
  }
  .empty strong {
    color: #344138;
    font-size: 14px;
  }
  .empty p {
    margin: 0;
    font-size: 12px;
  }
  .notice {
    padding: 10px 12px;
    font-size: 12px;
  }
  .error {
    background: #f9eae5;
    color: #923f34;
  }
  @media (max-width: 900px) {
    .create-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .filters {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .task-row {
      grid-template-columns: 42px minmax(130px, 1fr) 80px 110px 45px 18px;
    }
    .task-deadline {
      display: none;
    }
  }
  @media (max-width: 600px) {
    main {
      padding: 26px 18px 54px;
    }
    h1 {
      font-size: 34px;
    }
    .create-form,
    .filters {
      grid-template-columns: 1fr 1fr;
    }
    .filters .search {
      grid-column: span 2;
    }
    .task-row {
      grid-template-columns: 35px minmax(0, 1fr) 18px;
      gap: 8px;
      padding: 10px 0;
    }
    .task-row .tag,
    .task-progress {
      display: none;
    }
    .task-main strong {
      white-space: normal;
    }
  }
</style>
