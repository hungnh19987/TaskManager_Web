<script lang="ts">
  let { data } = $props();
  const statuses: Array<
    [keyof typeof data.overview.statusCounts, string, string]
  > = [
    ['IN_PROGRESS', 'Đang thực hiện', 'green'],
    ['PENDING_APPROVAL', 'Chờ duyệt', 'blue'],
    ['REPORTED', 'Chờ đánh giá', 'gold'],
    ['PASSED', 'Đạt', 'green'],
    ['FAILED', 'Không đạt', 'red']
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
    FAILED: 'Không đạt'
  };
</script>

<svelte:head>
  <title>Tổng quan | Task Manager</title>
  <meta
    name="description"
    content="Tổng quan công việc, hạn hoàn thành và tải nhân sự."
  />
</svelte:head>

<main>
  <div class="heading">
    <div>
      <p class="eyebrow">OPERATIONS · OVERVIEW</p>
      <h1>Tổng quan</h1>
    </div>
    <span class="today">Hôm nay · {data.overview.today}</span>
  </div>

  <section class="metric-grid" aria-label="Tổng số công việc">
    <article class="metric primary-metric">
      <span>Tổng công việc</span><strong>{data.overview.total}</strong><small
        >{data.overview.statusCounts.DRAFT} nháp · {data.overview.statusCounts
          .REJECTED} bị từ chối</small
      >
    </article>
    <article class="metric">
      <span>Đang thực hiện</span><strong
        >{data.overview.statusCounts.IN_PROGRESS}</strong
      ><small
        >Tiến độ TB {data.overview.averageProgress === null
          ? '—'
          : `${Math.round(data.overview.averageProgress)}%`}</small
      >
    </article>
    <article class="metric">
      <span>Quá hạn</span><strong class="bad"
        >{data.overview.overdue.length}</strong
      ><small>Chưa báo cáo, hạn trước hôm nay</small>
    </article>
    <article class="metric">
      <span>Chờ duyệt</span><strong
        >{data.overview.statusCounts.PENDING_APPROVAL}</strong
      ><small>Chờ MANAGER quyết định</small>
    </article>
    <article class="metric">
      <span>Chờ đánh giá</span><strong
        >{data.overview.statusCounts.REPORTED}</strong
      ><small
        >{data.overview.statusCounts.PASSED} đạt · {data.overview.statusCounts
          .FAILED} không đạt</small
      >
    </article>
  </section>

  {#if data.overview.pendingApprovals || data.overview.pendingEvaluations}
    <a class="attention-banner" href="/approvals"
      ><span class="attention-mark">!</span><span
        ><strong>Cần xử lý</strong><small
          >{data.overview.pendingApprovals} công việc chờ duyệt · {data.overview
            .pendingEvaluations} công việc chờ đánh giá</small
        ></span
      ><span class="arrow">↗</span></a
    >
  {/if}

  <section class="status-section">
    <div class="section-title">
      <div>
        <p class="eyebrow">PORTFOLIO</p>
        <h2>Phân bố trạng thái</h2>
      </div>
      <span class="muted">{data.overview.total} công việc</span>
    </div>
    <div class="status-list">
      {#each statuses as [key, label, color]}
        {@const count = data.overview.statusCounts[key]}
        {@const ratio = data.overview.total
          ? (count / data.overview.total) * 100
          : 0}
        <div class="status-row">
          <span class="status-label">{label}</span>
          <div class="bar">
            <span class={color} style={`width:${ratio}%`}></span>
          </div>
          <strong>{count}</strong>
        </div>
      {/each}
    </div>
  </section>

  <div class="two-columns">
    <section class="list-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">ATTENTION</p>
          <h2>Quá hạn <small>{data.overview.overdue.length}</small></h2>
        </div>
        <a href="/tasks?overdue=1">Tất cả ↗</a>
      </div>
      {#if data.overview.overdue.length === 0}<p class="empty">
          Không có công việc quá hạn.
        </p>{:else}<div class="compact-list">
          {#each data.overview.overdue.slice(0, 6) as task (task.id)}<a
              href={`/tasks/${task.id}`}
              ><span class="date">{task.deadline}</span><span class="task-title"
                >{task.title}<small
                  >{task.lead_name ?? 'Chưa có chủ trì'} · {labels[
                    task.status
                  ]}</small
                ></span
              ><span class="late-dot" aria-label="Quá hạn"></span></a
            >{/each}
        </div>{/if}
    </section>
    <section class="list-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">NEXT 7 DAYS</p>
          <h2>Sắp đến hạn <small>{data.overview.dueSoon.length}</small></h2>
        </div>
        <a href="/tasks">Danh sách ↗</a>
      </div>
      {#if data.overview.dueSoon.length === 0}<p class="empty">
          Không có việc đến hạn trong 7 ngày.
        </p>{:else}<div class="compact-list">
          {#each data.overview.dueSoon.slice(0, 6) as task (task.id)}<a
              href={`/tasks/${task.id}`}
              ><span class="date">{task.deadline}</span><span class="task-title"
                >{task.title}<small
                  >{task.lead_name ?? 'Chưa có chủ trì'} · {labels[
                    task.task_type
                  ]}</small
                ></span
              ><span class="arrow">↗</span></a
            >{/each}
        </div>{/if}
    </section>
  </div>

  <section class="workload-section">
    <div class="section-title">
      <div>
        <p class="eyebrow">CAPACITY</p>
        <h2>Tải công việc theo người</h2>
      </div>
      <a href="/reports">Báo cáo ↗</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Nhân sự</th><th>Đang làm</th><th>Hoàn tất</th><th
              >Tiến độ TB</th
            ><th>Quá hạn</th><th>Chủ trì</th></tr
          ></thead
        ><tbody
          >{#each data.overview.workload as person (person.user_id)}<tr
              ><td class="person">{person.full_name}</td><td
                >{person.active_parts}</td
              ><td>{person.done_parts}</td><td
                >{person.avg_progress === null
                  ? '—'
                  : `${Math.round(person.avg_progress)}%`}</td
              ><td class:bad={person.overdue_parts > 0}
                >{person.overdue_parts}</td
              ><td>{person.leading}</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </section>
</main>

<style>
  main {
    max-width: 1320px;
    margin: 0 auto;
    padding: 34px 28px 72px;
  }
  .heading,
  .section-title {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }
  .eyebrow {
    margin: 0 0 7px;
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
    font-size: 15px;
    font-weight: 600;
  }
  h2 small {
    margin-left: 5px;
    color: #7a847c;
    font-size: 10px;
    font-weight: 400;
  }
  .today,
  .muted {
    color: #788179;
    font-size: 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    margin-top: 28px;
    border: 1px solid #dce1d8;
    background: #dce1d8;
  }
  .metric {
    display: grid;
    min-height: 108px;
    align-content: space-between;
    background: #fbfcf9;
    padding: 15px;
  }
  .metric span {
    color: #707b72;
    font-size: 10px;
  }
  .metric strong {
    font-family: Georgia, serif;
    font-size: 28px;
    font-weight: 400;
  }
  .metric small {
    color: #879087;
    font-size: 9px;
  }
  .primary-metric {
    background: #edf2e5;
  }
  .bad {
    color: #a04d3f !important;
  }
  .attention-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 15px;
    border-left: 3px solid #a06a38;
    background: #f7f0e4;
    padding: 12px 15px;
    color: #4b4539;
    text-decoration: none;
  }
  .attention-mark {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    background: #a06a38;
    color: #fff;
    font-size: 12px;
  }
  .attention-banner span:nth-child(2) {
    display: grid;
    gap: 3px;
    flex: 1;
  }
  .attention-banner strong {
    font-size: 11px;
  }
  .attention-banner small {
    color: #7f715d;
    font-size: 10px;
  }
  .arrow {
    color: #788179;
  }
  .status-section,
  .list-section,
  .workload-section {
    margin-top: 28px;
    border-top: 1px solid #cfd5cc;
    padding-top: 16px;
  }
  .status-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 13px 32px;
    margin-top: 20px;
  }
  .status-row {
    display: grid;
    grid-template-columns: 122px minmax(80px, 1fr) 28px;
    align-items: center;
    gap: 10px;
  }
  .status-label {
    color: #59645b;
    font-size: 10px;
  }
  .status-row strong {
    color: #445148;
    font-size: 10px;
    text-align: right;
  }
  .bar {
    height: 5px;
    background: #e8ebe5;
  }
  .bar span {
    display: block;
    height: 100%;
    min-width: 0;
  }
  .bar .green {
    background: #76945e;
  }
  .bar .blue {
    background: #6c929a;
  }
  .bar .gold {
    background: #b29455;
  }
  .bar .red {
    background: #ab6b5c;
  }
  .two-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px;
  }
  .section-title > a {
    color: #61764d;
    font-size: 10px;
    text-decoration: none;
  }
  .compact-list {
    margin-top: 11px;
    border-top: 1px solid #e1e5df;
  }
  .compact-list > a {
    display: grid;
    grid-template-columns: 75px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 9px;
    min-height: 55px;
    border-bottom: 1px solid #e8ebe6;
    color: inherit;
    text-decoration: none;
  }
  .compact-list > a:hover {
    background: rgba(255, 255, 255, 0.65);
  }
  .date {
    color: #768078;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .task-title {
    display: grid;
    gap: 4px;
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .task-title small {
    overflow: hidden;
    color: #879087;
    font-size: 9px;
    text-overflow: ellipsis;
  }
  .late-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #a04d3f;
  }
  .empty {
    padding: 19px 0;
    color: #858e86;
    font-size: 10px;
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
    color: #778178;
    font-size: 9px;
    font-weight: 700;
  }
  td {
    border-top: 1px solid #e7eae4;
    padding: 10px 9px;
    color: #667169;
    font-size: 10px;
  }
  td.person {
    color: #304036;
    font-weight: 600;
  }
  @media (max-width: 850px) {
    main {
      padding: 26px 19px 56px;
    }
    .metric-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .two-columns {
      gap: 18px;
    }
  }
  @media (max-width: 600px) {
    h1 {
      font-size: 34px;
    }
    .metric-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .two-columns {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .status-list {
      grid-template-columns: 1fr;
    }
    .status-row {
      grid-template-columns: 115px minmax(70px, 1fr) 24px;
    }
  }
</style>
