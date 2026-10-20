<script lang="ts">
  let { data } = $props();
  const statusLabels: Record<string, string> = {
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ duyệt',
    REJECTED: 'Bị từ chối',
    IN_PROGRESS: 'Đang thực hiện',
    REPORTED: 'Chờ đánh giá'
  };
</script>

<svelte:head><title>Công việc của tôi | Task Manager</title></svelte:head>

<main>
  <div class="heading">
    <div>
      <p class="eyebrow">PERSONAL WORKSPACE</p>
      <h1>Công việc của tôi</h1>
    </div>
  </div>
  {#if !data.work.parts.length && !data.work.leading.length && !data.work.proposed.length}
    <div class="empty">
      <span>—</span><strong>Chưa có công việc cần xử lý</strong>
    </div>
  {/if}

  <section>
    <div class="section-heading">
      <div>
        <p class="eyebrow">THỰC HIỆN</p>
        <h2>Phần việc của tôi <small>{data.work.parts.length}</small></h2>
      </div>
    </div>
    {#if data.work.parts.length}<div class="rows">
        {#each data.work.parts as part (`${part.task_id}-${part.member_id}`)}
          <a class="row" href={`/tasks/${part.task_id}`}
            ><span class="id">#{part.task_id}</span><span class="main"
              ><strong>{part.title}</strong><small
                >{part.content} · Chủ trì: {part.lead_name ?? 'Chưa có'}</small
              ></span
            ><span class="progress">{part.progress}%</span><span class="status"
              >{statusLabels[part.status]}</span
            ><span class:late={part.overdue} class="deadline"
              >{part.deadline}</span
            ></a
          >
        {/each}
      </div>{:else}<p class="muted">Không có phần việc đang thực hiện.</p>{/if}
  </section>

  <section>
    <div class="section-heading">
      <div>
        <p class="eyebrow">ĐIỀU PHỐI</p>
        <h2>Việc tôi chủ trì <small>{data.work.leading.length}</small></h2>
      </div>
    </div>
    {#if data.work.leading.length}<div class="rows">
        {#each data.work.leading as task (task.id)}
          <a class="row" href={`/tasks/${task.id}`}
            ><span class="id">#{task.id}</span><span class="main"
              ><strong>{task.title}</strong><small
                >{task.member_count} thành viên · Tiến độ TB {task.avg_progress ===
                null
                  ? 0
                  : Math.round(task.avg_progress)}%</small
              ></span
            ><span class="progress"
              >{task.avg_progress === null
                ? 0
                : Math.round(task.avg_progress)}%</span
            ><span class="status">{statusLabels[task.status]}</span><span
              class:late={task.overdue}
              class="deadline">{task.deadline}</span
            ></a
          >
        {/each}
      </div>{:else}<p class="muted">
        Bạn không chủ trì TEAM đang thực hiện.
      </p>{/if}
  </section>

  <section>
    <div class="section-heading">
      <div>
        <p class="eyebrow">ĐỀ XUẤT</p>
        <h2>Việc tôi đề xuất <small>{data.work.proposed.length}</small></h2>
      </div>
    </div>
    {#if data.work.proposed.length}<div class="rows">
        {#each data.work.proposed as task (task.id)}
          <a class="row" href={`/tasks/${task.id}`}
            ><span class="id">#{task.id}</span><span class="main"
              ><strong>{task.title}</strong><small
                >{task.reject_reason ?? 'Theo dõi trạng thái xử lý'}</small
              ></span
            ><span class="status">{statusLabels[task.status]}</span><span
              class:late={task.overdue}
              class="deadline">{task.deadline}</span
            ><span class="arrow">↗</span></a
          >
        {/each}
      </div>{:else}<p class="muted">Không có đề xuất cần theo dõi.</p>{/if}
  </section>
</main>

<style>
  main {
    max-width: 1160px;
    margin: 0 auto;
    padding: 38px 28px 70px;
  }
  .heading,
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
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
  h2 small {
    margin-left: 6px;
    color: #7a847c;
    font-size: 10px;
    font-weight: 400;
  }
  section {
    margin-top: 30px;
    border-top: 1px solid #cfd5cc;
    padding-top: 18px;
  }
  .rows {
    margin-top: 14px;
    border-top: 1px solid #e0e4dd;
  }
  .row {
    display: grid;
    grid-template-columns: 48px minmax(170px, 1fr) 60px 125px 115px;
    align-items: center;
    gap: 12px;
    min-height: 68px;
    border-bottom: 1px solid #e0e4dd;
    color: inherit;
    text-decoration: none;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.75);
  }
  .id,
  .deadline,
  .progress {
    color: #6f7a71;
    font-size: 10px;
  }
  .progress {
    color: #526c3f;
    font-weight: 700;
  }
  .main {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .main strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main small {
    overflow: hidden;
    color: #79837b;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    width: fit-content;
    background: #edf0e8;
    padding: 5px 8px;
    color: #52614c;
    font-size: 9px;
  }
  .late {
    color: #a04d3f;
  }
  .muted {
    color: #788179;
    font-size: 11px;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 70px 15px;
    color: #68736a;
  }
  .empty span {
    font-size: 24px;
  }
  .empty strong {
    color: #344138;
    font-size: 13px;
  }
  @media (max-width: 680px) {
    main {
      padding: 27px 18px 54px;
    }
    h1 {
      font-size: 34px;
    }
    .row {
      grid-template-columns: 32px minmax(0, 1fr) 20px;
      gap: 8px;
      padding: 10px 0;
    }
    .progress,
    .status {
      display: none;
    }
    .deadline {
      font-size: 9px;
    }
  }
</style>
