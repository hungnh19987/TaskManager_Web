<script lang="ts">
  let { data, form } = $props();
  const roles = [
    { value: 'ADMIN', label: 'ADMIN · Quản trị' },
    { value: 'MANAGER', label: 'MANAGER · Trưởng phòng' },
    { value: 'STAFF', label: 'STAFF · Nhân viên' }
  ];
</script>

<svelte:head><title>Quản lý tài khoản | Task Manager</title></svelte:head>

<main>
  <div class="heading">
    <div>
      <p class="eyebrow">QUẢN TRỊ HỆ THỐNG</p>
      <h1>Tài khoản</h1>
    </div>
    <span class="count">{data.accounts.length} tài khoản</span>
  </div>

  {#if form?.message}<p class="notice error" role="alert">
      {form.message}
    </p>{/if}
  {#if form?.success}<p class="notice success" role="status">
      {form.success}
    </p>{/if}

  <section class="create" aria-labelledby="create-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">TÀI KHOẢN MỚI</p>
        <h2 id="create-title">Tạo người dùng</h2>
      </div>
    </div>
    <form method="POST" action="?/create" class="create-grid">
      <label
        >Tên đăng nhập<input
          name="username"
          required
          minlength="3"
          maxlength="32"
          pattern="[a-z0-9._-]+"
          autocomplete="off"
        /></label
      >
      <label>Họ tên<input name="fullName" required maxlength="120" /></label>
      <label
        >Vai trò<select name="role"
          >{#each roles as role}<option value={role.value}>{role.label}</option
            >{/each}</select
        ></label
      >
      <label
        >Mật khẩu tạm<input
          name="password"
          type="password"
          required
          minlength="12"
          maxlength="128"
          autocomplete="new-password"
        /></label
      >
      <button type="submit">Tạo tài khoản <span>→</span></button>
    </form>
  </section>

  <section class="accounts" aria-labelledby="accounts-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">DANH SÁCH</p>
        <h2 id="accounts-title">Người dùng</h2>
      </div>
    </div>
    {#if data.accounts.length === 0}
      <p class="empty">Chưa có tài khoản nào.</p>
    {:else}
      <div class="account-list">
        {#each data.accounts as account (account.id)}
          <article class="account-row">
            <div class="account-name">
              <strong>{account.fullName}</strong><span>@{account.username}</span
              >
              <small class:locked={!account.isActive}
                >{account.isActive ? 'ĐANG HOẠT ĐỘNG' : 'ĐÃ KHÓA'}</small
              >
            </div>
            <form method="POST" action="?/setRole" class="inline-form">
              <input type="hidden" name="targetId" value={account.id} />
              <label class="sr-only" for={`role-${account.id}`}
                >Vai trò của {account.fullName}</label
              >
              <select
                id={`role-${account.id}`}
                name="role"
                value={account.role}
              >
                {#each roles as role}<option value={role.value}
                    >{role.value}</option
                  >{/each}
              </select>
              <button type="submit" class="quiet">Lưu vai trò</button>
            </form>
            <form
              method="POST"
              action="?/resetPassword"
              class="inline-form reset-form"
            >
              <input type="hidden" name="targetId" value={account.id} />
              <label class="sr-only" for={`password-${account.id}`}
                >Mật khẩu mới cho {account.fullName}</label
              >
              <input
                id={`password-${account.id}`}
                name="password"
                type="password"
                required
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
                placeholder="Mật khẩu mới"
              />
              <button type="submit" class="quiet">Đặt lại</button>
            </form>
            <form method="POST" action="?/setActive">
              <input type="hidden" name="targetId" value={account.id} />
              <input
                type="hidden"
                name="active"
                value={String(!account.isActive)}
              />
              <button
                type="submit"
                class:danger={account.isActive}
                class="quiet"
                disabled={account.isActive && account.id === data.currentUserId}
                >{account.isActive ? 'Khóa' : 'Mở khóa'}</button
              >
            </form>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 44px 28px 72px;
  }
  .heading,
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 20px;
  }
  .eyebrow {
    margin: 0 0 8px;
    color: #71863b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  h1 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 42px;
    font-weight: 400;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .count {
    color: #6d786f;
    font-size: 12px;
  }
  .create,
  .accounts {
    margin-top: 34px;
    border-top: 1px solid #cfd5cc;
    padding-top: 20px;
  }
  .create-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-top: 22px;
    align-items: end;
  }
  label {
    display: grid;
    gap: 7px;
    color: #45534a;
    font-size: 11px;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    height: 40px;
    border: 1px solid #cfd5cc;
    border-radius: 0;
    background: #fff;
    padding: 0 10px;
    color: #202923;
    font: inherit;
    font-size: 12px;
  }
  input:focus,
  select:focus {
    outline: 2px solid #71863b;
    outline-offset: 1px;
  }
  button {
    min-height: 40px;
    border: 0;
    background: #24342b;
    padding: 0 13px;
    color: white;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button:hover {
    background: #41583d;
  }
  .create-grid button {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .create-grid button span {
    color: #d2f36b;
    font-size: 17px;
  }
  .account-list {
    margin-top: 18px;
    border-top: 1px solid #e0e4dd;
  }
  .account-row {
    display: grid;
    grid-template-columns:
      minmax(150px, 1fr) minmax(175px, 0.8fr) minmax(235px, 1.2fr)
      auto;
    align-items: center;
    gap: 16px;
    min-height: 88px;
    border-bottom: 1px solid #e0e4dd;
  }
  .account-name {
    display: grid;
    gap: 4px;
  }
  .account-name strong {
    font-size: 13px;
  }
  .account-name span {
    color: #707a72;
    font-size: 11px;
  }
  .account-name small {
    width: fit-content;
    margin-top: 4px;
    color: #567645;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .account-name small.locked {
    color: #9a5943;
  }
  .inline-form {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inline-form select {
    flex: 1;
  }
  .inline-form input:not([type='hidden']) {
    flex: 1;
  }
  button.quiet {
    min-height: 36px;
    border: 1px solid #cfd5cc;
    background: transparent;
    color: #405046;
    white-space: nowrap;
  }
  button.quiet:hover {
    background: #e9ede3;
  }
  button.danger {
    color: #984a3d;
  }
  .notice {
    margin: 20px 0 0;
    padding: 12px 14px;
    font-size: 12px;
  }
  .error {
    background: #f9eae5;
    color: #923f34;
  }
  .success {
    background: #eaf2e3;
    color: #45613b;
  }
  .empty {
    margin: 22px 0;
    color: #788179;
    font-size: 13px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  @media (max-width: 900px) {
    .create-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .account-row {
      grid-template-columns: 1fr 1fr;
      padding: 16px 0;
    }
  }
  @media (max-width: 560px) {
    main {
      padding: 30px 20px 56px;
    }
    .create-grid,
    .account-row {
      grid-template-columns: 1fr;
    }
    .account-row {
      gap: 12px;
    }
    .reset-form {
      max-width: 100%;
    }
  }
</style>
