<script lang="ts">
  import type { TaskStatus } from '$lib/server/tasks/service';

  let { data, form } = $props();
  const types = [
    ['TEAM', 'Nhóm'],
    ['DIRECT', 'Giao trực tiếp'],
    ['PERSONAL', 'Cá nhân']
  ];
  const statuses: Array<[TaskStatus, string]> = [
    ['DRAFT', 'Nháp'],
    ['PENDING_APPROVAL', 'Chờ duyệt'],
    ['REJECTED', 'Bị từ chối'],
    ['IN_PROGRESS', 'Đang thực hiện'],
    ['REPORTED', 'Chờ đánh giá'],
    ['PASSED', 'Đạt'],
    ['FAILED', 'Không đạt']
  ];
  const labels: Record<string, string> = {
    TEAM: 'Nhóm',
    DIRECT: 'Trực tiếp',
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
</script>

<svelte:head><title>Báo cáo | Task Manager</title></svelte:head>

<main>
  <div class="heading">
    <div>
      <p class="eyebrow">ANALYTICS · REPORTS</p>
      <h1>Báo cáo công việc</h1>
    </div>
  </div>
  <form method="GET" class="filters">
    <label
      >Từ hạn<input type="date" name="from" value={data.filters.from} /></label
    >
    <label>Đến hạn<input type="date" name="to" value={data.filters.to} /></label
    >
    <label
      >Loại<select name="type" value={data.filters.type}
        ><option value="">Tất cả</option>{#each types as [value, label]}<option
            {value}>{label}</option
          >{/each}</select
      ></label
    >
    <label
      >Trạng thái<select name="status" multiple size="3"
        >{#each statuses as [value, label]}<option
            {value}
            selected={data.filters.statuses.includes(value)}>{label}</option
          >{/each}</select
      ></label
    >
    <label
      >Người liên quan<select name="user" value={data.filters.user}
        ><option value="">Tất cả</option>{#each data.people as person}<option
            value={person.user_id}>{person.full_name}</option
          >{/each}</select
      ></label
    >
    <button class="quiet" type="submit">Áp dụng bộ lọc</button>
  </form>

  {#if data.error}<p class="notice error" role="alert">{data.error}</p>{/if}
  {#if form?.error}<p class="notice error" role="alert">{form.error}</p>{/if}

  <section class="metrics" aria-label="Tổng quan báo cáo">
    <article>
      <span>Tổng công việc</span><strong>{data.summary.total}</strong>
    </article>
    <article>
      <span>Đạt</span><strong class="good">{data.summary.passed}</strong>
    </article>
    <article>
      <span>Không đạt</span><strong class="bad">{data.summary.failed}</strong>
    </article>
    <article>
      <span>Quá hạn</span><strong class="bad">{data.summary.overdue}</strong>
    </article>
    <article>
      <span>Tỷ lệ đạt</span><strong
        >{data.summary.passRate === null
          ? '—'
          : `${Math.round(data.summary.passRate * 100)}%`}</strong
      >
    </article>
  </section>

  <section class="section">
    <div class="section-heading">
      <div>
        <p class="eyebrow">TASK REGISTER</p>
        <h2>Danh sách công việc</h2>
      </div>
      <form method="POST" action="?/exportCsv">
        <input type="hidden" name="from" value={data.filters.from} />
        <input type="hidden" name="to" value={data.filters.to} />
        <input type="hidden" name="type" value={data.filters.type} />
        <input type="hidden" name="user" value={data.filters.user} />
        <input type="hidden" name="scope" value="tasks" />
        {#each data.filters.statuses as status}<input
            type="hidden"
            name="status"
            value={status}
          />{/each}
        <button class="download" type="submit" disabled={!data.tasks.length}
          >Tải CSV <span aria-hidden="true">↓</span></button
        >
      </form>
    </div>
    {#if data.tasks.length === 0}<p class="empty">
        Không có công việc phù hợp bộ lọc.
      </p>{:else}
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Mã</th><th>Công việc</th><th>Loại</th><th>Trạng thái</th><th
                >Người đề xuất</th
              ><th>Chủ trì</th><th>Hạn</th><th>Tiến độ</th><th>Đánh giá</th></tr
            ></thead
          ><tbody>
            {#each data.tasks as task (task.id)}<tr
                ><td><a href={`/tasks/${task.id}`}>#{task.id}</a></td><td
                  class="title">{task.title}</td
                ><td>{labels[task.task_type]}</td><td
                  ><span class="status">{labels[task.status]}</span></td
                ><td>{task.proposer_name}</td><td>{task.lead_name ?? '—'}</td
                ><td class:late={task.overdue}>{task.deadline}</td><td
                  >{task.avg_progress === null
                    ? '—'
                    : `${Math.round(task.avg_progress)}%`}</td
                ><td>{labels[task.eval_result ?? ''] ?? '—'}</td></tr
              >{/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="section">
    <div class="section-heading">
      <div>
        <p class="eyebrow">PEOPLE</p>
        <h2>Thống kê theo người</h2>
      </div>
      <form method="POST" action="?/exportCsv">
        <input type="hidden" name="from" value={data.filters.from} />
        <input type="hidden" name="to" value={data.filters.to} />
        <input type="hidden" name="type" value={data.filters.type} />
        <input type="hidden" name="user" value={data.filters.user} />
        <input type="hidden" name="scope" value="people" />
        {#each data.filters.statuses as status}<input
            type="hidden"
            name="status"
            value={status}
          />{/each}
        <button class="download" type="submit" disabled={!data.people.length}
          >Tải thống kê CSV <span aria-hidden="true">↓</span></button
        >
      </form>
    </div>
    {#if data.people.length === 0}<p class="empty">
        Không có dữ liệu trong kỳ.
      </p>{:else}
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Người</th><th>Phần việc</th><th>Hoàn thành</th><th
                >Tiến độ TB</th
              ><th>Đạt</th><th>Không đạt</th><th>Quá hạn</th><th>Chủ trì</th><th
                >Chủ trì đạt</th
              ><th>Chủ trì không đạt</th></tr
            ></thead
          ><tbody>
            {#each data.people as person (person.user_id)}<tr
                ><td class="title">{person.full_name}</td><td>{person.parts}</td
                ><td>{person.completed}</td><td
                  >{person.avg_progress === null
                    ? '—'
                    : `${Math.round(person.avg_progress)}%`}</td
                ><td>{person.passed}</td><td>{person.failed}</td><td
                  >{person.overdue_parts}</td
                ><td>{person.led_total}</td><td>{person.led_passed}</td><td
                  >{person.led_failed}</td
                ></tr
              >{/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 1420px;
    margin: 0 auto;
    padding: 38px 28px 72px;
  }
  .heading,
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }
  .eyebrow {
    margin: 0 0 8px;
    color: #71863b;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  h1 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 40px;
    font-weight: 400;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(5, minmax(120px, 1fr)) auto;
    align-items: end;
    gap: 10px;
    margin-top: 26px;
    border-top: 1px solid #cfd5cc;
    border-bottom: 1px solid #cfd5cc;
    padding: 16px 0;
  }
  .filters label {
    display: grid;
    gap: 6px;
    color: #4e5a51;
    font-size: 10px;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    border: 1px solid #cfd5cc;
    border-radius: 0;
    background: #fff;
    padding: 7px 9px;
    color: #202923;
    font: inherit;
    font-size: 11px;
  }
  input:focus,
  select:focus {
    outline: 2px solid #71863b;
    outline-offset: 1px;
  }
  .quiet,
  .download {
    min-height: 38px;
    border: 1px solid #cfd5cc;
    background: #fff;
    padding: 0 12px;
    color: #3d4a40;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .download {
    border-color: #24342b;
    background: #24342b;
    color: white;
  }
  .download span {
    margin-left: 8px;
    color: #d2f36b;
    font-size: 15px;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1px;
    margin-top: 22px;
    border: 1px solid #dce1d8;
    background: #dce1d8;
  }
  .metrics article {
    display: grid;
    gap: 8px;
    min-height: 78px;
    align-content: center;
    background: #fbfcf9;
    padding: 12px 16px;
  }
  .metrics span {
    color: #717b73;
    font-size: 10px;
  }
  .metrics strong {
    font-family: Georgia, serif;
    font-size: 23px;
    font-weight: 400;
  }
  .good {
    color: #477348;
  }
  .bad {
    color: #9a4a3e;
  }
  .section {
    margin-top: 32px;
    border-top: 1px solid #cfd5cc;
    padding-top: 17px;
  }
  .table-wrap {
    overflow-x: auto;
    margin-top: 14px;
    border-top: 1px solid #dce1d8;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    white-space: nowrap;
  }
  th {
    padding: 10px 9px;
    color: #748077;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  td {
    border-top: 1px solid #e7eae4;
    padding: 11px 9px;
    color: #566158;
    font-size: 10px;
  }
  td a {
    color: #58733e;
    text-decoration: none;
  }
  td.title {
    max-width: 260px;
    overflow: hidden;
    color: #2b3930;
    text-overflow: ellipsis;
  }
  .status {
    background: #edf0e8;
    padding: 4px 6px;
    color: #53634d;
    font-size: 9px;
  }
  .late {
    color: #a04d3f;
  }
  .empty {
    padding: 30px 0;
    color: #788179;
    font-size: 11px;
  }
  .notice {
    padding: 10px 12px;
    font-size: 11px;
  }
  .error {
    background: #f9eae5;
    color: #923f34;
  }
  @media (max-width: 900px) {
    main {
      padding: 28px 18px 54px;
    }
    .filters {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .metrics {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 560px) {
    h1 {
      font-size: 34px;
    }
    .filters {
      grid-template-columns: 1fr 1fr;
    }
    .metrics {
      grid-template-columns: repeat(2, 1fr);
    }
    .section-heading {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
