<script lang="ts">
  let { data, children } = $props();
</script>

<svelte:head>
  <meta name="color-scheme" content="light" />
</svelte:head>

{#if data.user}
  <div class="app-shell">
    <header>
      <a class="brand" href="/" aria-label="Task Manager, trang chủ">
        <span class="brand-mark" aria-hidden="true">T</span>
        <span>Task Manager</span>
      </a>
      <nav aria-label="Tài khoản">
        <a href="/tasks">Công việc</a>
        <a href="/approvals">Phê duyệt</a>
        <span class="identity"
          >{data.user.fullName} <small>{data.user.role}</small></span
        >
        <a href="/account/password">Đổi mật khẩu</a>
        {#if data.user.role === 'ADMIN'}<a href="/admin/accounts">Tài khoản</a
          >{/if}
        <form method="POST" action="/?/logout">
          <button type="submit">Đăng xuất</button>
        </form>
      </nav>
    </header>
    {@render children()}
  </div>
{:else}
  {@render children()}
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: #f4f4f0;
    color: #202923;
    font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
  }
  .app-shell {
    min-height: 100vh;
  }
  header {
    display: flex;
    min-height: 72px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 0 6vw;
    border-bottom: 1px solid #d9ddd5;
    background: rgba(255, 255, 255, 0.7);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: inherit;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }
  .brand-mark {
    display: grid;
    width: 29px;
    height: 29px;
    place-items: center;
    background: #d2f36b;
    font-family: Georgia, serif;
  }
  nav {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 20px;
  }
  nav a,
  nav button {
    border: 0;
    background: transparent;
    color: #405046;
    font: inherit;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
  }
  nav a:hover,
  nav button:hover {
    color: #71863b;
  }
  .identity {
    display: grid;
    gap: 3px;
    font-size: 13px;
    font-weight: 600;
  }
  small {
    color: #788179;
    font-size: 9px;
    letter-spacing: 0.1em;
  }
  form {
    margin: 0;
  }
  @media (max-width: 720px) {
    header {
      align-items: flex-start;
      flex-direction: column;
      padding: 16px 20px;
    }
    nav {
      width: 100%;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 14px;
    }
    .identity {
      margin-right: auto;
    }
  }
</style>
