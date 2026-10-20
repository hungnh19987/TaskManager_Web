<script lang="ts">
  let { data } = $props();
  let activeTab = $state('approval');
  const statuses: Record<string, string> = {
    PENDING_APPROVAL: 'Chờ phê duyệt',
    REPORTED: 'Chờ đánh giá'
  };
</script>

<svelte:head><title>Phê duyệt | Task Manager</title></svelte:head>

<main>
  <div class="heading">
    <div>
      <p class="eyebrow">WORKFLOW · REVIEW</p>
      <h1>Phê duyệt</h1>
    </div>
    <span class="role"
      >{data.isManager ? 'MANAGER · Có quyền quyết định' : 'Chỉ xem'}</span
    >
  </div>
  <div class="tabs" role="tablist" aria-label="Hàng đợi">
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === 'approval'}
      class:active={activeTab === 'approval'}
      onclick={() => (activeTab = 'approval')}
      >Chờ phê duyệt <span>{data.pending.length}</span></button
    >
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === 'evaluation'}
      class:active={activeTab === 'evaluation'}
      onclick={() => (activeTab = 'evaluation')}
      >Chờ đánh giá <span>{data.reported.length}</span></button
    >
  </div>
  {#if activeTab === 'approval'}
    {#if data.pending.length === 0}
      <div class="empty">
        <span>—</span><strong>Không có việc chờ phê duyệt</strong>
      </div>
    {:else}
      <div class="queue">
        {#each data.pending as task (task.id)}
          <a class="row" href={`/tasks/${task.id}`}>
            <span class="id">#{task.id}</span><span class="main"
              ><strong>{task.title}</strong><small
                >{task.proposer_name} · Chủ trì: {task.lead_name ??
                  'Chưa chọn'}</small
              ></span
            ><span class="deadline">{task.deadline}</span><span class="status"
              >{statuses[task.status]}</span
            ><span class="arrow">↗</span>
          </a>
        {/each}
      </div>
    {/if}
  {:else if data.reported.length === 0}
    <div class="empty">
      <span>—</span><strong>Không có việc chờ đánh giá</strong>
    </div>
  {:else}
    <div class="queue">
      {#each data.reported as task (task.id)}
        <a class="row" href={`/tasks/${task.id}`}>
          <span class="id">#{task.id}</span><span class="main"
            ><strong>{task.title}</strong><small
              >{task.proposer_name} · Chủ trì: {task.lead_name ??
                'Không có'}</small
            ></span
          ><span class="deadline">{task.deadline}</span><span class="status"
            >{statuses[task.status]}</span
          ><span class="arrow">↗</span>
        </a>
      {/each}
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 38px 28px 72px;
  }
  .heading {
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
  .role {
    color: #758078;
    font-size: 10px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-top: 30px;
    border-bottom: 1px solid #cfd5cc;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-height: 43px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 0 12px;
    color: #69736c;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .tabs button.active {
    border-bottom-color: #71863b;
    color: #29372e;
    font-weight: 600;
  }
  .tabs span {
    display: grid;
    min-width: 19px;
    height: 19px;
    place-items: center;
    background: #e8eddf;
    color: #536b43;
    font-size: 9px;
  }
  .queue {
    border-top: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 52px minmax(180px, 1fr) 110px 130px 24px;
    align-items: center;
    gap: 14px;
    min-height: 75px;
    border-bottom: 1px solid #e0e4dd;
    color: inherit;
    text-decoration: none;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.75);
  }
  .id,
  .deadline {
    color: #707a72;
    font-size: 10px;
  }
  .main {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .main strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main small {
    color: #7a847c;
    font-size: 10px;
  }
  .status {
    width: fit-content;
    background: #e9f0f1;
    padding: 5px 8px;
    color: #496a70;
    font-size: 9px;
  }
  .arrow {
    color: #7d877f;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 70px 15px;
    color: #68736a;
  }
  .empty span {
    font-size: 25px;
  }
  .empty strong {
    color: #344138;
    font-size: 13px;
  }
  @media (max-width: 650px) {
    main {
      padding: 27px 18px 54px;
    }
    h1 {
      font-size: 34px;
    }
    .row {
      grid-template-columns: 35px minmax(0, 1fr) 20px;
      gap: 8px;
      padding: 12px 0;
    }
    .deadline,
    .status {
      display: none;
    }
  }
</style>
